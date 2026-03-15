/**
 * /skills — Browse available skills and a Skill tool for model-initiated loading.
 *
 * Features:
 *   /skills              — List all available skills with descriptions
 *   /skills <name>       — Load and display a specific skill
 *   Skill tool           — LLM can call `load_skill` to search and load skills on demand
 *
 * This bridges the gap with Claude Code's Skill tool / ToolSearch,
 * letting the model proactively discover and load skills rather than
 * relying solely on description matching.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

interface SkillInfo {
	name: string;
	description: string;
	path: string;
	source: string;
}

function extractSkills(pi: ExtensionAPI): SkillInfo[] {
	const commands = pi.getCommands();
	return commands
		.filter((cmd) => cmd.source === "skill")
		.map((cmd) => ({
			name: cmd.name.replace(/^skill:/, ""),
			description: cmd.description || "(no description)",
			path: cmd.path || "",
			source: cmd.location || "unknown",
		}));
}

function loadSkillContent(skillPath: string): string | null {
	try {
		if (fs.existsSync(skillPath)) {
			return fs.readFileSync(skillPath, "utf-8");
		}
		// Try SKILL.md in directory
		const skillMd = path.join(skillPath, "SKILL.md");
		if (fs.existsSync(skillMd)) {
			return fs.readFileSync(skillMd, "utf-8");
		}
	} catch {
		// ignore
	}
	return null;
}

export default function (pi: ExtensionAPI) {
	// /skills command — browse and load skills
	pi.registerCommand("skills", {
		description: "List available skills or load a specific one",
		handler: async (args, ctx) => {
			const skills = extractSkills(pi);
			const trimmed = (args || "").trim();

			if (!trimmed) {
				// List all skills
				if (skills.length === 0) {
					ctx.ui.notify("No skills available.", "info");
					return;
				}

				const lines = skills.map(
					(s) => `  /skill:${s.name} — ${s.description.split("\n")[0]}`
				);
				ctx.ui.notify(
					`Available skills (${skills.length}):\n\n${lines.join("\n")}\n\nUse /skills <name> to view details, or /skill:<name> to invoke.`,
					"info"
				);
				return;
			}

			// Load specific skill
			const skill = skills.find(
				(s) =>
					s.name === trimmed ||
					s.name === trimmed.replace(/^skill:/, "")
			);

			if (!skill) {
				// Fuzzy match
				const matches = skills.filter((s) =>
					s.name.includes(trimmed) ||
					s.description.toLowerCase().includes(trimmed.toLowerCase())
				);

				if (matches.length === 0) {
					ctx.ui.notify(`No skill found matching "${trimmed}".`, "warning");
				} else {
					const lines = matches.map(
						(s) => `  /skill:${s.name} — ${s.description.split("\n")[0]}`
					);
					ctx.ui.notify(
						`Skills matching "${trimmed}":\n\n${lines.join("\n")}`,
						"info"
					);
				}
				return;
			}

			// Show skill details
			const content = skill.path ? loadSkillContent(skill.path) : null;
			const preview = content
				? content.slice(0, 500) + (content.length > 500 ? "\n..." : "")
				: "(could not load content)";

			ctx.ui.notify(
				`Skill: ${skill.name}\n` +
				`Source: ${skill.source}\n` +
				`Path: ${skill.path}\n\n` +
				`${preview}\n\n` +
				`Use /skill:${skill.name} to invoke.`,
				"info"
			);
		},
	});

	// Register a tool that lets the LLM search and load skills on demand
	pi.registerTool({
		name: "load_skill",
		label: "Load Skill",
		description:
			"Search for and load a skill by name or topic. " +
			"Use this when you think a specialized skill might help with the current task. " +
			"Returns the full skill content so you can follow its instructions.",
		promptSnippet: "Search and load skills by name or topic to get specialized instructions",
		promptGuidelines: [
			"Before starting complex tasks (TDD, debugging, code review, deployment), check if a relevant skill exists by calling load_skill.",
			"If you're unsure which skill to use, call load_skill with a topic query to search descriptions.",
		],
		parameters: Type.Object({
			query: Type.String({
				description:
					"Skill name (e.g. 'web-search') or topic to search for (e.g. 'debugging', 'test driven')",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const skills = extractSkills(pi);
			const query = params.query.toLowerCase();

			// Exact match first
			let match = skills.find((s) => s.name === query || s.name === query.replace(/\s+/g, "-"));

			// Fuzzy match
			if (!match) {
				const scored = skills
					.map((s) => {
						let score = 0;
						const name = s.name.toLowerCase();
						const desc = s.description.toLowerCase();

						if (name.includes(query)) score += 10;
						if (desc.includes(query)) score += 5;

						// Word-level matching
						for (const word of query.split(/\s+/)) {
							if (name.includes(word)) score += 3;
							if (desc.includes(word)) score += 2;
						}

						return { skill: s, score };
					})
					.filter((r) => r.score > 0)
					.sort((a, b) => b.score - a.score);

				if (scored.length > 0) {
					match = scored[0].skill;

					// If multiple matches, list them all
					if (scored.length > 1) {
						const listing = scored
							.slice(0, 5)
							.map((r) => `- ${r.skill.name}: ${r.skill.description.split("\n")[0]}`)
							.join("\n");

						// Load the best match but also show alternatives
						const content = match.path ? loadSkillContent(match.path) : null;
						const text = content
							? `# Skill: ${match.name}\n\n${content}\n\n---\nOther matching skills:\n${listing}`
							: `Multiple skills match "${params.query}":\n${listing}\n\nSpecify an exact name to load one.`;

						return {
							content: [{ type: "text" as const, text }],
							details: { matched: match.name, alternatives: scored.slice(1, 5).map((r) => r.skill.name) },
						};
					}
				}
			}

			if (!match) {
				// No match — list all available
				const listing = skills
					.map((s) => `- ${s.name}: ${s.description.split("\n")[0]}`)
					.join("\n");

				return {
					content: [
						{
							type: "text" as const,
							text: `No skill found matching "${params.query}". Available skills:\n\n${listing}`,
						},
					],
					details: { matched: null },
				};
			}

			// Load and return the skill content
			const content = match.path ? loadSkillContent(match.path) : null;
			if (!content) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Found skill "${match.name}" but could not load its content from ${match.path}`,
						},
					],
					details: { matched: match.name, error: "load_failed" },
				};
			}

			return {
				content: [
					{
						type: "text" as const,
						text: `# Skill: ${match.name}\n\n${content}`,
					},
				],
				details: { matched: match.name, path: match.path },
			};
		},
	});
}
