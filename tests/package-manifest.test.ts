/**
 * package-manifest.test.ts
 *
 * Pure filesystem tests that validate the pi-tpcw package.json manifest:
 *   - name and version fields exist and are non-empty
 *   - every extension path under pi.extensions resolves to a directory
 *     containing an index.ts entry point (non-empty)
 *   - every skill path under pi.skills resolves to a directory containing
 *     a SKILL.md file (non-empty)
 *   - no orphan extension/skill directories exist undeclared in manifest
 *
 * No test harness required — uses only node:fs and node:path.
 */

import { describe, it, expect } from "vitest";
import {
  readFileSync,
  existsSync,
  statSync,
  readdirSync,
} from "node:fs";
import { resolve, basename } from "node:path";

// ── Load & parse package.json once ──────────────────────────────────────────

const PKG_ROOT = resolve(import.meta.dirname, "..");
const pkgPath = resolve(PKG_ROOT, "package.json");
const raw = readFileSync(pkgPath, "utf-8");
const pkg = JSON.parse(raw);

// ── Helpers ─────────────────────────────────────────────────────────────────

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isDirectory(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

function isNonEmptyFile(p: string): boolean {
  return isFile(p) && statSync(p).size > 0;
}

/** List subdirectory names under a given parent directory. */
function subdirs(parent: string): string[] {
  if (!isDirectory(parent)) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("package.json manifest", () => {
  // ── Required top-level fields ───────────────────────────────────────────

  it("has a non-empty 'name' field", () => {
    expect(isNonEmptyString(pkg.name)).toBe(true);
  });

  it("has a non-empty 'version' field", () => {
    expect(isNonEmptyString(pkg.version)).toBe(true);
  });

  it("version follows semver pattern", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("contains a 'pi' configuration block", () => {
    expect(pkg.pi).toBeDefined();
    expect(typeof pkg.pi).toBe("object");
  });

  // ── pi.extensions ──────────────────────────────────────────────────────

  describe("pi.extensions", () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(pkg.pi?.extensions)).toBe(true);
      expect(pkg.pi.extensions.length).toBeGreaterThan(0);
    });

    const extensions: string[] = pkg.pi?.extensions ?? [];

    for (const ext of extensions) {
      describe(`extension "${ext}"`, () => {
        const extDir = resolve(PKG_ROOT, ext);

        it("points to an existing directory", () => {
          expect(isDirectory(extDir)).toBe(true);
        });

        it("contains a non-empty index.ts entry point", () => {
          const indexPath = resolve(extDir, "index.ts");
          expect(isNonEmptyFile(indexPath)).toBe(true);
        });
      });
    }
  });

  // ── pi.skills ──────────────────────────────────────────────────────────

  describe("pi.skills", () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(pkg.pi?.skills)).toBe(true);
      expect(pkg.pi.skills.length).toBeGreaterThan(0);
    });

    const skills: string[] = pkg.pi?.skills ?? [];

    for (const skill of skills) {
      describe(`skill "${skill}"`, () => {
        const skillDir = resolve(PKG_ROOT, skill);

        it("points to an existing directory", () => {
          expect(isDirectory(skillDir)).toBe(true);
        });

        it("contains a non-empty SKILL.md file", () => {
          const skillMd = resolve(skillDir, "SKILL.md");
          expect(isNonEmptyFile(skillMd)).toBe(true);
        });
      });
    }
  });

  // ── Cross-check: declared counts ──────────────────────────────────────

  describe("declared counts", () => {
    it("declares exactly 1 extension", () => {
      expect(pkg.pi.extensions).toHaveLength(1);
    });

    it("declares exactly 7 skills", () => {
      expect(pkg.pi.skills).toHaveLength(7);
    });
  });

  // ── Orphan detection ──────────────────────────────────────────────────

  describe("no orphan directories", () => {
    it("every subdirectory under extensions/ is declared in pi.extensions", () => {
      const extensionsDir = resolve(PKG_ROOT, "extensions");
      const declared = new Set(
        (pkg.pi?.extensions ?? []).map((e: string) => basename(e)),
      );
      const actual = subdirs(extensionsDir);
      for (const dir of actual) {
        expect(declared.has(dir), `extensions/${dir} is not declared in pi.extensions`).toBe(true);
      }
    });

    it("every subdirectory under skills/ is declared in pi.skills", () => {
      const skillsDir = resolve(PKG_ROOT, "skills");
      const declared = new Set(
        (pkg.pi?.skills ?? []).map((s: string) => basename(s)),
      );
      const actual = subdirs(skillsDir);
      for (const dir of actual) {
        expect(declared.has(dir), `skills/${dir} is not declared in pi.skills`).toBe(true);
      }
    });
  });
});
