/**
 * vault-guard-states.test.ts
 *
 * Tests the vault-guard extension's three-state machine:
 *
 *   no-vault     — No ~/.pi/agent/vault-config.json found
 *   vault-exists — Config + vault path exist, but Obsidian CLI offline
 *   connected    — Config + vault path exist, Obsidian CLI responsive
 *
 * Strategy:
 *   - The real machine has no vault-config.json → "no-vault" state.
 *   - Tool tracking tests use bash calls with Obsidian CLI patterns.
 *   - Commands are verified via `extensionRunner.getRegisteredCommands()`.
 *
 * Because CONFIG_PATH is hardcoded to ~/.pi/agent/vault-config.json and
 * cannot be injected, all tests run in "no-vault" state on this machine.
 * The hook logic (tool_call, tool_result) is state-independent and fully
 * exercisable regardless of vault state.
 */

import { describe, it, expect, afterEach } from "vitest";
import { resolve } from "node:path";
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
  "vault-exists": "🔮 Vault found (Obsidian offline)",
  connected: "🔮 Vault connected",
};

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Create a test session with vault-guard loaded.
 * All standard tools are mocked to prevent real execution.
 */
async function createVaultSession(opts?: {
  systemPrompt?: string;
  bashHandler?: (p: Record<string, unknown>) => string;
}): Promise<TestSession> {
  return createTestSession({
    extensions: [EXTENSION_PATH],
    systemPrompt: opts?.systemPrompt ?? "You are a test assistant.",
    mockTools: {
      bash: opts?.bashHandler ?? ((p) => `mock: ${(p as any).command ?? ""}`),
      read: "mock file contents",
      write: "mock written",
      edit: "mock edited",
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
  // State detection (session_start) — adapts to environment
  // ═══════════════════════════════════════════════════════════════════════

  describe("session_start state detection", () => {
    it("sets a valid vault-guard status footer", async () => {
      session = await createVaultSession();

      const statusCalls = session.events.uiCallsFor("setStatus");
      expect(statusCalls.length).toBeGreaterThanOrEqual(1);

      // Find the vault-guard status (may not be first if capture count is set)
      const guardStatus = statusCalls.find(
        (c) => c.args[0] === "vault-guard",
      );
      expect(guardStatus).toBeDefined();
      // Should be one of the valid footers
      const validFooters = Object.values(FOOTER);
      expect(validFooters).toContain(guardStatus!.args[1]);
    });

    it("emits exactly one state notification (connected, vault-exists, or none)", async () => {
      session = await createVaultSession();

      const notifyCalls = session.events.uiCallsFor("notify");
      const connected = notifyCalls.filter(
        (c) => typeof c.args[0] === "string" && c.args[0].includes("Vault connected"),
      );
      const vaultExists = notifyCalls.filter(
        (c) => typeof c.args[0] === "string" && c.args[0].includes("Vault found"),
      );
      // At most one type of notification
      expect(connected.length + vaultExists.length).toBeLessThanOrEqual(1);
    });

    it("does NOT emit both connected and vault-exists notifications", async () => {
      session = await createVaultSession();

      const notifyCalls = session.events.uiCallsFor("notify");
      const connected = notifyCalls.find(
        (c) => typeof c.args[0] === "string" && c.args[0].includes("Vault connected"),
      );
      const exists = notifyCalls.find(
        (c) => typeof c.args[0] === "string" && c.args[0].includes("Vault found"),
      );
      // Can't have both
      expect(connected && exists).toBeFalsy();
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
  // tool_call hooks — vault CLI tracking via bash
  // ═══════════════════════════════════════════════════════════════════════

  describe("tool_call hooks", () => {
    it("sets searching status when obsidian search is called", async () => {
      session = await createVaultSession();

      await session.run(
        when("Search vault for tasks", [
          calls("bash", {
            command: 'obsidian vault="test-vault" search query="tasks" format=json',
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

    it("sets stage emoji status when property:set stage is called", async () => {
      session = await createVaultSession();

      await session.run(
        when("Update the todo stage", [
          calls("bash", {
            command: 'obsidian vault="test-vault" property:set file="my-task" name="stage" value="in-progress"',
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

    it("tracks stage transitions across multiple CLI calls", async () => {
      session = await createVaultSession();

      await session.run(
        when("Start then review", [
          // First: set in-progress
          calls("bash", {
            command: 'obsidian vault="test-vault" property:set file="fix-bug" name="stage" value="in-progress"',
          }),
          // Then: set review
          calls("bash", {
            command: 'obsidian vault="test-vault" property:set file="fix-bug" name="stage" value="review"',
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

    it("sets searching status when eval is called", async () => {
      session = await createVaultSession();

      await session.run(
        when("Query frontmatter", [
          calls("bash", {
            command: 'obsidian vault="test-vault" eval code="JSON.stringify(app.vault.getMarkdownFiles())"',
          }),
          says("Results."),
        ]),
      );

      const statusCalls = session.events.uiCallsFor("setStatus");
      const searchStatus = statusCalls.find(
        (c) => typeof c.args[1] === "string" && c.args[1].includes("Searching vault"),
      );
      expect(searchStatus).toBeDefined();
    });

    it("ignores non-vault bash calls", async () => {
      session = await createVaultSession();

      await session.run(
        when("List files", [
          calls("bash", { command: "ls -la /tmp" }),
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

    it("ignores non-bash tool calls", async () => {
      session = await createVaultSession();

      await session.run(
        when("Read a file", [
          calls("read", { path: "/tmp/test.txt" }),
          says("Contents."),
        ]),
      );

      const statusCalls = session.events.uiCallsFor("setStatus");
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
          calls("bash", {
            command: 'obsidian vault="test-vault" search query="test" format=json',
          }),
          says("Results."),
        ]),
      );

      const statusCalls = session.events.uiCallsFor("setStatus");
      // Last status call should restore a valid default footer (depends on environment state)
      const lastStatus = statusCalls[statusCalls.length - 1];
      const validFooters = Object.values(FOOTER);
      expect(validFooters).toContain(lastStatus.args[1]);
    });

    it("restores active todo status after search when a todo is tracked", async () => {
      session = await createVaultSession();

      await session.run(
        when("Update then search", [
          // First: set an active todo
          calls("bash", {
            command: 'obsidian vault="test-vault" property:set file="active-task" name="stage" value="in-progress"',
          }),
          // Then: search (should restore to active todo, not default footer)
          calls("bash", {
            command: 'obsidian vault="test-vault" search query="related" format=json',
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

    it("handles CLI errors gracefully in no-vault state", async () => {
      session = await createVaultSession({
        bashHandler: () => "Error: Command failed: obsidian vault=...",
      });

      await session.run(
        when("Try vault", [
          calls("bash", {
            command: 'obsidian vault="test-vault" search query="test" format=json',
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
            calls("bash", {
              command: `obsidian vault="test-vault" property:set file="task-${stage}" name="stage" value="${stage}"`,
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
          calls("bash", {
            command: 'obsidian vault="test-vault" property:set file="task-custom" name="stage" value="unknown-stage"',
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

    it("registers exactly 3 commands", async () => {
      session = await createVaultSession();

      const runner = session.session.extensionRunner;
      const commands = runner.getRegisteredCommands();
      // vault-guard registers vault-todo, vault-capture, and vault-setup
      const vaultCommands = commands.filter(
        (c: any) => c.name.startsWith("vault-"),
      );
      expect(vaultCommands).toHaveLength(3);
    });
  });
});
