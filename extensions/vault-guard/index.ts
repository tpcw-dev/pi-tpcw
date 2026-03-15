/**
 * Vault Guard Extension
 *
 * The guardian layer for vault-powered workflows. Manages a three-state
 * lifecycle and injects the Sage persona when connected to a vault.
 *
 * State Machine:
 *   no-vault       — No vault-config.json found. Nudges user to /vault-setup.
 *   vault-exists   — Config found and vault path exists, but Obsidian CLI not reachable.
 *   connected      — Vault path exists AND Obsidian CLI is responsive.
 *
 * Hooks:
 *   session_start        — Detect state, query vault context, set footer, restore captures
 *   before_agent_start   — Inject system prompt (rules / Sage persona / vault context)
 *   tool_call            — Track vault CLI calls via bash, update footer
 *   tool_result          — Restore footer after transient search status
 *   session_before_compact — Enhanced compaction with knowledge extraction sections
 *
 * Commands:
 *   /vault-todo    — Show current vault todo tracking status
 *   /vault-capture — Capture knowledge for vault during session
 *   /vault-setup   — Guide user through vault configuration
 *
 * Usage:
 *   pi -e pi-tpcw/extensions/vault-guard
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";
import { complete } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { readFile, access, copyFile, mkdir } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, basename, dirname } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VaultState = "no-vault" | "vault-exists" | "connected";

interface VaultConfig {
  vault_path?: string;
  vault_name?: string;
  cli_path?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_PATH = resolve(homedir(), ".pi", "agent", "vault-config.json");
const DEFAULT_CLI_PATH = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";

const STATUS_ID = "vault-guard";

const FOOTER: Record<VaultState, string> = {
  "no-vault": "🔮 No vault configured — /vault-setup",
  "vault-exists": "🔮 Vault found (Obsidian offline)",
  connected: "🔮 Vault connected",
};

// ---------------------------------------------------------------------------
// CLI state — resolved from vault-config.json at runtime
// ---------------------------------------------------------------------------

let vaultName: string | null = null;
let cliPath: string = DEFAULT_CLI_PATH;

// ---------------------------------------------------------------------------
// Vault knowledge — loaded from data/vault-knowledge.md at runtime
// ---------------------------------------------------------------------------

const VAULT_KNOWLEDGE_PATH = resolve(
  __dirname, "..", "..", "data", "vault-knowledge.md",
);

const knowledgeSections: Record<string, string> = {};

async function loadVaultKnowledge(): Promise<void> {
  for (const key of Object.keys(knowledgeSections)) delete knowledgeSections[key];

  try {
    const raw = await readFile(VAULT_KNOWLEDGE_PATH, "utf-8");

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
   \`\`\`bash
   obsidian vault="<vault-name>" search query="<task topic>" format=json
   \`\`\`
2. If a matching todo exists, update its stage to "in-progress":
   \`\`\`bash
   obsidian vault="<vault-name>" property:set file="<todo-name>" name="stage" value="in-progress"
   \`\`\`
3. Only create a new todo if no existing one covers the same scope.

### After Completing Work
4. Update the todo stage to "review":
   \`\`\`bash
   obsidian vault="<vault-name>" property:set file="<todo-name>" name="stage" value="review"
   \`\`\`
5. Never set stage to "done" — that requires human approval.

### Stage Lifecycle: backlog → in-progress → review → done

### Rules
- ALWAYS search vault before creating new todos (avoid duplicates)
- ALWAYS use Obsidian CLI (via bash) — never modify vault files directly via write/edit
- ALWAYS update stage transitions — don't skip stages
- Keep todo scope focused — one todo per deliverable
- Use Obsidian CLI: search, eval, property:set, create, read commands
- Project todos live in: projects/{project-name}/`;

const DEFAULT_NO_VAULT_HINT = `## Vault Not Configured

No vault is currently configured. The user can run \`/vault-setup\` to create
a vault configuration. Until then, vault-related features are inactive.`;

// ---------------------------------------------------------------------------
// Enhanced compaction prompt — knowledge extraction sections
// ---------------------------------------------------------------------------

const SUMMARY_PROMPT = `You are a session summarizer. Create a structured summary of this conversation that captures everything needed to continue the work.

Use this exact format (omit empty sections):

## Goal
What the user is trying to accomplish.

## Progress
### Done
- [x] Completed tasks

### In Progress
- [ ] Current work

### Blocked
- Issues, if any

## Key Decisions
- **Decision**: Rationale for the choice

## Lessons Learned
- **Lesson**: What was learned, when it applies (debugging insights, gotchas, best practices)

## Ideas & Proposals
- **Idea**: Speculative suggestions or future improvements discussed

## Action Items
- **TODO**: Deferred work or action items identified but not yet done

## Patterns Observed
- **Pattern**: Recurring approaches, repeated solutions, cross-project similarities

## Next Steps
1. What should happen next

## Critical Context
- Data, paths, configurations needed to continue

Be thorough but concise. Include ALL information needed to continue effectively.
Only include sections that have actual content — do not fabricate items.`;

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

/**
 * Install bundled agent definitions to ~/.pi/agent/agents/ if they don't
 * already exist. Agents ship in pi-tpcw/agents/ and are copied on first
 * session_start so subagent discovery finds them.
 */
async function installBundledAgents(): Promise<void> {
  const bundledDir = resolve(dirname(dirname(__dirname)), "agents");
  const targetDir = resolve(homedir(), ".pi", "agent", "agents");

  if (!existsSync(bundledDir)) return;

  try {
    await mkdir(targetDir, { recursive: true });
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(bundledDir).filter((f: string) => f.endsWith(".md"));

    for (const file of files) {
      const target = resolve(targetDir, file);
      if (!existsSync(target)) {
        await copyFile(resolve(bundledDir, file), target);
      }
    }
  } catch {
    // Non-fatal — agents are a convenience, not a requirement
  }
}

async function loadConfig(): Promise<VaultConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw) as VaultConfig;

    // Resolve vault_name: explicit config → basename of vault_path
    if (config.vault_name) {
      vaultName = config.vault_name;
    } else if (config.vault_path) {
      vaultName = basename(expandHome(config.vault_path));
    }

    // Resolve cli_path: explicit config → platform default
    if (config.cli_path) {
      cliPath = config.cli_path;
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Execute an Obsidian CLI command against the configured vault.
 * Returns the trimmed stdout. For `eval` commands, strips the leading `=> ` prefix.
 * Throws on timeout (5s) or non-zero exit.
 *
 * Uses killSignal: "SIGKILL" to ensure Electron processes are fully terminated
 * on timeout, preventing zombie process accumulation.
 */
function execCli(args: string): string {
  const cmd = `"${cliPath}" vault="${vaultName}" ${args}`;
  try {
    const result = execSync(cmd, {
      timeout: 5_000,
      encoding: "utf-8",
      killSignal: "SIGKILL",
    }).trim();
    // `eval` results are prefixed with "=> "
    if (result.startsWith("=> ")) {
      return result.slice(3);
    }
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`CLI command failed: ${message}`);
  }
}

/**
 * Safely execute a CLI command, returning null on failure instead of throwing.
 */
function execCliSafe(args: string): string | null {
  try {
    return execCli(args);
  } catch {
    return null;
  }
}

function stageEmoji(stage: string): string {
  switch (stage) {
    case "in-progress": return "🔨";
    case "review": return "👀";
    case "done": return "✅";
    case "backlog": return "📋";
    default: return "📋";
  }
}

// ---------------------------------------------------------------------------
// Session context — queried from CLI on session_start
// ---------------------------------------------------------------------------

/**
 * Build a vault context block by querying the Obsidian CLI.
 * Returns a formatted string for system prompt injection, or empty string on failure.
 *
 * PERF: Uses a single `eval` call to gather all context at once.
 * Previous approach spawned 7 separate Obsidian processes via execSync,
 * each launching a full Electron instance. When Obsidian's IPC was slow
 * these accumulated as zombie processes and crashed the app.
 */
function buildVaultContext(): string {
  const sections: string[] = [];

  try {
    // --- Single batched eval: gather all context in one Obsidian process ---
    const batchCode = `
(function(){
  var files = app.vault.getMarkdownFiles();
  var result = { active:[], backlog:[], review:[], decisions:[], orphans:0, unresolved:0, openTasks:0 };

  files.forEach(function(f){
    var fm = app.metadataCache.getFileCache(f)?.frontmatter;
    if(!fm) return;

    if(fm.type==='todo' && fm.stage==='in-progress'){
      result.active.push({name:f.basename, priority:fm.priority||'medium', project:fm.project||'unknown'});
    }
    if(fm.type==='todo' && fm.stage==='backlog'){
      result.backlog.push({name:f.basename, priority:fm.priority||'medium', project:fm.project||'unknown'});
    }
    if(fm.type==='todo' && fm.stage==='review'){
      result.review.push({name:f.basename, project:fm.project||'unknown'});
    }
    if(fm.type==='decision'){
      var created = new Date(fm.created);
      if((Date.now()-created)<7*86400000){
        result.decisions.push({name:f.basename, created:fm.created});
      }
    }
  });

  var prio = {high:0, medium:1, low:2};
  result.backlog.sort(function(a,b){ return (prio[a.priority]??1)-(prio[b.priority]??1); });
  result.backlog = result.backlog.slice(0,5);

  var resolved = app.metadataCache.resolvedLinks || {};
  var allLinked = new Set();
  Object.values(resolved).forEach(function(targets){ Object.keys(targets).forEach(function(t){ allLinked.add(t); }); });
  var mdFiles = files.filter(function(f){ return f.extension==='md'; });
  result.orphans = mdFiles.filter(function(f){ return !allLinked.has(f.path); }).length;

  var unresolvedLinks = app.metadataCache.unresolvedLinks || {};
  var unresolvedCount = 0;
  Object.values(unresolvedLinks).forEach(function(targets){ unresolvedCount += Object.keys(targets).length; });
  result.unresolved = unresolvedCount;

  var taskCount = 0;
  mdFiles.forEach(function(f){
    var cache = app.metadataCache.getFileCache(f);
    if(cache?.listItems){
      cache.listItems.forEach(function(li){ if(li.task && li.task!==' ' && li.task!=='x') taskCount++; });
    }
  });
  result.openTasks = taskCount;

  return JSON.stringify(result);
})()
`.replace(/\n/g, ' ').trim();

    const raw = execCliSafe(`eval code="${batchCode.replace(/"/g, '\\"')}"`);

    if (raw) {
      const data = JSON.parse(raw) as {
        active: Array<{ name: string; priority: string; project: string }>;
        backlog: Array<{ name: string; priority: string; project: string }>;
        review: Array<{ name: string; project: string }>;
        decisions: Array<{ name: string; created: string }>;
        orphans: number;
        unresolved: number;
        openTasks: number;
      };

      if (data.active.length > 0) {
        sections.push("🔨 Active Todos (in-progress):");
        for (const t of data.active) {
          sections.push(`  - ${t.name} (project: ${t.project}, priority: ${t.priority})`);
        }
      }

      if (data.backlog.length > 0) {
        sections.push("\n📋 Backlog (top 5 by priority):");
        for (const t of data.backlog) {
          sections.push(`  - ${t.name} (priority: ${t.priority})`);
        }
      }

      if (data.review.length > 0) {
        sections.push("\n👀 Awaiting Review:");
        for (const t of data.review) {
          sections.push(`  - ${t.name} (${t.project})`);
        }
      }

      if (data.decisions.length > 0) {
        sections.push("\n🧠 Recent Decisions (last 7 days):");
        for (const d of data.decisions) {
          sections.push(`  - ${d.name} (${d.created})`);
        }
      }

      sections.push("\n🔗 Vault Health:");
      sections.push(`  Orphans: ${data.orphans} | Unresolved links: ${data.unresolved} | Open tasks: ${data.openTasks}`);
    }
  } catch {
    // Context building failed — non-fatal, return what we have
  }

  if (sections.length === 0) return "";

  return `\n## 📊 Vault Context (auto-loaded)\n\n${sections.join("\n")}`;
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
  let vaultContext: string = "";
  let captureCount = 0;

  // -------------------------------------------------------------------------
  // Detect vault state — probes Obsidian CLI
  // -------------------------------------------------------------------------

  async function detectState(): Promise<VaultState> {
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

    // 3. Probe Obsidian CLI — try to get vault info
    if (!vaultName) return "vault-exists";

    const probe = execCliSafe("vault info=name");
    if (probe !== null) {
      return "connected";
    }

    return "vault-exists";
  }

  // -------------------------------------------------------------------------
  // Hook: session_start — detect state, query context, set initial footer
  // -------------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    // Reset session tracking
    activeTodoPath = null;
    activeStage = null;
    vaultContext = "";
    captureCount = 0;

    // Restore capture count from session history
    for (const entry of ctx.sessionManager.getEntries()) {
      if (
        entry.type === "custom" &&
        (entry as any).customType === "vault-capture"
      ) {
        captureCount++;
      }
    }
    if (captureCount > 0) {
      ctx.ui.setStatus(
        "vault-capture",
        `📌 ${captureCount} capture${captureCount === 1 ? "" : "s"}`,
      );
    }

    // Load externalized persona/rules from data/vault-knowledge.md
    await loadVaultKnowledge();

    // Install bundled agent definitions to ~/.pi/agent/agents/ if missing
    await installBundledAgents();

    state = await detectState();

    ctx.ui.setStatus(STATUS_ID, FOOTER[state]);

    if (state === "connected") {
      ctx.ui.notify("🔮 Vault connected — Sage is active", "info");
      // Query vault context for system prompt injection
      vaultContext = buildVaultContext();
    } else if (state === "vault-exists") {
      ctx.ui.notify("🔮 Vault found but Obsidian offline — rules still active", "info");
    }
  });

  // -------------------------------------------------------------------------
  // Hook: before_agent_start — inject system prompt based on state
  // -------------------------------------------------------------------------

  pi.on("before_agent_start", async (event, _ctx) => {
    let injection = "";

    switch (state) {
      case "connected": {
        // Replace <vault-name> placeholder in loaded rules with actual vault name
        const rules = knowledgeSections.VAULT_TODO_RULES.replaceAll("<vault-name>", vaultName ?? "<vault>");
        injection = knowledgeSections.SAGE_PERSONA + "\n" + rules;
        if (vaultContext) {
          injection += "\n" + vaultContext;
        }
        break;
      }

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
  // Hook: tool_call — track vault CLI calls via bash, update footer
  // -------------------------------------------------------------------------

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const input = event.input as { command?: string };
    const cmd = input.command ?? "";

    // Only track commands that look like Obsidian CLI calls
    if (!cmd.includes("obsidian") && !cmd.includes("Obsidian")) return undefined;

    // Track property:set with name="stage" — stage transition
    const stageMatch = cmd.match(/property:set\s.*?name="stage"\s.*?value="([^"]+)"/);
    const fileMatch = cmd.match(/file="([^"]+)"/);

    if (stageMatch && fileMatch) {
      const stage = stageMatch[1];
      const file = fileMatch[1];
      activeTodoPath = file;
      activeStage = stage;

      const emoji = stageEmoji(stage);
      const shortName = file.replace(/\.md$/, "").split("/").pop() ?? file;
      ctx.ui.setStatus(STATUS_ID, `${emoji} ${shortName} → ${stage}`);
    }

    // Track search or eval — show searching indicator
    if (cmd.includes("search query=") || cmd.includes("eval code=")) {
      ctx.ui.setStatus(STATUS_ID, "🔍 Searching vault...");
    }

    return undefined; // never block
  });

  // -------------------------------------------------------------------------
  // Hook: tool_result — restore footer after transient states
  // -------------------------------------------------------------------------

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    // Check for CLI errors that indicate Obsidian is offline
    if (state === "connected") {
      const result = event.result;
      if (
        typeof result === "string" &&
        (result.includes("ECONNREFUSED") ||
          result.includes("connect ENOENT") ||
          result.includes("ETIMEDOUT") ||
          result.includes("Command failed"))
      ) {
        state = "vault-exists";
        ctx.ui.setStatus(STATUS_ID, FOOTER["vault-exists"]);
        ctx.ui.notify("🔮 Obsidian CLI connection lost — degraded to offline mode", "warning");
        return undefined;
      }
    }

    // Restore active todo footer, or default footer
    if (activeTodoPath && activeStage) {
      const emoji = stageEmoji(activeStage);
      const shortName =
        activeTodoPath.replace(/\.md$/, "").split("/").pop() ?? activeTodoPath;
      ctx.ui.setStatus(STATUS_ID, `${emoji} ${shortName} → ${activeStage}`);
    } else {
      ctx.ui.setStatus(STATUS_ID, FOOTER[state]);
    }

    return undefined; // never modify results
  });

  // -------------------------------------------------------------------------
  // Hook: session_before_compact — enhanced compaction with knowledge sections
  // -------------------------------------------------------------------------

  pi.on("session_before_compact", async (event, ctx) => {
    // Only enhance compaction when vault is connected
    if (state !== "connected") return undefined;

    const { preparation, signal } = event;
    const {
      messagesToSummarize,
      turnPrefixMessages,
      tokensBefore,
      firstKeptEntryId,
      previousSummary,
    } = preparation;

    // Use the current conversation model
    const model = ctx.model;
    if (!model) return undefined; // fall back to default

    const apiKey = await ctx.modelRegistry.getApiKey(model);
    if (!apiKey) return undefined; // fall back to default

    // Combine all messages
    const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
    if (allMessages.length === 0) return undefined;

    const conversationText = serializeConversation(
      convertToLlm(allMessages),
    );

    // Include previous summary for continuity
    const previousContext = previousSummary
      ? `\n\nPrevious session summary for additional context:\n${previousSummary}`
      : "";

    const messages = [
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: `${SUMMARY_PROMPT}${previousContext}

${event.customInstructions ? `Additional focus: ${event.customInstructions}\n` : ""}
<conversation>
${conversationText}
</conversation>`,
          },
        ],
        timestamp: Date.now(),
      },
    ];

    try {
      const response = await complete(
        model,
        { messages },
        { apiKey, maxTokens: 8192, signal },
      );

      const summary = response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      if (!summary.trim()) {
        if (!signal.aborted) {
          ctx.ui.notify("Enhanced summary was empty, using default", "warning");
        }
        return undefined;
      }

      return {
        compaction: {
          summary,
          firstKeptEntryId,
          tokensBefore,
        },
      };
    } catch (error) {
      if (!signal.aborted) {
        const msg = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Enhanced compaction failed: ${msg}`, "warning");
      }
      return undefined; // fall back to default
    }
  });

  // -------------------------------------------------------------------------
  // Hook: session_shutdown — reserved for future enrichment
  // -------------------------------------------------------------------------
  // Daily note logging removed — too noisy without meaningful context.
  // Future: summarize session accomplishments on shutdown, write vault entries.

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
  // Command: /vault-capture — mark knowledge during sessions
  // -------------------------------------------------------------------------

  pi.registerCommand("vault-capture", {
    description: 'Capture knowledge for vault: /vault-capture "text"',
    handler: async (args, ctx) => {
      // Strip surrounding quotes if present
      let text = args.trim();
      if (
        (text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'"))
      ) {
        text = text.slice(1, -1);
      }

      if (!text) {
        ctx.ui.notify(
          'Usage: /vault-capture "your knowledge here"',
          "warning",
        );
        return;
      }

      // Persist as a custom session entry (survives in JSONL)
      pi.appendEntry("vault-capture", {
        text,
        timestamp: new Date().toISOString(),
      });

      // Inject a message so the LLM is aware (and it shows in context)
      pi.sendMessage(
        {
          customType: "vault-capture",
          content: `📌 Captured for vault: "${text}"`,
          display: true,
          details: { text, timestamp: new Date().toISOString() },
        },
        { deliverAs: "nextTurn" },
      );

      captureCount++;
      ctx.ui.setStatus(
        "vault-capture",
        `📌 ${captureCount} capture${captureCount === 1 ? "" : "s"}`,
      );
      ctx.ui.notify(
        `📌 Captured: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`,
        "success",
      );
    },
  });

  // -------------------------------------------------------------------------
  // Message Renderer: vault-capture — themed capture display
  // -------------------------------------------------------------------------

  pi.registerMessageRenderer("vault-capture", (message, _options, theme) => {
    const text =
      theme.fg("accent", "📌 ") +
      theme.fg("success", "Vault Capture: ") +
      theme.italic(message.content as string);
    return new Text(text, 0, 0);
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
          `🔮 Vault already connected at: ${vaultPath ?? "unknown"} (vault: ${vaultName ?? "unknown"})`,
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

        // Derive vault name from path basename
        const derivedName = basename(resolvedVaultPath);

        // Write config with vault_name and cli_path
        const configContent = JSON.stringify(
          {
            vault_path: pathArg,
            vault_name: derivedName,
            cli_path: DEFAULT_CLI_PATH,
          },
          null,
          2,
        );

        try {
          const { mkdir, writeFile } = await import("node:fs/promises");
          const configDir = resolve(homedir(), ".pi", "agent");
          await mkdir(configDir, { recursive: true });
          await writeFile(CONFIG_PATH, configContent, "utf-8");

          vaultPath = resolvedVaultPath;
          vaultName = derivedName;

          // Probe CLI to set state
          const probe = execCliSafe("vault info=name");
          state = probe !== null ? "connected" : "vault-exists";

          ctx.ui.setStatus(STATUS_ID, FOOTER[state]);
          ctx.ui.notify(
            `🔮 Vault configured!\n  Path: ${resolvedVaultPath}\n  Name: ${derivedName}\n  CLI: ${cliPath}\n  Config: ${CONFIG_PATH}\n\n${state === "connected" ? "Sage is now active. The Crystal remembers." : "Obsidian is not running — start it for full connectivity."}`,
            state === "connected" ? "success" : "warning",
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

1. **A vault directory** — an Obsidian vault (folder of Markdown files).
   If you don't have one yet, create it:
   \`\`\`
   mkdir -p ~/vault
   \`\`\`

2. **Obsidian** installed and running. The CLI is built into Obsidian (v1.12.4+).
   Default binary: \`${DEFAULT_CLI_PATH}\`

## Quick setup

Run this command with the path to your vault:

\`\`\`
/vault-setup ~/path/to/your/vault
\`\`\`

This will create \`~/.pi/agent/vault-config.json\` with your vault path, name, and CLI path.

## Manual setup

Create the file yourself:

\`\`\`json
// ~/.pi/agent/vault-config.json
{
  "vault_path": "~/vault",
  "vault_name": "vault",
  "cli_path": "${DEFAULT_CLI_PATH}"
}
\`\`\`

## Config fields

- **vault_path** — Path to your Obsidian vault directory
- **vault_name** — Obsidian vault name (defaults to folder basename)
- **cli_path** — Path to Obsidian binary (defaults to macOS location)

## Current state

- **Config file:** ${await fileExists(CONFIG_PATH) ? "✅ exists" : "❌ not found"} (\`${CONFIG_PATH}\`)
- **pi agent dir:** ${piAgentExists ? "✅ exists" : "❌ not found"} (\`${piAgentDir}\`)
- **Vault state:** ${state}
${vaultPath ? `- **Vault path:** ${vaultPath}` : ""}
${vaultName ? `- **Vault name:** ${vaultName}` : ""}
`,
          display: true,
          details: { state, configPath: CONFIG_PATH },
        },
        { deliverAs: "nextTurn" },
      );
    },
  });

  // -------------------------------------------------------------------------
  // Message Renderer: vault-setup — render setup guide in TUI
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

      if (inCodeBlock) {
        rendered.push(theme.dim("  │ ") + theme.fg("accent", line));
        continue;
      }

      if (line.startsWith("# ")) {
        const title = line.slice(2).trim();
        rendered.push("");
        rendered.push(theme.bold(theme.fg("accent", `  ✦ ${title} ✦`)));
        rendered.push(theme.dim("  " + "─".repeat(Math.min(title.length + 6, 60))));
        rendered.push("");
        continue;
      }

      if (line.startsWith("## ")) {
        const heading = line.slice(3).trim();
        rendered.push("");
        rendered.push(theme.bold(theme.fg("success", `  ◆ ${heading}`)));
        rendered.push("");
        continue;
      }

      if (/^\d+\.\s/.test(line.trim())) {
        const styledLine = line.replace(
          /\*\*(.+?)\*\*/g,
          (_m, inner) => theme.bold(inner),
        );
        rendered.push(theme.fg("accent", "  ") + styledLine);
        continue;
      }

      if (line.trimStart().startsWith("- ")) {
        let styledLine = line;
        styledLine = styledLine.replace(
          /\*\*(.+?)\*\*/g,
          (_m, inner) => theme.bold(theme.fg("accent", inner)),
        );
        styledLine = styledLine.replace(
          /`([^`]+)`/g,
          (_m, inner) => theme.dim(inner),
        );
        styledLine = styledLine.replace("✅", theme.fg("success", "✅"));
        styledLine = styledLine.replace("❌", theme.fg("error", "❌"));
        rendered.push("  " + styledLine);
        continue;
      }

      if (line.includes("`")) {
        let styledLine = line.replace(
          /`([^`]+)`/g,
          (_m, inner) => theme.fg("accent", inner),
        );
        styledLine = styledLine.replace(
          /\*\*(.+?)\*\*/g,
          (_m, inner) => theme.bold(inner),
        );
        rendered.push("  " + styledLine);
        continue;
      }

      if (line.trim() === "") {
        rendered.push("");
        continue;
      }

      rendered.push("  " + line);
    }

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
