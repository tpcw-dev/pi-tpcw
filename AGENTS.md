# pi-tpcw Project Rules

## Package-First Rule (Default: Include Here)

**Everything we build goes into pi-tpcw unless explicitly told otherwise.**

This project IS the portable package. It's symlinked as a pi package (`../../pi-tpcw` in `~/.pi/agent/settings.json`), so anything added here is immediately available in every pi session — no extra setup.

### What belongs in pi-tpcw

| Asset | Location in this repo |
|-------|----------------------|
| Skills | `skills/<skill-name>/SKILL.md` + supporting files |
| Subagent definitions | `.pi/agents/<agent-name>.md` |
| Extensions | `extensions/<ext-name>/` |
| Prompt templates | `prompts/` (if added) |
| Shared utilities / libs | top-level or `lib/` |

### What does NOT go here (only if explicitly opted out)

- One-off throwaway scripts
- Credentials / secrets (use env vars or `~/.pi/agent/auth.json`)
- User-specific settings (theme, keybindings)
- Items the user explicitly says "keep this local"

### Why this matters

1. **New environments need only `pi install ./pi-tpcw`** — all skills, extensions, agents, and tools come along.
2. **No drift** — avoids the trap of building useful things in `~/.pi/agent/` that get lost when switching machines or onboarding.
3. **Single source of truth** — if it's worth building, it's worth packaging.

### Decision checklist (for the agent)

When building something new, ask:
1. Is this a skill, agent, extension, or reusable tool? → **Put it in pi-tpcw.**
2. Did the user explicitly say "keep this local" or "don't add to the package"? → Put it in `~/.pi/agent/` locally.
3. Unsure? → **Default to pi-tpcw.** Ask only if genuinely ambiguous.

### Existing local assets to migrate

The following currently live in `~/.pi/agent/` and should be moved into this package:
- `~/.pi/agent/skills/deep-research` → third-party skill with Chrome bridge dependency; vault todo `build-native-research-skill` tracks building a native replacement

## Code Standards

- Follow existing conventions in the repo
- Conventional Commits for git messages
- Never hardcode secrets
- Update `package.json` `pi.skills` / `pi.extensions` arrays when adding new assets
- Update `README.md` when adding user-facing features

## Testing Rule

- **All new features must include tests using `pi-test-harness`.**
- When developing a new skill, extension, subagent, or any functional code, write accompanying tests before considering the work complete.
- Use `pi-test-harness` as the test runner — do not introduce alternative test frameworks.
- Tests live alongside the feature they cover (e.g., `skills/<skill-name>/tests/` or colocated test files).
- A feature without tests is not done.
