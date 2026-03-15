/**
 * Vault Guard Extension
 *
 * The guardian layer for vault-powered workflows. Manages a three-state
 * lifecycle and injects the Sage persona when connected to a vault.
 *
 * State Machine:
 *   no-vault       — No vault-config.json found. Nudges user to /vault-setup.
 *   vault-exists   — Config found and vault path exists, but MCP not reachable.
 *   connected      — Vault path exists AND MCP tools are responsive.
 *
 * Hooks:
 *   session_start        — Detect state, set footer
 *   before_agent_start   — Inject system prompt (rules / Sage persona)
 *   tool_call            — Track vault MCP calls, update footer
 *   tool_result          — Restore footer after transient search status
 *   session_before_compact — (reserved for future enrichment)
 *
 * Commands:
 *   /vault-todo   — Show current vault todo tracking status
 *   /vault-setup  — Guide user through vault configuration
 *
 * Usage:
 *   pi -e pi-tpcw/extensions/vault-guard
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VaultState = "no-vault" | "vault-exists" | "connected";

interface VaultConfig {
  vault_path?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_PATH = resolve(homedir(), ".pi", "agent", "vault-config.json");

const STATUS_ID = "vault-guard";

const FOOTER: Record<VaultState, string> = {
  "no-vault": "🔮 No vault configured — /vault-setup",
  "vault-exists": "🔮 Vault found (offline)",
  connected: "🔮 Vault connected",
};

// ---------------------------------------------------------------------------
// Vault knowledge — loaded from data/vault-knowledge.md at runtime
// ---------------------------------------------------------------------------

/**
 * Path to the externalized vault knowledge file.
 * Resolved relative to the extension's own location (two dirs up → pi-tpcw/).
 */
const VAULT_KNOWLEDGE_PATH = resolve(
  __dirname, "..", "..", "data", "vault-knowledge.md",
);

/**
 * Parsed sections from vault-knowledge.md, keyed by section name.
 * Populated once by loadVaultKnowledge() during session_start.
 */
const knowledgeSections: Record<string, string> = {};

/**
 * Load and parse vault-knowledge.md, splitting on <!-- SECTION: name --> markers.
 * Populates knowledgeSections. Falls back to hardcoded defaults on read failure.
 */
async function loadVaultKnowledge(): Promise<void> {
  // Clear any stale keys from a prior load (e.g. multiple session_start calls)
  for (const key of Object.keys(knowledgeSections)) delete knowledgeSections[key];

  try {
    const raw = await readFile(VAULT_KNOWLEDGE_PATH, "utf-8");

    // Split on section markers: <!-- SECTION: NAME -->
    const sectionRegex = /<!--\s*SECTION:\s*(\w+)\s*-->/g;
    let match: RegExpExecArray | null;
    const markers: { name: string; end: number }[] = [];

    while ((match = sectionRegex.exec(raw)) !== null) {
      markers.push({ name: match[1], end: match.index + match[0].length });
    }

    for (let i = 0; i < markers.length; i++) {
      const start = markers[i].end;
      const end = i + 1 < markers.length
        ? raw.lastIndexOf("<!--", markers[i + 1].end)
        : raw.length;
      knowledgeSections[markers[i].name] = raw.slice(start, end).trim();
    }
  } catch {
    // File not found or unreadable — fall through to defaults
  }

  // Apply defaults for any missing sections
  if (!knowledgeSections.SAGE_PERSONA) {
    knowledgeSections.SAGE_PERSONA = DEFAULT_SAGE_PERSONA;
  }
  if (!knowledgeSections.VAULT_TODO_RULES) {
    knowledgeSections.VAULT_TODO_RULES = DEFAULT_VAULT_TODO_RULES;
  }
  if (!knowledgeSections.NO_VAULT_HINT) {
    knowledgeSections.NO_VAULT_HINT = DEFAULT_NO_VAULT_HINT;
  }
}

// ---------------------------------------------------------------------------
// Hardcoded fallbacks — used only when data/vault-knowledge.md is missing
// ---------------------------------------------------------------------------

const DEFAULT_SAGE_PERSONA = `## Sage 🔮 — Vault Keeper Persona (Active)

You are Sage, the Vault Keeper — the living memory of the builder ecosystem.
You manage the Crystal (the vault) — the persistent knowledge layer that spans
sessions and projects.

### Identity & Style
- Wise, calm, observant, approachable.
- Subtle Final Fantasy Sage flavor — a sharp mentor who remembers everything,
  not a dusty librarian. Occasional phrases like "the Crystal remembers" or
  "I see a thread here" — sparingly, for flavor, never cosplay.
- Recall past sessions naturally: "Last time we touched this…"
- Spot patterns, surface them, grow the system.

### Principles
- Knowledge must persist across sessions — zero context reconstruction tax.
- Operational knowledge gets direct write; high-stakes items go through proposals.
- Decision lineage matters — capture not just what, but why, and when it changed.
- Organization by proxy — agents handle the organizing, the user doesn't have to.`;

const DEFAULT_VAULT_TODO_RULES = `## Vault Todo Integration (Active — enforced by vault-guard extension)

You MUST follow this protocol for every task:

### Before Starting Work
1. Search vault for existing todos related to your task:
   mcp({ tool: "vault_search_notes", args: '{"query": "<task topic>", "searchFrontmatter": true, "limit": 10}' })
2. If a matching todo exists, update its stage to "in-progress":
   mcp({ tool: "vault_update_frontmatter", args: '{"path": "<todo-path>", "frontmatter": {"stage": "in-progress"}}' })
3. Only create a new todo if no existing one covers the same scope.

### After Completing Work
4. Update the todo stage to "review":
   mcp({ tool: "vault_update_frontmatter", args: '{"path": "<todo-path>", "frontmatter": {"stage": "review"}}' })
5. Never set stage to "done" — that requires human approval.

### Stage Lifecycle: backlog → in-progress → review → done

### Rules
- ALWAYS search vault before creating new todos (avoid duplicates)
- ALWAYS use MCP vault tools — never modify vault files directly via write/edit
- ALWAYS update stage transitions — don't skip stages
- Keep todo scope focused — one todo per deliverable
- Use vault_search_notes and vault_update_frontmatter MCP tools
- Project todos live in: projects/{project-name}/`;

const DEFAULT_NO_VAULT_HINT = `## Vault Not Configured

No vault is currently configured. The user can run \`/vault-setup\` to create
a vault configuration. Until then, vault-related features are inactive.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

async function loadConfig(): Promise<VaultConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as VaultConfig;
  } catch {
    return null;
  }
}

function stageEmoji(stage: string): string {
  switch (stage) {
    case "in-progress":
      return "🔨";
    case "review":
      return "👀";
    case "done":
      return "✅";
    case "backlog":
      return "📋";
    default:
      return "📋";
  }
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function vaultGuard(pi: ExtensionAPI) {
  // Shared mutable state across hooks
  let state: VaultState = "no-vault";
  let vaultPath: string | null = null;
  let activeTodoPath: string | null = null;
  let activeStage: string | null = null;

  // -------------------------------------------------------------------------
  // Detect vault state
  // -------------------------------------------------------------------------

  async function detectState(ctx: {
    ui: { setStatus(id: string, text: string): void; notify(msg: string, level: string): void };
  }): Promise<VaultState> {
    // 1. Read config
    const config = await loadConfig();
    if (!config?.vault_path) {
      return "no-vault";
    }

    // 2. Check vault directory exists
    const resolvedPath = expandHome(config.vault_path);
    vaultPath = resolvedPath;

    if (!(await fileExists(resolvedPath))) {
      return "no-vault";
    }

    // 3. Probe MCP connection — attempt vault_list_directory on root
    //    We can't directly call MCP from an extension, but we can check
    //    that the vault path exists on disk. The actual MCP connection
    //    will be validated on first tool_call. Start optimistic if path exists.
    //    Downgrade to vault-exists if first MCP call fails.
    return "connected";
  }

  // -------------------------------------------------------------------------
  // Hook: session_start — detect state, set initial footer
  // -------------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    // Reset session tracking
    activeTodoPath = null;
    activeStage = null;

    // Load externalized persona/rules from data/vault-knowledge.md
    await loadVaultKnowledge();

    state = await detectState(ctx);

    ctx.ui.setStatus(STATUS_ID, FOOTER[state]);

    if (state === "connected") {
      ctx.ui.notify("🔮 Vault connected — Sage is active", "info");
    } else if (state === "vault-exists") {
      ctx.ui.notify("🔮 Vault found but MCP offline — rules still active", "info");
    }
  });

  // -------------------------------------------------------------------------
  // Hook: before_agent_start — inject system prompt based on state
  // -------------------------------------------------------------------------

  pi.on("before_agent_start", async (event, _ctx) => {
    let injection = "";

    switch (state) {
      case "connected":
        injection = knowledgeSections.SAGE_PERSONA + "\n" + knowledgeSections.VAULT_TODO_RULES;
        break;

      case "vault-exists":
        injection = knowledgeSections.VAULT_TODO_RULES;
        break;

      case "no-vault":
        injection = knowledgeSections.NO_VAULT_HINT;
        break;
    }

    return {
      systemPrompt: event.systemPrompt + "\n" + injection,
    };
  });

  // -------------------------------------------------------------------------
  // Hook: tool_call — track vault MCP calls, update footer
  // -------------------------------------------------------------------------

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "mcp") return undefined;

    const input = event.input as {
      tool?: string;
      args?: string;
      server?: string;
    };

    // Track vault_update_frontmatter for stage transitions
    if (input.tool === "vault_update_frontmatter" && input.args) {
      try {
        const args = JSON.parse(input.args);
        const path = args.path as string;
        const stage = args.frontmatter?.stage as string;

        if (path && stage) {
          activeTodoPath = path;
          activeStage = stage;

          const emoji = stageEmoji(stage);
          const shortName =
            path.split("/").pop()?.replace(".md", "") ?? path;
          ctx.ui.setStatus(STATUS_ID, `${emoji} ${shortName} → ${stage}`);
        }
      } catch {
        // args parsing failed — ignore
      }
    }

    // Track vault_search_notes — show searching indicator
    if (input.tool === "vault_search_notes") {
      ctx.ui.setStatus(STATUS_ID, "🔍 Searching vault...");
    }

    // If we see any vault MCP call succeed, we know we're connected
    if (input.tool?.startsWith("vault_") && state === "vault-exists") {
      state = "connected";
    }

    return undefined; // never block
  });

  // -------------------------------------------------------------------------
  // Hook: tool_result — restore footer after transient states
  // -------------------------------------------------------------------------

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "mcp") return undefined;

    // Check for MCP errors that indicate offline vault
    if (state === "connected") {
      const result = event.result;
      if (
        typeof result === "string" &&
        (result.includes("ECONNREFUSED") ||
          result.includes("MCP server not found") ||
          result.includes("could not connect"))
      ) {
        state = "vault-exists";
        ctx.ui.setStatus(STATUS_ID, FOOTER["vault-exists"]);
        ctx.ui.notify("🔮 Vault MCP connection lost — degraded to offline mode", "warning");
        return undefined;
      }
    }

    // Restore active todo footer, or default connected footer
    if (activeTodoPath && activeStage) {
      const emoji = stageEmoji(activeStage);
      const shortName =
        activeTodoPath.split("/").pop()?.replace(".md", "") ?? activeTodoPath;
      ctx.ui.setStatus(STATUS_ID, `${emoji} ${shortName} → ${activeStage}`);
    } else {
      ctx.ui.setStatus(STATUS_ID, FOOTER[state]);
    }

    return undefined; // never modify results
  });

  // -------------------------------------------------------------------------
  // Command: /vault-todo — show current todo tracking status
  // -------------------------------------------------------------------------

  pi.registerCommand("vault-todo", {
    description: "Show current vault todo tracking status",
    handler: async (_args, ctx) => {
      if (activeTodoPath) {
        ctx.ui.notify(
          `Active todo: ${activeTodoPath} (stage: ${activeStage ?? "unknown"})`,
          "info",
        );
      } else {
        ctx.ui.notify("No active todo tracked this session", "info");
      }
    },
  });

  // -------------------------------------------------------------------------
  // Command: /vault-setup — guide user through vault configuration
  // -------------------------------------------------------------------------

  pi.registerCommand("vault-setup", {
    description: "Configure vault connection (creates ~/.pi/agent/vault-config.json)",
    handler: async (args, ctx) => {
      // Check current state
      if (state === "connected") {
        ctx.ui.notify(
          `🔮 Vault already connected at: ${vaultPath ?? "unknown"}`,
          "info",
        );
        return;
      }

      // Check harness
      const piAgentDir = resolve(homedir(), ".pi", "agent");
      const piAgentExists = await fileExists(piAgentDir);

      if (!piAgentExists) {
        ctx.ui.notify(
          "⚠️ ~/.pi/agent/ directory not found. Ensure pi is installed and configured.",
          "warning",
        );
        return;
      }

      // If args provided, treat as vault path
      const pathArg = args.trim();
      if (pathArg) {
        const resolvedVaultPath = expandHome(pathArg);
        const vaultExists = await fileExists(resolvedVaultPath);

        if (!vaultExists) {
          ctx.ui.notify(
            `⚠️ Path does not exist: ${resolvedVaultPath}\nCreate your vault directory first, then re-run /vault-setup <path>`,
            "warning",
          );
          return;
        }

        // Write config
        const configContent = JSON.stringify(
          { vault_path: pathArg },
          null,
          2,
        );

        try {
          const { mkdir, writeFile } = await import("node:fs/promises");
          const configDir = resolve(homedir(), ".pi", "agent");
          await mkdir(configDir, { recursive: true });
          await writeFile(CONFIG_PATH, configContent, "utf-8");

          vaultPath = resolvedVaultPath;
          state = "connected";
          ctx.ui.setStatus(STATUS_ID, FOOTER[state]);
          ctx.ui.notify(
            `🔮 Vault configured!\n  Path: ${resolvedVaultPath}\n  Config: ${CONFIG_PATH}\n\nSage is now active. The Crystal remembers.`,
            "success",
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          ctx.ui.notify(`❌ Failed to write config: ${msg}`, "error");
        }

        return;
      }

      // No args — show instructions
      pi.sendMessage(
        {
          customType: "vault-setup",
          content: `# 🔮 Vault Setup

## What you need

1. **A vault directory** — an Obsidian vault or any folder of Markdown files.
   If you don't have one yet, create it:
   \`\`\`
   mkdir -p ~/vault
   \`\`\`

2. **MCP-Vault server** running and configured in pi's MCP settings.
   See: https://github.com/bitbonsai/mcpvault

## Quick setup

Run this command with the path to your vault:

\`\`\`
/vault-setup ~/path/to/your/vault
\`\`\`

This will create \`~/.pi/agent/vault-config.json\` with your vault path.

## Manual setup

Create the file yourself:

\`\`\`json
// ~/.pi/agent/vault-config.json
{
  "vault_path": "~/vault"
}
\`\`\`

## Current state

- **Config file:** ${await fileExists(CONFIG_PATH) ? "✅ exists" : "❌ not found"} (\`${CONFIG_PATH}\`)
- **pi agent dir:** ${piAgentExists ? "✅ exists" : "❌ not found"} (\`${piAgentDir}\`)
- **Vault state:** ${state}
${vaultPath ? `- **Vault path:** ${vaultPath}` : ""}
`,
          display: true,
          details: { state, configPath: CONFIG_PATH },
        },
        { deliverAs: "nextTurn" },
      );
    },
  });

  // -------------------------------------------------------------------------
  // Message Renderer: vault-setup — beautifully render setup guide in TUI
  // -------------------------------------------------------------------------

  pi.registerMessageRenderer("vault-setup", (message, _options, theme) => {
    const raw = (message.content as string) ?? "";
    const details = (message as any).details as
      | { state?: string; configPath?: string }
      | undefined;

    const lines = raw.split("\n");
    const rendered: string[] = [];
    let inCodeBlock = false;
    let codeBlockLang = "";

    for (const line of lines) {
      // Toggle code block state
      if (line.trimStart().startsWith("```")) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockLang = line.trimStart().slice(3).trim();
          const label = codeBlockLang
            ? theme.dim(`  ┌─ ${codeBlockLang} `)
            : theme.dim("  ┌──");
          rendered.push(label);
        } else {
          inCodeBlock = false;
          codeBlockLang = "";
          rendered.push(theme.dim("  └──"));
        }
        continue;
      }

      // Inside code block — dim with gutter
      if (inCodeBlock) {
        rendered.push(theme.dim("  │ ") + theme.fg("accent", line));
        continue;
      }

      // H1 heading — main title with crystal emoji
      if (line.startsWith("# ")) {
        const title = line.slice(2).trim();
        rendered.push("");
        rendered.push(theme.bold(theme.fg("accent", `  ✦ ${title} ✦`)));
        rendered.push(theme.dim("  " + "─".repeat(Math.min(title.length + 6, 60))));
        rendered.push("");
        continue;
      }

      // H2 heading — section headers
      if (line.startsWith("## ")) {
        const heading = line.slice(3).trim();
        rendered.push("");
        rendered.push(theme.bold(theme.fg("success", `  ◆ ${heading}`)));
        rendered.push("");
        continue;
      }

      // Numbered list items — with bold text between **
      if (/^\d+\.\s/.test(line.trim())) {
        const styledLine = line.replace(
          /\*\*(.+?)\*\*/g,
          (_m, inner) => theme.bold(inner),
        );
        rendered.push(theme.fg("accent", "  ") + styledLine);
        continue;
      }

      // Bullet list items with bold labels and status indicators
      if (line.trimStart().startsWith("- ")) {
        let styledLine = line;
        // Bold text
        styledLine = styledLine.replace(
          /\*\*(.+?)\*\*/g,
          (_m, inner) => theme.bold(theme.fg("accent", inner)),
        );
        // Inline code
        styledLine = styledLine.replace(
          /`([^`]+)`/g,
          (_m, inner) => theme.dim(inner),
        );
        // Status indicators
        styledLine = styledLine.replace("✅", theme.fg("success", "✅"));
        styledLine = styledLine.replace("❌", theme.fg("error", "❌"));
        rendered.push("  " + styledLine);
        continue;
      }

      // Inline code in regular text
      if (line.includes("`")) {
        let styledLine = line.replace(
          /`([^`]+)`/g,
          (_m, inner) => theme.fg("accent", inner),
        );
        // Bold text
        styledLine = styledLine.replace(
          /\*\*(.+?)\*\*/g,
          (_m, inner) => theme.bold(inner),
        );
        rendered.push("  " + styledLine);
        continue;
      }

      // Empty lines — preserve spacing
      if (line.trim() === "") {
        rendered.push("");
        continue;
      }

      // Default — regular text indented
      rendered.push("  " + line);
    }

    // Add a subtle state badge at the bottom if details available
    if (details?.state) {
      rendered.push("");
      const stateColors: Record<string, string> = {
        "no-vault": "error",
        "vault-exists": "warning",
        connected: "success",
      };
      const color = stateColors[details.state] ?? "accent";
      rendered.push(
        theme.dim("  ─────────────────────────────────────"),
      );
      rendered.push(
        "  " +
          theme.dim("State: ") +
          theme.fg(color as any, details.state) +
          (details.configPath
            ? theme.dim(` | Config: ${details.configPath}`)
            : ""),
      );
    }

    rendered.push("");

    return new Text(rendered.join("\n"), 0, 0);
  });
}
