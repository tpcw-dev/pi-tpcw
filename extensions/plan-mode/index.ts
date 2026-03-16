/**
 * Vault-Aware Plan Mode Extension
 *
 * Read-only exploration mode that produces plans persisted to the vault.
 * When a plan is finalized, it writes:
 *   1. A design/decision doc to the vault (type: decision)
 *   2. A linked todo for implementation handoff (type: todo, stage: backlog)
 *
 * The todo is designed to be picked up in a fresh session via /vault-todo,
 * keeping planning and implementation in separate context windows.
 *
 * Commands:
 *   /plan [topic]       — Toggle plan mode (optional topic seeds the exploration)
 *   /plan stop          — Exit plan mode without saving
 *   /plan save          — Force-save current plan to vault
 *   /todos              — Show current plan progress
 *   Ctrl+Alt+P          — Toggle plan mode (shortcut)
 *
 * Vault integration:
 *   - Searches vault for prior art before planning
 *   - Writes design doc as type:decision with plan body + steps
 *   - Creates linked todo as type:todo with checklist scope
 *   - Both entries link to each other via `related` frontmatter
 *   - Todo starts at stage:backlog for pickup in a fresh session
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { homedir } from "node:os";
import {
	isSafeCommand,
	extractPlanSteps,
	markCompletedSteps,
	buildPlanDocuments,
	type PlanStep,
	type PlanDocument,
} from "./utils.js";

// ---------------------------------------------------------------------------
// Tool sets
// ---------------------------------------------------------------------------

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "load_skill"];
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];

// ---------------------------------------------------------------------------
// Vault config
// ---------------------------------------------------------------------------

interface VaultConfig {
	vault_path?: string;
	vault_name?: string;
	cli_path?: string;
}

const CONFIG_PATH = resolve(homedir(), ".pi", "agent", "vault-config.json");

async function loadVaultConfig(): Promise<VaultConfig | null> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf-8");
		return JSON.parse(raw) as VaultConfig;
	} catch {
		return null;
	}
}

function expandHome(p: string): string {
	if (p.startsWith("~/") || p === "~") {
		return resolve(homedir(), p.slice(2));
	}
	return resolve(p);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function generateSessionId(): string {
	const date = new Date().toISOString().slice(0, 10);
	const rand = Math.random().toString(36).slice(2, 8);
	return `pi-plan-${date}-${rand}`;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function vaultPlanMode(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let executionMode = false;
	let planSteps: PlanStep[] = [];
	let planRawBody = "";
	let planTitle = "";
	let planProject = "";
	let sessionId = "";

	// Vault state
	let vaultConnected = false;
	let vaultName = "";
	let vaultPath = "";

	// -----------------------------------------------------------------------
	// CLI flag
	// -----------------------------------------------------------------------

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration → vault handoff)",
		type: "boolean",
		default: false,
	});

	// -----------------------------------------------------------------------
	// Status & widget
	// -----------------------------------------------------------------------

	function updateStatus(ctx: ExtensionContext): void {
		if (executionMode && planSteps.length > 0) {
			const completed = planSteps.filter((s) => s.completed).length;
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", `📋 ${completed}/${planSteps.length}`));
		} else if (planModeEnabled) {
			const vaultBadge = vaultConnected ? " 🔮" : "";
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", `⏸ plan${vaultBadge}`));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}

		if (executionMode && planSteps.length > 0) {
			const lines = planSteps.map((item) => {
				if (item.completed) {
					return (
						ctx.ui.theme.fg("success", "☑ ") +
						ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					);
				}
				return `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
			});
			ctx.ui.setWidget("plan-todos", lines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	// -----------------------------------------------------------------------
	// Plan mode toggle
	// -----------------------------------------------------------------------

	function enterPlanMode(ctx: ExtensionContext, topic?: string): void {
		planModeEnabled = true;
		executionMode = false;
		planSteps = [];
		planRawBody = "";
		planTitle = topic || "";
		sessionId = generateSessionId();

		pi.setActiveTools(PLAN_MODE_TOOLS);
		ctx.ui.notify(
			`⏸ Plan mode enabled — read-only exploration${vaultConnected ? "\n🔮 Vault connected — plan will be saved to Crystal" : ""}`,
		);
		updateStatus(ctx);
	}

	function exitPlanMode(ctx: ExtensionContext): void {
		planModeEnabled = false;
		executionMode = false;
		planSteps = [];
		planRawBody = "";
		planTitle = "";

		pi.setActiveTools(NORMAL_MODE_TOOLS);
		ctx.ui.notify("Plan mode disabled. Full access restored.");
		updateStatus(ctx);
	}

	// -----------------------------------------------------------------------
	// Vault write
	// -----------------------------------------------------------------------

	async function savePlanToVault(ctx: ExtensionContext): Promise<PlanDocument | null> {
		if (!vaultConnected) {
			ctx.ui.notify("🔮 Vault not connected — cannot save plan. Use /vault-setup first.", "warning");
			return null;
		}

		if (planSteps.length === 0) {
			ctx.ui.notify("No plan steps extracted. Create a plan with a 'Plan:' header first.", "warning");
			return null;
		}

		// Ask for title if not set
		if (!planTitle) {
			const titleInput = await ctx.ui.input("Plan title", "Enter a short title for this plan:");
			if (!titleInput?.trim()) {
				ctx.ui.notify("Plan save cancelled — title required.", "warning");
				return null;
			}
			planTitle = titleInput.trim();
		}

		// Ask for project if not set
		if (!planProject) {
			const projectInput = await ctx.ui.input(
				"Project",
				"Which project? (kebab-case, e.g. my-app):",
			);
			if (!projectInput?.trim()) {
				ctx.ui.notify("Plan save cancelled — project required.", "warning");
				return null;
			}
			planProject = projectInput.trim();
		}

		// Ask for tags
		const tagsInput = await ctx.ui.input(
			"Tags",
			"Tags (comma-separated, optional):",
		);
		const tags = tagsInput
			? tagsInput.split(",").map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean)
			: [];

		// Build documents
		const docs = buildPlanDocuments({
			title: planTitle,
			project: planProject,
			planBody: planRawBody || planSteps.map((s) => `${s.step}. ${s.text}`).join("\n"),
			steps: planSteps,
			sessionId,
			tags,
		});

		// Write to vault via MCP
		try {
			// Write design doc
			pi.sendUserMessage(
				`Save this plan to the vault. Write TWO vault notes using the vault MCP tools:

1. **Design doc** at path \`${docs.designDocPath}\`:
\`\`\`markdown
${docs.designDocContent}
\`\`\`

2. **Implementation todo** at path \`${docs.todoPath}\`:
\`\`\`markdown
${docs.todoContent}
\`\`\`

Use the Obsidian CLI to write each:
\`\`\`bash
obsidian vault="${vaultName}" create path="<path>" content="<content>" overwrite silent 2>/dev/null
\`\`\`
After writing both, confirm the paths and suggest picking up the todo in a fresh session.`,
				{ deliverAs: "followUp" },
			);

			ctx.ui.notify(
				`🔮 Saving plan to vault:\n  📄 ${docs.designDocPath}\n  ✅ ${docs.todoPath}\n\nThe todo is at stage:backlog — pick it up in a fresh session.`,
				"success",
			);

			return docs;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(`❌ Failed to save plan: ${msg}`, "error");
			return null;
		}
	}

	// -----------------------------------------------------------------------
	// Commands
	// -----------------------------------------------------------------------

	pi.registerCommand("plan", {
		description: "Toggle vault-aware plan mode (read-only → design doc + todo handoff)",
		handler: async (args, ctx) => {
			const trimmed = (args || "").trim();

			// /plan stop
			if (trimmed === "stop") {
				if (!planModeEnabled && !executionMode) {
					ctx.ui.notify("Plan mode is not active.", "info");
				} else {
					exitPlanMode(ctx);
				}
				return;
			}

			// /plan save
			if (trimmed === "save") {
				if (!planModeEnabled) {
					ctx.ui.notify("Not in plan mode. Use /plan first.", "warning");
					return;
				}
				await savePlanToVault(ctx);
				return;
			}

			// /plan status
			if (trimmed === "status") {
				if (!planModeEnabled && !executionMode) {
					ctx.ui.notify("Plan mode is not active.", "info");
				} else if (executionMode) {
					const completed = planSteps.filter((s) => s.completed).length;
					ctx.ui.notify(
						`Executing plan: ${completed}/${planSteps.length} steps complete\n` +
						`Title: ${planTitle || "(untitled)"}\nProject: ${planProject || "(unset)"}`,
						"info",
					);
				} else {
					ctx.ui.notify(
						`Plan mode active — ${planSteps.length} steps extracted\n` +
						`Title: ${planTitle || "(untitled)"}\nProject: ${planProject || "(unset)"}\n` +
						`Vault: ${vaultConnected ? "connected 🔮" : "offline"}`,
						"info",
					);
				}
				return;
			}

			// Toggle
			if (planModeEnabled) {
				// Exiting — ask if they want to save first
				if (planSteps.length > 0 && vaultConnected) {
					const save = await ctx.ui.confirm(
						"Save plan?",
						"Save plan to vault before exiting plan mode?",
					);
					if (save) {
						await savePlanToVault(ctx);
					}
				}
				exitPlanMode(ctx);
			} else {
				enterPlanMode(ctx, trimmed || undefined);

				// Seed with topic if provided
				if (trimmed) {
					// Search vault for prior art first
					if (vaultConnected) {
						pi.sendUserMessage(
							`I'm entering plan mode to explore: "${trimmed}"\n\n` +
							`Before planning, search the vault for any prior decisions, patterns, or related todos ` +
							`on this topic. Then analyze the codebase and create a detailed numbered plan.\n\n` +
							`Output your plan under a "Plan:" header with numbered steps.`,
						);
					} else {
						pi.sendUserMessage(
							`I'm entering plan mode to explore: "${trimmed}"\n\n` +
							`Analyze the codebase and create a detailed numbered plan.\n` +
							`Output your plan under a "Plan:" header with numbered steps.`,
						);
					}
				}
			}
		},
	});

	pi.registerCommand("todos", {
		description: "Show current plan steps and progress",
		handler: async (_args, ctx) => {
			if (planSteps.length === 0) {
				ctx.ui.notify("No plan steps. Start with /plan <topic>", "info");
				return;
			}
			const list = planSteps
				.map((item, i) => `${i + 1}. ${item.completed ? "✓" : "○"} ${item.text}`)
				.join("\n");
			ctx.ui.notify(
				`Plan: ${planTitle || "(untitled)"}\nProject: ${planProject || "(unset)"}\n\n${list}`,
				"info",
			);
		},
	});

	// -----------------------------------------------------------------------
	// Keyboard shortcut
	// -----------------------------------------------------------------------

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle vault-aware plan mode",
		handler: async (ctx) => {
			if (planModeEnabled) {
				if (planSteps.length > 0 && vaultConnected) {
					const save = await ctx.ui.confirm(
						"Save plan?",
						"Save plan to vault before exiting?",
					);
					if (save) await savePlanToVault(ctx);
				}
				exitPlanMode(ctx);
			} else {
				enterPlanMode(ctx);
			}
		},
	});

	// -----------------------------------------------------------------------
	// Hook: tool_call — block destructive bash in plan mode
	// -----------------------------------------------------------------------

	pi.on("tool_call", async (event) => {
		if (!planModeEnabled || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason:
					`Plan mode: command blocked (not in read-only allowlist).\n` +
					`Use /plan stop to disable plan mode first.\nCommand: ${command}`,
			};
		}
	});

	// -----------------------------------------------------------------------
	// Hook: context — strip stale plan-mode messages when not planning
	// -----------------------------------------------------------------------

	pi.on("context", async (event) => {
		if (planModeEnabled) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType === "plan-mode-context") return false;
				if (msg.role !== "user") return true;
				const content = msg.content;
				if (typeof content === "string") {
					return !content.includes("[VAULT PLAN MODE ACTIVE]");
				}
				if (Array.isArray(content)) {
					return !content.some(
						(c) => c.type === "text" && (c as TextContent).text?.includes("[VAULT PLAN MODE ACTIVE]"),
					);
				}
				return true;
			}),
		};
	});

	// -----------------------------------------------------------------------
	// Hook: before_agent_start — inject plan/execution context
	// -----------------------------------------------------------------------

	pi.on("before_agent_start", async () => {
		if (planModeEnabled) {
			const vaultClause = vaultConnected
				? `\n\nVault Integration:
- Search the vault for prior decisions, patterns, or related work before planning.
- When the plan is ready, the user will save it to the vault via /plan save.
- The plan becomes a design doc (type: decision) linked to an implementation todo (type: todo).
- The todo starts at stage: backlog — designed for pickup in a fresh session.
- Use vault search/read/eval via bash to query existing knowledge.`
				: "";

			return {
				message: {
					customType: "plan-mode-context",
					content: `[VAULT PLAN MODE ACTIVE]
You are in plan mode — a read-only exploration mode for safe code analysis.

Restrictions:
- You can only use: ${PLAN_MODE_TOOLS.join(", ")}
- You CANNOT use: edit, write (file modifications are disabled)
- Bash is restricted to read-only commands (plus vault search/read/eval)

Your job:
1. Analyze the codebase thoroughly — read files, search, understand structure
2. Create a detailed numbered plan under a "Plan:" header
3. Do NOT make any changes — just describe what should be done

Plan format:
\`\`\`
Plan:
1. First step description
2. Second step description
...
\`\`\`
${vaultClause}`,
					display: false,
				},
			};
		}

		if (executionMode && planSteps.length > 0) {
			const remaining = planSteps.filter((t) => !t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN — Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.
After completing a step, include a [DONE:n] tag in your response.`,
					display: false,
				},
			};
		}
	});

	// -----------------------------------------------------------------------
	// Hook: turn_end — track step completion during execution
	// -----------------------------------------------------------------------

	pi.on("turn_end", async (event, ctx) => {
		if (!executionMode || planSteps.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, planSteps) > 0) {
			updateStatus(ctx);
		}
		persistState();
	});

	// -----------------------------------------------------------------------
	// Hook: agent_end — extract plan steps, prompt for next action
	// -----------------------------------------------------------------------

	pi.on("agent_end", async (event, ctx) => {
		// Check if execution is complete
		if (executionMode && planSteps.length > 0) {
			if (planSteps.every((s) => s.completed)) {
				const completedList = planSteps.map((s) => `~~${s.text}~~`).join("\n");
				pi.sendMessage(
					{
						customType: "plan-complete",
						content: `**Plan Complete!** ✓\n\n${completedList}`,
						display: true,
					},
					{ triggerTurn: false },
				);
				executionMode = false;
				planSteps = [];
				pi.setActiveTools(NORMAL_MODE_TOOLS);
				updateStatus(ctx);
				persistState();
			}
			return;
		}

		if (!planModeEnabled || !ctx.hasUI) return;

		// Extract plan steps from last assistant message
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const fullText = getTextContent(lastAssistant);
			const extracted = extractPlanSteps(fullText);
			if (extracted.length > 0) {
				planSteps = extracted;
				// Capture the raw plan body for the design doc
				const planMatch = fullText.match(/\*{0,2}Plan:\*{0,2}\s*\n([\s\S]*?)(?:\n## |\n---|\n\*{0,2}[A-Z]|\Z)/i);
				if (planMatch) {
					planRawBody = planMatch[1].trim();
				} else {
					planRawBody = fullText;
				}
			}
		}

		if (planSteps.length > 0) {
			const todoListText = planSteps.map((s) => `${s.step}. ☐ ${s.text}`).join("\n");
			pi.sendMessage(
				{
					customType: "plan-steps",
					content: `**Plan Steps (${planSteps.length}):**\n\n${todoListText}`,
					display: true,
				},
				{ triggerTurn: false },
			);
		}

		// Build choices
		const choices: string[] = [];
		if (vaultConnected && planSteps.length > 0) {
			choices.push("💾 Save to vault & create todo (recommended)");
		}
		if (planSteps.length > 0) {
			choices.push("▶️  Execute now in this session");
		}
		choices.push("📝 Refine the plan");
		choices.push("⏹  Exit plan mode");

		const choice = await ctx.ui.select("Plan mode — what next?", choices);

		if (choice?.includes("Save to vault")) {
			const docs = await savePlanToVault(ctx);
			if (docs) {
				// Stay in plan mode or exit
				const afterSave = await ctx.ui.select("Plan saved. What now?", [
					"⏹  Exit plan mode (pick up todo in a fresh session)",
					"▶️  Execute now anyway",
				]);
				if (afterSave?.includes("Execute")) {
					planModeEnabled = false;
					executionMode = true;
					pi.setActiveTools(NORMAL_MODE_TOOLS);
					updateStatus(ctx);
					pi.sendMessage(
						{
							customType: "plan-mode-execute",
							content: `Execute the plan. Start with: ${planSteps[0].text}`,
							display: true,
						},
						{ triggerTurn: true },
					);
				} else {
					exitPlanMode(ctx);
				}
			}
		} else if (choice?.includes("Execute now")) {
			planModeEnabled = false;
			executionMode = planSteps.length > 0;
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			updateStatus(ctx);

			const execMessage = planSteps.length > 0
				? `Execute the plan. Start with: ${planSteps[0].text}`
				: "Execute the plan you just created.";
			pi.sendMessage(
				{ customType: "plan-mode-execute", content: execMessage, display: true },
				{ triggerTurn: true },
			);
		} else if (choice?.includes("Refine")) {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendUserMessage(refinement.trim());
			}
		} else if (choice?.includes("Exit")) {
			exitPlanMode(ctx);
		}
	});

	// -----------------------------------------------------------------------
	// State persistence
	// -----------------------------------------------------------------------

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: planModeEnabled,
			steps: planSteps,
			executing: executionMode,
			title: planTitle,
			project: planProject,
			rawBody: planRawBody,
			sessionId,
		});
	}

	// -----------------------------------------------------------------------
	// Session start — restore state & detect vault
	// -----------------------------------------------------------------------

	pi.on("session_start", async (_event, ctx) => {
		// Reset
		planModeEnabled = false;
		executionMode = false;
		planSteps = [];
		planRawBody = "";
		planTitle = "";
		planProject = "";
		vaultConnected = false;
		vaultName = "";
		vaultPath = "";

		// Detect vault
		const config = await loadVaultConfig();
		if (config?.vault_path) {
			vaultPath = expandHome(config.vault_path);
			vaultName = config.vault_name || basename(vaultPath);

			// Check if vault-guard already detected connection
			// We just check if the config exists — vault-guard handles the actual CLI probe
			vaultConnected = true;
		}

		// Check --plan flag
		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
			sessionId = generateSessionId();
		}

		// Restore persisted state from session
		const entries = ctx.sessionManager.getEntries();
		const planEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as {
				data?: {
					enabled: boolean;
					steps?: PlanStep[];
					executing?: boolean;
					title?: string;
					project?: string;
					rawBody?: string;
					sessionId?: string;
				};
			} | undefined;

		if (planEntry?.data) {
			planModeEnabled = planEntry.data.enabled ?? planModeEnabled;
			planSteps = planEntry.data.steps ?? planSteps;
			executionMode = planEntry.data.executing ?? executionMode;
			planTitle = planEntry.data.title ?? planTitle;
			planProject = planEntry.data.project ?? planProject;
			planRawBody = planEntry.data.rawBody ?? planRawBody;
			sessionId = planEntry.data.sessionId ?? sessionId;
		}

		// Rebuild step completion from messages on resume
		if (planEntry && executionMode && planSteps.length > 0) {
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			const messages: AssistantMessage[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i];
				if (entry.type === "message" && "message" in entry && isAssistantMessage(entry.message as AgentMessage)) {
					messages.push(entry.message as AssistantMessage);
				}
			}
			const allText = messages.map(getTextContent).join("\n");
			markCompletedSteps(allText, planSteps);
		}

		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
		}
		updateStatus(ctx);
	});
}
