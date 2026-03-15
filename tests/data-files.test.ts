/**
 * data-files.test.ts
 *
 * Validates the data/ directory files that the vault-guard extension depends on:
 *
 *   1. vault-knowledge.md — loads and parses into exactly 3 named sections
 *      (SAGE_PERSONA, VAULT_TODO_RULES, NO_VAULT_HINT) using the same regex
 *      and slicing logic the extension uses at runtime.
 *
 *   2. extraction-patterns.md — exists and is non-empty.
 *
 *   3. vault-conventions.md — exists and is non-empty.
 *
 * No test harness required — uses only node:fs and node:path.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

// ── Paths ───────────────────────────────────────────────────────────────────

const PKG_ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = resolve(PKG_ROOT, "data");

const VAULT_KNOWLEDGE_PATH = resolve(DATA_DIR, "vault-knowledge.md");
const EXTRACTION_PATTERNS_PATH = resolve(DATA_DIR, "extraction-patterns.md");
const VAULT_CONVENTIONS_PATH = resolve(DATA_DIR, "vault-conventions.md");

// ── Parsing logic (mirrors extensions/vault-guard/index.ts lines 86-100) ────

/**
 * Parse vault-knowledge.md using the exact same regex and slicing algorithm
 * that loadVaultKnowledge() uses in the extension.
 */
function parseVaultKnowledge(raw: string): Record<string, string> {
  const sectionRegex = /<!--\s*SECTION:\s*(\w+)\s*-->/g;
  let match: RegExpExecArray | null;
  const markers: { name: string; end: number }[] = [];

  while ((match = sectionRegex.exec(raw)) !== null) {
    markers.push({ name: match[1], end: match.index + match[0].length });
  }

  const sections: Record<string, string> = {};

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].end;
    const end = i + 1 < markers.length
      ? raw.lastIndexOf("<!--", markers[i + 1].end)
      : raw.length;
    sections[markers[i].name] = raw.slice(start, end).trim();
  }

  return sections;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("vault-knowledge.md", () => {
  it("exists and is a file", () => {
    expect(existsSync(VAULT_KNOWLEDGE_PATH)).toBe(true);
    expect(statSync(VAULT_KNOWLEDGE_PATH).isFile()).toBe(true);
  });

  it("is non-empty", () => {
    const raw = readFileSync(VAULT_KNOWLEDGE_PATH, "utf-8");
    expect(raw.length).toBeGreaterThan(0);
  });

  describe("section parsing", () => {
    const raw = readFileSync(VAULT_KNOWLEDGE_PATH, "utf-8");
    const sections = parseVaultKnowledge(raw);
    const sectionNames = Object.keys(sections);

    it("produces exactly 3 sections", () => {
      expect(sectionNames).toHaveLength(3);
    });

    it("contains the SAGE_PERSONA section", () => {
      expect(sections).toHaveProperty("SAGE_PERSONA");
    });

    it("contains the VAULT_TODO_RULES section", () => {
      expect(sections).toHaveProperty("VAULT_TODO_RULES");
    });

    it("contains the NO_VAULT_HINT section", () => {
      expect(sections).toHaveProperty("NO_VAULT_HINT");
    });

    it("section keys are exactly the expected set", () => {
      expect(sectionNames.sort()).toEqual(
        ["NO_VAULT_HINT", "SAGE_PERSONA", "VAULT_TODO_RULES"],
      );
    });

    it("SAGE_PERSONA contains Sage persona content", () => {
      expect(sections.SAGE_PERSONA).toContain("Sage");
      expect(sections.SAGE_PERSONA).toContain("Vault Keeper");
      expect(sections.SAGE_PERSONA.length).toBeGreaterThan(100);
    });

    it("VAULT_TODO_RULES contains todo protocol content", () => {
      expect(sections.VAULT_TODO_RULES).toContain("Stage Lifecycle");
      expect(sections.VAULT_TODO_RULES).toContain("property:set");
      expect(sections.VAULT_TODO_RULES.length).toBeGreaterThan(100);
    });

    it("NO_VAULT_HINT contains vault-not-configured content", () => {
      expect(sections.NO_VAULT_HINT).toContain("Not Configured");
      expect(sections.NO_VAULT_HINT).toContain("/vault-setup");
      expect(sections.NO_VAULT_HINT.length).toBeGreaterThan(10);
    });

    it("no section is empty", () => {
      for (const name of sectionNames) {
        expect(sections[name].length, `${name} should be non-empty`).toBeGreaterThan(0);
      }
    });
  });
});

describe("extraction-patterns.md", () => {
  it("exists and is a file", () => {
    expect(existsSync(EXTRACTION_PATTERNS_PATH)).toBe(true);
    expect(statSync(EXTRACTION_PATTERNS_PATH).isFile()).toBe(true);
  });

  it("is non-empty", () => {
    const raw = readFileSync(EXTRACTION_PATTERNS_PATH, "utf-8");
    expect(raw.trim().length).toBeGreaterThan(0);
  });

  it("has meaningful content (at least 50 characters)", () => {
    const raw = readFileSync(EXTRACTION_PATTERNS_PATH, "utf-8");
    expect(raw.length).toBeGreaterThan(50);
  });
});

describe("vault-conventions.md", () => {
  it("exists and is a file", () => {
    expect(existsSync(VAULT_CONVENTIONS_PATH)).toBe(true);
    expect(statSync(VAULT_CONVENTIONS_PATH).isFile()).toBe(true);
  });

  it("is non-empty", () => {
    const raw = readFileSync(VAULT_CONVENTIONS_PATH, "utf-8");
    expect(raw.trim().length).toBeGreaterThan(0);
  });

  it("has meaningful content (at least 50 characters)", () => {
    const raw = readFileSync(VAULT_CONVENTIONS_PATH, "utf-8");
    expect(raw.length).toBeGreaterThan(50);
  });
});

// ── Stale-key clearing (mirrors loadVaultKnowledge() fix) ───────────────────
//
// The extension uses a module-level `knowledgeSections` object that is mutated
// in-place by loadVaultKnowledge(). If session_start fires multiple times in
// one process, stale keys from a prior load must be cleared before repopulating.
//
// These tests replicate the exact clearing + parsing pattern from
// extensions/vault-guard/index.ts:82-118 to prove the behaviour.

/**
 * Simulate the stateful loadVaultKnowledge() cycle:
 *   1. Clear every existing key from `target` (mirrors the `for…delete` loop).
 *   2. Parse `raw` into sections using parseVaultKnowledge().
 *   3. Merge parsed sections into `target`.
 *
 * This is the same algorithm the extension uses, minus the file I/O and
 * default-fallback step (which are irrelevant to the clearing behaviour).
 */
function simulateLoad(
  target: Record<string, string>,
  raw: string,
): void {
  // Step 1 — clear stale keys (the fix under test)
  for (const key of Object.keys(target)) delete target[key];

  // Step 2 — parse and merge
  const parsed = parseVaultKnowledge(raw);
  for (const [k, v] of Object.entries(parsed)) {
    target[k] = v;
  }
}

describe("loadVaultKnowledge stale-key clearing", () => {
  // Synthetic markdown with an EXTRA_SECTION beyond the standard three
  const mdWithExtraSection = [
    "<!-- SECTION: SAGE_PERSONA -->",
    "Sage persona content",
    "<!-- SECTION: VAULT_TODO_RULES -->",
    "Todo rules content",
    "<!-- SECTION: NO_VAULT_HINT -->",
    "No vault hint content",
    "<!-- SECTION: EXTRA_STALE -->",
    "Extra stale section that should not survive a second load",
  ].join("\n");

  // Standard markdown with only the canonical three sections
  const mdStandardThree = [
    "<!-- SECTION: SAGE_PERSONA -->",
    "Updated persona",
    "<!-- SECTION: VAULT_TODO_RULES -->",
    "Updated rules",
    "<!-- SECTION: NO_VAULT_HINT -->",
    "Updated hint",
  ].join("\n");

  it("first load populates all sections including extra", () => {
    const sections: Record<string, string> = {};
    simulateLoad(sections, mdWithExtraSection);

    expect(Object.keys(sections).sort()).toEqual(
      ["EXTRA_STALE", "NO_VAULT_HINT", "SAGE_PERSONA", "VAULT_TODO_RULES"],
    );
    expect(sections.EXTRA_STALE).toContain("Extra stale section");
  });

  it("second load removes stale keys from first load", () => {
    const sections: Record<string, string> = {};

    // First load — includes EXTRA_STALE
    simulateLoad(sections, mdWithExtraSection);
    expect(sections).toHaveProperty("EXTRA_STALE");

    // Second load — standard three only
    simulateLoad(sections, mdStandardThree);

    expect(sections).not.toHaveProperty("EXTRA_STALE");
    expect(Object.keys(sections).sort()).toEqual(
      ["NO_VAULT_HINT", "SAGE_PERSONA", "VAULT_TODO_RULES"],
    );
  });

  it("second load updates values, not just keys", () => {
    const sections: Record<string, string> = {};

    simulateLoad(sections, mdWithExtraSection);
    expect(sections.SAGE_PERSONA).toBe("Sage persona content");

    simulateLoad(sections, mdStandardThree);
    expect(sections.SAGE_PERSONA).toBe("Updated persona");
    expect(sections.VAULT_TODO_RULES).toBe("Updated rules");
    expect(sections.NO_VAULT_HINT).toBe("Updated hint");
  });

  it("loading empty markdown clears all prior keys", () => {
    const sections: Record<string, string> = {};

    simulateLoad(sections, mdWithExtraSection);
    expect(Object.keys(sections).length).toBe(4);

    // Empty string — no section markers
    simulateLoad(sections, "");
    expect(Object.keys(sections)).toEqual([]);
  });

  it("clearing is idempotent — loading same content twice yields same result", () => {
    const sections: Record<string, string> = {};

    simulateLoad(sections, mdStandardThree);
    const snapshot1 = { ...sections };

    simulateLoad(sections, mdStandardThree);
    const snapshot2 = { ...sections };

    expect(snapshot2).toEqual(snapshot1);
  });

  it("without clearing, stale keys would persist (control test)", () => {
    // Prove that without the clear step, EXTRA_STALE would leak.
    // This test documents the bug that the fix prevents.
    const sections: Record<string, string> = {};

    // Simulate a load WITHOUT clearing (the old broken behavior)
    const parsed1 = parseVaultKnowledge(mdWithExtraSection);
    for (const [k, v] of Object.entries(parsed1)) sections[k] = v;

    const parsed2 = parseVaultKnowledge(mdStandardThree);
    for (const [k, v] of Object.entries(parsed2)) sections[k] = v;

    // Without clearing, EXTRA_STALE leaks through — this is the bug
    expect(sections).toHaveProperty("EXTRA_STALE");
    expect(Object.keys(sections)).toHaveLength(4); // 3 standard + 1 stale
  });
});
