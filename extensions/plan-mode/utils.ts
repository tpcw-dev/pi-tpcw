/**
 * Pure utility functions for vault-aware plan mode.
 */

// ---------------------------------------------------------------------------
// Destructive command detection
// ---------------------------------------------------------------------------

const DESTRUCTIVE_PATTERNS = [
	/\brm\b/i, /\brmdir\b/i, /\bmv\b/i, /\bcp\b/i, /\bmkdir\b/i, /\btouch\b/i,
	/\bchmod\b/i, /\bchown\b/i, /\bchgrp\b/i, /\bln\b/i, /\btee\b/i,
	/\btruncate\b/i, /\bdd\b/i, /\bshred\b/i,
	/(^|[^<])>(?!>)/, />>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i, /\bsu\b/i, /\bkill\b/i, /\bpkill\b/i, /\bkillall\b/i,
	/\breboot\b/i, /\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_PATTERNS = [
	/^\s*cat\b/, /^\s*head\b/, /^\s*tail\b/, /^\s*less\b/, /^\s*more\b/,
	/^\s*grep\b/, /^\s*find\b/, /^\s*ls\b/, /^\s*pwd\b/, /^\s*echo\b/,
	/^\s*printf\b/, /^\s*wc\b/, /^\s*sort\b/, /^\s*uniq\b/, /^\s*diff\b/,
	/^\s*file\b/, /^\s*stat\b/, /^\s*du\b/, /^\s*df\b/, /^\s*tree\b/,
	/^\s*which\b/, /^\s*whereis\b/, /^\s*type\b/, /^\s*env\b/,
	/^\s*printenv\b/, /^\s*uname\b/, /^\s*whoami\b/, /^\s*id\b/,
	/^\s*date\b/, /^\s*cal\b/, /^\s*uptime\b/, /^\s*ps\b/, /^\s*top\b/,
	/^\s*htop\b/, /^\s*free\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i, /^\s*python\s+--version/i,
	/^\s*curl\s/i, /^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/, /^\s*sed\s+-n/i, /^\s*awk\b/, /^\s*rg\b/, /^\s*fd\b/,
	/^\s*bat\b/, /^\s*exa\b/,
];

/** Allow vault CLI reads in plan mode (search, read, eval — but not create/property:set) */
const VAULT_SAFE_PATTERNS = [
	/obsidian.*\bsearch\b/i,
	/obsidian.*\bread\b/i,
	/obsidian.*\beval\b/i,
	/obsidian.*\bvault\s+info/i,
	/obsidian.*\borphans\b/i,
	/obsidian.*\bunresolved\b/i,
	/obsidian.*\btasks\b/i,
];

export function isSafeCommand(command: string): boolean {
	const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
	const isSafe = SAFE_PATTERNS.some((p) => p.test(command));
	const isVaultSafe = VAULT_SAFE_PATTERNS.some((p) => p.test(command));
	return !isDestructive && (isSafe || isVaultSafe);
}

// ---------------------------------------------------------------------------
// Plan step extraction & tracking
// ---------------------------------------------------------------------------

export interface PlanStep {
	step: number;
	text: string;
	completed: boolean;
}

export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(
			/^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i,
			"",
		)
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > 0) {
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	}
	if (cleaned.length > 80) {
		cleaned = `${cleaned.slice(0, 77)}...`;
	}
	return cleaned;
}

export function extractPlanSteps(message: string): PlanStep[] {
	const items: PlanStep[] = [];
	const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
	if (!headerMatch) return items;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
	const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;

	for (const match of planSection.matchAll(numberedPattern)) {
		const text = match[2].trim().replace(/\*{1,2}$/, "").trim();
		if (text.length > 5 && !text.startsWith("`") && !text.startsWith("/") && !text.startsWith("-")) {
			const cleaned = cleanStepText(text);
			if (cleaned.length > 3) {
				items.push({ step: items.length + 1, text: cleaned, completed: false });
			}
		}
	}
	return items;
}

export function extractDoneSteps(message: string): number[] {
	const steps: number[] = [];
	for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) steps.push(step);
	}
	return steps;
}

export function markCompletedSteps(text: string, items: PlanStep[]): number {
	const doneSteps = extractDoneSteps(text);
	for (const step of doneSteps) {
		const item = items.find((t) => t.step === step);
		if (item) item.completed = true;
	}
	return doneSteps.length;
}

// ---------------------------------------------------------------------------
// Vault document generation
// ---------------------------------------------------------------------------

export function generatePlanSlug(planTitle: string): string {
	return planTitle
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60);
}

export function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

export interface PlanDocument {
	/** Vault path for the design doc (e.g. projects/my-project/plan-auth-refactor.md) */
	designDocPath: string;
	/** Vault path for the linked todo (e.g. projects/my-project/implement-auth-refactor.md) */
	todoPath: string;
	/** Full markdown content for the design doc */
	designDocContent: string;
	/** Full markdown content for the todo */
	todoContent: string;
}

export function buildPlanDocuments(opts: {
	title: string;
	project: string;
	planBody: string;
	steps: PlanStep[];
	sessionId: string;
	tags?: string[];
}): PlanDocument {
	const { title, project, planBody, steps, sessionId, tags = [] } = opts;
	const date = todayISO();
	const slug = generatePlanSlug(title);
	const designDocPath = `projects/${project}/plan-${slug}.md`;
	const todoPath = `projects/${project}/implement-${slug}.md`;
	const todoId = `todo-${project}-implement-${slug}-${date}`;
	const designId = `decision-${project}-plan-${slug}-${date}`;

	// --- Design doc ---
	const designDocContent = `---
id: ${designId}
type: decision
project: ${project}
status: active
created: ${date}
confidence: high
tags: [${["plan", ...tags].map((t) => `"${t}"`).join(", ")}]
related: ["${todoId}"]
source-session: ${sessionId}
---

# ${title}

${planBody}

## Implementation Steps

${steps.map((s) => `${s.step}. ${s.text}`).join("\n")}

## Handoff

Implementation tracked in: [[implement-${slug}]]
`;

	// --- Todo ---
	const scopeChecklist = steps.map((s) => `- [ ] Step ${s.step}: ${s.text}`).join("\n");
	const todoContent = `---
id: ${todoId}
type: todo
project: ${project}
status: active
created: ${date}
confidence: high
tags: [${["implementation", ...tags].map((t) => `"${t}"`).join(", ")}]
related: ["${designId}"]
source-session: ${sessionId}
priority: medium
assignee: ""
due: ""
stage: backlog
effort: medium
---

# Implement: ${title}

Execute the plan defined in [[plan-${slug}]].

## Scope

${scopeChecklist}

## Context

- Design doc: [[plan-${slug}]]
- Created from plan mode session: ${sessionId}
- Pick this up in a fresh session for implementation
`;

	return { designDocPath, todoPath, designDocContent, todoContent };
}
