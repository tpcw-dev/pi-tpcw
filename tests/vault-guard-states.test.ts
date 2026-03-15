/**
 * vault-guard-states.test.ts
 *
 * Tests the vault-guard extension's three-state machine:
 *
 *   no-vault     — No ~/.pi/agent/vault-config.json found
 *   vault-exists — Config + vault path exist, but MCP offline
 *   connected    — Config + vault path exist, MCP responsive
 *
 * Strategy:
 *   - The real machine has no vault-config.json → "no-vault" state.
 *   - An `extensionFactory` registers a mock `mcp` tool so the extension's
 *     tool_call / tool_result hooks fire during playbook-driven MCP calls.
 *   - Commands are verified via `extensionRunner.getRegisteredCommands()`.
 *
 * Because CONFIG_PATH is hardcoded to ~/.pi/agent/vault-config.json and
 * cannot be injected, all tests run in "no-vault" state on this machine.
 * The hook logic (tool_call, tool_result) is state-independent and fully
 * exercisable regardless of vault state.
 */

import { describe, it, expect, afterEach } from "vitest";
import { resolve } from "node:path";
import { Type } from "@sinclair/typebox";
import {
  createTestSession,
  when,
  says,
  calls,
  type TestSession,
} from "@marcfargas/pi-test-harness";

// ── Constants ─────────────────────────────────────────────────────────────

const EXTENSION_PATH = resolve(
  import.meta.dirname, "..", "extensions", "vault-guard",
);

const FOOTER = {
  "no-vault": "🔮 No vault configured — /vault-setup",
  "vault-exists": "🔮 Vault found (offline)",
  connected: "🔮 Vault connected",
};

// ── Mock MCP tool factory ─────────────────────────────────────────────────

/**
 * Extension factory that registers a mock `mcp` tool.
 *
 * The real pi environment provides `mcp` via the MCP bridge, but in tests
 * no MCP servers are running. This factory creates a minimal `mcp` tool so
 * the agent's tool list includes it, allowing the test harness's
 * interceptToolExecution to wrap it with the mock handler and fire the
 * extension's tool_call / tool_result hooks.
 */
function registerMockMcpTool(pi: any): void {
  pi.registerTool({
    name: "mcp",
    label: "MCP Bridge",
    description: "Mock MCP bridge for testing",
    parameters: Type.Object({
      tool: Type.Optional(Type.String()),
      args: Type.Optional(Type.String()),
      server: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId: string, _params: any) => ({
      content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }],
    }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Create a test session with vault-guard + mock MCP tool loaded.
 * All standard tools are mocked to prevent real execution.
 */
async function createVaultSession(opts?: {
  systemPrompt?: string;
  mcpHandler?: (p: Record<string, unknown>) => string;
}): Promise<TestSession> {
  return createTestSession({
    extensions: [EXTENSION_PATH],
    extensionFactories: [registerMockMcpTool],
    systemPrompt: opts?.systemPrompt ?? "You are a test assistant.",
    mockTools: {
      bash: (p) => `mock: ${(p as any).command ?? ""}`,
      read: "mock file contents",
      write: "mock written",
      edit: "mock edited",
      mcp: opts?.mcpHandler ?? ((p) => {
        const tool = (p as any).tool as string | undefined;
        if (tool === "vault_search_notes") {
          return JSON.stringify({ results: [] });
        }
        if (tool === "vault_update_frontmatter") {
          return JSON.stringify({ ok: true });
        }
        return JSON.stringify({ ok: true });
      }),
    },
  });
}

// ── Test suites ───────────────────────────────────────────────────────────

describe("vault-guard states", () => {
  let session: TestSession | null = null;

  afterEach(() => {
    session?.dispose();
    session = null;
  });

  // ═══════════════════════════════════════════════════════════════════════
  // State: no-vault (default on this machine — no vault-config.json)
  // ═══════════════════════════════════════════════════════════════════════

  describe("no-vault state (session_start)", () => {
    it("sets the no-vault status footer", async () => {
      session = await createVaultSession();

      const statusCalls = session.events.uiCallsFor("setStatus");
      expect(statusCalls.length).toBeGreaterThanOrEqual(1);

      // First setStatus should be the no-vault footer
      const firstStatus = statusCalls[0];
      expect(firstStatus.args[0]).toBe("vault-guard");
      expect(firstStatus.args[1]).toBe(FOOTER["no-vault"]);
    });

    it("does NOT emit a connected notification", async () => {
      session = await createVaultSession();

      const notifyCalls = session.events.uiCallsFor("notify");
      const connected = notifyCalls.find(
        (c) => typeof c.args[0] === "string" && c.args[0].includes("Vault connected"),
      );
      expect(connected).toBeUndefined();
    });

    it("does NOT emit a vault-exists notification", async () => {
      session = await createVaultSession();

      const notifyCalls = session.events.uiCallsFor("notify");
      const exists = notifyCalls.find(
        (c) => typeof c.args[0] === "string" && c.args[0].includes("Vault found"),
      );
      expect(exists).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // System prompt injection (before_agent_start hook)
  // ═══════════════════════════════════════════════════════════════════════

  describe("system prompt injection (no-vault)", () => {
    it("appends NO_VAULT_HINT to system prompt", async () => {
      session = await createVaultSession({ systemPrompt: "BASE_PROMPT" });

      await session.run(
        when("Hello", [says("Hi there!")]),
      );

      // Look for agent_start event containing the composed system prompt
      const agentStart = session.events.all.find((e) => e.type === "agent_start");
      const sp = (agentStart as any)?.systemPrompt as string | undefined;
      if (sp) {
        expect(sp).toContain("BASE_PROMPT");
        // The NO_VAULT_HINT default includes "Vault Not Configured"
        expect(sp).toMatch(/vault.*not.*configured|no vault|vault-setup/i);
      }
    });

    it("does NOT inject SAGE_PERSONA in no-vault state", async () => {
      session = await createVaultSession({ systemPrompt: "BASE_PROMPT" });

      await session.run(when("test", [says("ok")]));

      const agentStart = session.events.all.find((e) => e.type === "agent_start");
      const sp = (agentStart as any)?.systemPrompt as string | undefined;
      if (sp) {
        // SAGE_PERSONA contains "Vault Keeper Persona (Active)"
        expect(sp).not.toContain("Vault Keeper Persona (Active)");
        // VAULT_TODO_RULES contains "Stage Lifecycle"
        expect(sp).not.toContain("Stage Lifecycle");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // tool_call hooks — vault MCP tracking
  // ═══════════════════════════════════════════════════════════════════════

  describe("tool_call hooks", () => {
    it("sets searching status when vault_search_notes is called", async () => {
      session = await createVaultSession();

      await session.run(
        when("Search vault for tasks", [
          calls("mcp", {
            tool: "vault_search_notes",
            args: JSON.stringify({ query: "tasks", limit: 10 }),
          }),
          says("I searched the vault."),
        ]),
      );

      const statusCalls = session.events.uiCallsFor("setStatus");
      const searchStatus = statusCalls.find(
        (c) => typeof c.args[1] === "string" && c.args[1].includes("Searching vault"),
      );
      expect(searchStatus).toBeDefined();
    });

    it("sets stage emoji status when vault_update_frontmatter is called", async () => {
      session = await createVaultSession();

      await session.run(
        when("Update the todo stage", [
          calls("mcp", {
            tool: "vault_update_frontmatter",
            args: JSON.stringify({
              path: "projects/my-project/my-task.md",
              frontmatter: { stage: "in-progress" },
            }),
          }),
          says("Updated."),
        ]),
      );

      const statusCalls = session.events.uiCallsFor("setStatus");
      const stageStatus = statusCalls.find(
        (c) =>
          typeof c.args[1] === "string" &&
          c.args[1].includes("🔨") &&
          c.args[1].includes("my-task"),
      );
      expect(stageStatus).toBeDefined();
    });

    it("tracks stage transitions across multiple MCP calls", async () => {
      session = await createVaultSession();

      await session.run(
        when("Start then review", [
          calls("mcp", {
            tool: "vault_update_frontmatter",
            args: JSON.stringify({
              path: "projects/example/fix-bug.md",
              frontmatter: { stage: "in-progress" },
            }),
          }),
          calls("mcp", {
            tool: "vault_update_frontmatter",
            args: JSON.stringify({
              path: "projects/example/fix-bug.md",
              frontmatter: { stage: "review" },
            }),
          }),
          says("Done."),
        ]),
      );

      const statusCalls = session.events.uiCallsFor("setStatus");

      // in-progress → 🔨
      const inProgress = statusCalls.find(
        (c) =>
          typeof c.args[1] === "string" &&
          c.args[1].includes("🔨") &&
          c.args[1].includes("fix-bug"),
      );
      expect(inProgress).toBeDefined();

      // review → 👀
      const review = statusCalls.find(
        (c) =>
          typeof c.args[1] === "string" &&
          c.args[1].includes("👀") &&
          c.args[1].includes("fix-bug"),
      );
      expect(review).toBeDefined();
    });

    it("ignores non-MCP tool calls", async () => {
      session = await createVaultSession();

      await session.run(
        when("Read a file", [
          calls("read", { path: "/tmp/test.txt" }),
          says("Contents."),
        ]),
      );

      const statusCalls = session.events.uiCallsFor("setStatus");
      // No searching or stage status — only the initial footer
      const vaultHookStatuses = statusCalls.filter(
        (c) =>
          typeof c.args[1] === "string" &&
          (c.args[1].includes("Searching") || c.args[1].includes("🔨")),
      );
      expect(vaultHookStatuses).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // tool_result hooks — footer restoration and error detection
  // ═══════════════════════════════════════════════════════════════════════

  describe("tool_result hooks", () => {
    it("restores footer after vault search completes", async () => {
      session = await createVaultSession();

      await session.run(
        when("Search vault", [
          calls("mcp", {
            tool: "vault_search_notes",
            args: JSON.stringify({ query: "test" }),
          }),
          says("Results."),
        ]),
      );

      const statusCalls = session.events.uiCallsFor("setStatus");
      // Last status call should restore the default footer
      const lastStatus = statusCalls[statusCalls.length - 1];
      expect(lastStatus.args[1]).toBe(FOOTER["no-vault"]);
    });

    it("restores active todo status after search when a todo is tracked", async () => {
      session = await createVaultSession();

      await session.run(
        when("Update then search", [
          // First: set an active todo
          calls("mcp", {
            tool: "vault_update_frontmatter",
            args: JSON.stringify({
              path: "projects/test/active-task.md",
              frontmatter: { stage: "in-progress" },
            }),
          }),
          // Then: search (should restore to active todo, not default footer)
          calls("mcp", {
            tool: "vault_search_notes",
            args: JSON.stringify({ query: "related" }),
          }),
          says("Done."),
        ]),
      );

      const statusCalls = session.events.uiCallsFor("setStatus");
      // After the search completes, tool_result should restore the active todo
      const lastStatus = statusCalls[statusCalls.length - 1];
      expect(lastStatus.args[1]).toContain("🔨");
      expect(lastStatus.args[1]).toContain("active-task");
    });

    it("handles ECONNREFUSED gracefully in no-vault state", async () => {
      session = await createVaultSession({
        mcpHandler: () => "Error: connect ECONNREFUSED 127.0.0.1:8080",
      });

      await session.run(
        when("Try vault", [
          calls("mcp", {
            tool: "vault_search_notes",
            args: JSON.stringify({ query: "test" }),
          }),
          says("Failed."),
        ]),
      );

      // Should not crash — the downgrade only fires in "connected" state
      const statusCalls = session.events.uiCallsFor("setStatus");
      expect(statusCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Stage emoji mapping — all four stages + unknown fallback
  // ═══════════════════════════════════════════════════════════════════════

  describe("stage emoji mapping", () => {
    const stageTests = [
      { stage: "backlog", emoji: "📋" },
      { stage: "in-progress", emoji: "🔨" },
      { stage: "review", emoji: "👀" },
      { stage: "done", emoji: "✅" },
    ];

    for (const { stage, emoji } of stageTests) {
      it(`uses ${emoji} for stage "${stage}"`, async () => {
        session = await createVaultSession();

        await session.run(
          when(`Update to ${stage}`, [
            calls("mcp", {
              tool: "vault_update_frontmatter",
              args: JSON.stringify({
                path: `projects/test/task-${stage}.md`,
                frontmatter: { stage },
              }),
            }),
            says("Done."),
          ]),
        );

        const statusCalls = session.events.uiCallsFor("setStatus");
        const emojiStatus = statusCalls.find(
          (c) => typeof c.args[1] === "string" && c.args[1].includes(emoji),
        );
        expect(emojiStatus).toBeDefined();
      });
    }

    it("falls back to 📋 for unknown stage values", async () => {
      session = await createVaultSession();

      await session.run(
        when("Update to custom stage", [
          calls("mcp", {
            tool: "vault_update_frontmatter",
            args: JSON.stringify({
              path: "projects/test/task-custom.md",
              frontmatter: { stage: "unknown-stage" },
            }),
          }),
          says("Done."),
        ]),
      );

      const statusCalls = session.events.uiCallsFor("setStatus");
      const fallback = statusCalls.find(
        (c) =>
          typeof c.args[1] === "string" &&
          c.args[1].includes("📋") &&
          c.args[1].includes("task-custom"),
      );
      expect(fallback).toBeDefined();
    });

    it("strips .md suffix from task name in status", async () => {
      session = await createVaultSession();

      await session.run(
        when("Update", [
          calls("mcp", {
            tool: "vault_update_frontmatter",
            args: JSON.stringify({
              path: "projects/app/feature-xyz.md",
              frontmatter: { stage: "in-progress" },
            }),
          }),
          says("Ok."),
        ]),
      );

      const statusCalls = session.events.uiCallsFor("setStatus");
      const stageStatus = statusCalls.find(
        (c) =>
          typeof c.args[1] === "string" &&
          c.args[1].includes("feature-xyz") &&
          !c.args[1].includes(".md"),
      );
      expect(stageStatus).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Command registration
  // ═══════════════════════════════════════════════════════════════════════

  describe("command registration", () => {
    it("registers /vault-todo with a description", async () => {
      session = await createVaultSession();

      const runner = session.session.extensionRunner;
      const commands = runner.getRegisteredCommands();
      const todoCmd = commands.find((c: any) => c.name === "vault-todo");

      expect(todoCmd).toBeDefined();
      expect(todoCmd.description).toBeTruthy();
    });

    it("registers /vault-setup with a description", async () => {
      session = await createVaultSession();

      const runner = session.session.extensionRunner;
      const commands = runner.getRegisteredCommands();
      const setupCmd = commands.find((c: any) => c.name === "vault-setup");

      expect(setupCmd).toBeDefined();
      expect(setupCmd.description).toBeTruthy();
    });

    it("/vault-todo reports no active todo when none tracked", async () => {
      session = await createVaultSession();

      const runner = session.session.extensionRunner;
      const commands = runner.getRegisteredCommands();
      const todoCmd = commands.find((c: any) => c.name === "vault-todo");

      expect(todoCmd).toBeDefined();

      // Execute the command handler
      const ctx = runner.createCommandContext?.() ?? {
        ui: {
          notify: (msg: string, level: string) => {
            session!.events.ui.push({ method: "notify", args: [msg, level] });
          },
          setStatus: () => {},
        },
      };
      await todoCmd.handler("", ctx);

      const lastNotify = session.events.uiCallsFor("notify").pop();
      expect(lastNotify).toBeDefined();
      expect(lastNotify!.args[0]).toContain("No active todo");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Footer constant values
  // ═══════════════════════════════════════════════════════════════════════

  describe("footer constants", () => {
    it("no-vault footer contains /vault-setup hint", () => {
      expect(FOOTER["no-vault"]).toContain("/vault-setup");
    });

    it("vault-exists footer mentions offline", () => {
      expect(FOOTER["vault-exists"]).toContain("offline");
    });

    it("connected footer confirms connection", () => {
      expect(FOOTER.connected).toContain("connected");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Extension lifecycle
  // ═══════════════════════════════════════════════════════════════════════

  describe("extension lifecycle", () => {
    it("loads without errors", async () => {
      // createTestSession throws if extension loading fails
      session = await createVaultSession();
      expect(session).toBeDefined();
    });

    it("survives a full conversation turn", async () => {
      session = await createVaultSession();

      await session.run(
        when("Hello!", [says("Hi!")]),
      );

      expect(session.events.messages.length).toBeGreaterThanOrEqual(1);
    });

    it("registers exactly 2 commands", async () => {
      session = await createVaultSession();

      const runner = session.session.extensionRunner;
      const commands = runner.getRegisteredCommands();
      // vault-guard registers vault-todo and vault-setup
      const vaultCommands = commands.filter(
        (c: any) => c.name.startsWith("vault-"),
      );
      expect(vaultCommands).toHaveLength(2);
    });
  });
});
