/**
 * skill-triggers.test.ts
 *
 * Validates that all 11 skill directories contain a SKILL.md with valid YAML
 * frontmatter.  For each skill:
 *
 *   1. SKILL.md exists and is a regular file
 *   2. The file starts with `---` delimited YAML frontmatter
 *   3. The `name` field in frontmatter exactly matches the directory name
 *   4. The `description` field is a non-empty string
 *   5. The description contains at least one trigger phrase (the word "Trigger"
 *      or "trigger" appears somewhere — every existing description uses
 *      "Triggers on …")
 *
 * No test harness required — uses only node:fs and node:path.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";

// ── Paths ───────────────────────────────────────────────────────────────────

const PKG_ROOT = resolve(import.meta.dirname, "..");
const SKILLS_DIR = resolve(PKG_ROOT, "skills");

// ── Expected skills (from package.json pi.skills, directory basenames) ──────

const EXPECTED_SKILLS = [
  "draw-diagram",
  "search-agents",
  "train-skill-in-loop-manual",
  "vault-context",
  "vault-diagram",
  "vault-init",
  "vault-review",
  "vault-scan",
  "vault-status",
  "vault-todo",
  "vault-update",
] as const;

// ── Frontmatter parser ─────────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from between the opening and closing `---` delimiters
 * at the start of a markdown file.  Returns a simple key→value record by
 * matching `key: value` lines.  This intentionally avoids pulling in a full
 * YAML parser — the frontmatter in SKILL.md files uses only flat scalar fields.
 */
function parseFrontmatter(raw: string): Record<string, string> | null {
  // Must start with `---` (optionally preceded by whitespace/BOM)
  const fmRegex = /^\uFEFF?\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---/;
  const match = fmRegex.exec(raw);
  if (!match) return null;

  const body = match[1];
  const result: Record<string, string> = {};

  for (const line of body.split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kv) {
      result[kv[1]] = kv[2].trim();
    }
  }

  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

function isDirectory(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("skills directory", () => {
  it("exists and is a directory", () => {
    expect(isDirectory(SKILLS_DIR)).toBe(true);
  });

  it("contains exactly 11 skill sub-directories", () => {
    const entries = readdirSync(SKILLS_DIR).filter((e) =>
      isDirectory(resolve(SKILLS_DIR, e)),
    );
    expect(entries.sort()).toEqual([...EXPECTED_SKILLS].sort());
  });
});

describe("SKILL.md frontmatter validation", () => {
  for (const skillName of EXPECTED_SKILLS) {
    describe(`skill "${skillName}"`, () => {
      const skillDir = resolve(SKILLS_DIR, skillName);
      const skillMdPath = resolve(skillDir, "SKILL.md");

      // ── File existence ────────────────────────────────────────────────

      it("has a SKILL.md file", () => {
        expect(isFile(skillMdPath)).toBe(true);
      });

      it("SKILL.md is non-empty", () => {
        const raw = readFileSync(skillMdPath, "utf-8");
        expect(raw.trim().length).toBeGreaterThan(0);
      });

      // ── Frontmatter structure ─────────────────────────────────────────

      it("SKILL.md begins with valid YAML frontmatter", () => {
        const raw = readFileSync(skillMdPath, "utf-8");
        const fm = parseFrontmatter(raw);
        expect(fm).not.toBeNull();
      });

      // ── name field ────────────────────────────────────────────────────

      it("frontmatter 'name' matches directory name", () => {
        const raw = readFileSync(skillMdPath, "utf-8");
        const fm = parseFrontmatter(raw)!;
        expect(fm).not.toBeNull();
        expect(fm.name).toBe(skillName);
      });

      // ── description field ─────────────────────────────────────────────

      it("frontmatter 'description' is a non-empty string", () => {
        const raw = readFileSync(skillMdPath, "utf-8");
        const fm = parseFrontmatter(raw)!;
        expect(fm).not.toBeNull();
        expect(typeof fm.description).toBe("string");
        expect(fm.description.length).toBeGreaterThan(0);
      });

      it("description contains trigger information", () => {
        const raw = readFileSync(skillMdPath, "utf-8");
        const fm = parseFrontmatter(raw)!;
        expect(fm).not.toBeNull();
        // Every skill description includes "Triggers on …" or "trigger"
        expect(fm.description.toLowerCase()).toContain("trigger");
      });
    });
  }
});

describe("frontmatter parser edge cases", () => {
  it("returns null for a file with no frontmatter", () => {
    expect(parseFrontmatter("# Just a heading\n\nSome text.")).toBeNull();
  });

  it("returns null for a file with only one ---", () => {
    expect(parseFrontmatter("---\nname: test\nNo closing delimiter")).toBeNull();
  });

  it("parses simple key-value pairs correctly", () => {
    const input = "---\nname: my-skill\ndescription: A test skill\n---\n# Body";
    const fm = parseFrontmatter(input);
    expect(fm).not.toBeNull();
    expect(fm!.name).toBe("my-skill");
    expect(fm!.description).toBe("A test skill");
  });

  it("handles BOM prefix gracefully", () => {
    const input = "\uFEFF---\nname: bom-skill\ndescription: Has BOM\n---\n";
    const fm = parseFrontmatter(input);
    expect(fm).not.toBeNull();
    expect(fm!.name).toBe("bom-skill");
  });
});
