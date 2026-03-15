/**
 * /loop — Run a prompt or slash command on a recurring interval.
 *
 * Usage:
 *   /loop 5m check the deploy status
 *   /loop 30s run tests
 *   /loop 1h summarize git log
 *   /loop stop                        — stop the current loop
 *   /loop status                      — show loop status
 *
 * Supports: Ns (seconds), Nm (minutes), Nh (hours)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let loopTimer: ReturnType<typeof setInterval> | null = null;
	let loopPrompt: string | null = null;
	let loopIntervalMs: number | null = null;
	let loopCount = 0;
	let loopStartedAt: number | null = null;

	function stopLoop() {
		if (loopTimer) {
			clearInterval(loopTimer);
			loopTimer = null;
		}
		loopPrompt = null;
		loopIntervalMs = null;
		loopCount = 0;
		loopStartedAt = null;
	}

	function parseInterval(str: string): number | null {
		const match = str.match(/^(\d+(?:\.\d+)?)(s|m|h)$/i);
		if (!match) return null;
		const value = parseFloat(match[1]);
		const unit = match[2].toLowerCase();
		switch (unit) {
			case "s": return value * 1000;
			case "m": return value * 60 * 1000;
			case "h": return value * 60 * 60 * 1000;
			default: return null;
		}
	}

	function formatDuration(ms: number): string {
		if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
		if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
		return `${(ms / 3_600_000).toFixed(1)}h`;
	}

	pi.registerCommand("loop", {
		description: "Run a prompt on a recurring interval (e.g. /loop 5m check deploy)",
		handler: async (args, ctx) => {
			const trimmed = (args || "").trim();

			if (!trimmed) {
				ctx.ui.notify(
					"Usage: /loop <interval> <prompt>  |  /loop stop  |  /loop status\n" +
					"Examples: /loop 5m check the deploy, /loop 30s run tests",
					"info"
				);
				return;
			}

			// /loop stop
			if (trimmed === "stop") {
				if (!loopTimer) {
					ctx.ui.notify("No loop is running.", "warning");
				} else {
					const prompt = loopPrompt;
					const count = loopCount;
					stopLoop();
					ctx.ui.notify(`Loop stopped after ${count} iterations. Was: "${prompt}"`, "success");
				}
				return;
			}

			// /loop status
			if (trimmed === "status") {
				if (!loopTimer) {
					ctx.ui.notify("No loop is running.", "info");
				} else {
					const elapsed = loopStartedAt ? formatDuration(Date.now() - loopStartedAt) : "?";
					ctx.ui.notify(
						`Loop active: "${loopPrompt}" every ${formatDuration(loopIntervalMs!)}\n` +
						`Iterations: ${loopCount} | Running for: ${elapsed}`,
						"info"
					);
				}
				return;
			}

			// Parse: /loop <interval> <prompt>
			const parts = trimmed.split(/\s+/);
			const intervalStr = parts[0];
			const prompt = parts.slice(1).join(" ");

			const intervalMs = parseInterval(intervalStr);
			if (!intervalMs) {
				ctx.ui.notify(
					`Invalid interval: "${intervalStr}". Use Ns, Nm, or Nh (e.g. 30s, 5m, 1h)`,
					"error"
				);
				return;
			}

			if (!prompt) {
				ctx.ui.notify("Missing prompt. Usage: /loop 5m <your prompt here>", "error");
				return;
			}

			if (intervalMs < 5000) {
				ctx.ui.notify("Minimum interval is 5s to avoid runaway loops.", "error");
				return;
			}

			// Stop any existing loop
			if (loopTimer) {
				stopLoop();
				ctx.ui.notify("Previous loop stopped.", "info");
			}

			// Start new loop
			loopPrompt = prompt;
			loopIntervalMs = intervalMs;
			loopCount = 0;
			loopStartedAt = Date.now();

			ctx.ui.notify(
				`Loop started: "${prompt}" every ${formatDuration(intervalMs)}\n` +
				`Use /loop stop to end.`,
				"success"
			);

			// Send first prompt immediately
			loopCount++;
			pi.sendUserMessage(`[Loop iteration ${loopCount}] ${prompt}`, {
				deliverAs: "followUp",
			});

			// Schedule recurring
			loopTimer = setInterval(() => {
				if (ctx.isIdle()) {
					loopCount++;
					pi.sendUserMessage(`[Loop iteration ${loopCount}] ${prompt}`, {
						deliverAs: "followUp",
					});
				}
				// If not idle, skip this tick — next interval will try again
			}, intervalMs);
		},
	});

	// Clean up on session end
	pi.on("session_shutdown", async () => {
		stopLoop();
	});

	// Show status in footer when loop is active
	pi.on("turn_end", async (_event, ctx) => {
		if (loopTimer && loopIntervalMs) {
			ctx.ui.setStatus(
				"loop",
				`🔄 Loop: every ${formatDuration(loopIntervalMs)} (${loopCount} runs) — /loop stop`
			);
		} else {
			ctx.ui.setStatus("loop", "");
		}
	});
}
