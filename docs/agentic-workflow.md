# Agentic development workflow

Guitar Companion uses a task → implementation → verification → review loop. A clear request
can go directly into implementation; an ambiguous idea first becomes a testable specification.
`implement` assigns a supplied ticket to the user and creates a PR after verification and review
pass, unless the user explicitly limits delivery scope. Other workflows hand off a reviewable
diff, or a PR when requested. Merging and deployment require separate scope.

## Where guidance lives

| Layer | Source |
| --- | --- |
| Entry point, commands, repository conventions | [../AGENTS.md](../AGENTS.md) |
| Durable product intent | [../ai/product.md](../ai/product.md) |
| Technical and musical boundaries | [../ai/constraints.md](../ai/constraints.md) |
| Engineering acceptance | [../ai/definition-of-done.md](../ai/definition-of-done.md) |
| Architecture and subsystem contracts | [architecture.md](architecture.md) and its linked docs |
| UI conventions and review viewports | [design-guidelines.md](design-guidelines.md) |
| Reusable procedures | [../ai/workflows/](../ai/workflows/) |
| Reusable review lenses | [../ai/roles/](../ai/roles/) |
| Codex skill entry points | [../.agents/skills/](../.agents/skills/) |
| Executable unit/build gate | [../scripts/verify.sh](../scripts/verify.sh) |

The skills, workflows, and roles contain reusable instructions. They take app paths, frameworks,
commands, domain rules, fixture conventions, and UI details from the project sources above.
To reuse this setup elsewhere, carry the procedure layer and supply that repository's own
`AGENTS.md` context map and referenced project guidance. Per-feature criteria stay in the
task or issue rather than becoming durable product rules.

## Codex usage

Repository skills are stored in `.agents/skills/<name>/SKILL.md`, using the format described in
the [official skill documentation](https://learn.chatgpt.com/docs/build-skills). Start a new
Codex session in this checkout after adding the skills so they are available for discovery.

Examples:

```text
$specify Let me filter the playing-pattern library by category.
$implement Add the category filter described in the current task.
$component Create a category filter using the existing library controls.
$verify
$code-review Review the current working-tree diff.
$ux-review Review the changed pattern library on phone and desktop.
```

`specify` ends with a spec or an issue when issue creation was requested. `implement` carries a
clear task through code, tests, verification, rendered UI checks when relevant, and self-review.
It assigns a supplied ticket to the authenticated tracker user unless the session identifies a
different account, then commits on a feature branch, pushes, and creates a PR once checks and
reviews pass. An explicit request for local-only work overrides that delivery default.
`component` handles a scoped UI building block. Review skills report findings without editing.
Roles can be applied by the current agent; no subagent configuration is required.

## Verification and evidence

Run from the repo root:

```bash
bash scripts/verify.sh
```

The gate resolves its own repository path, runs Jest in a single process without watch mode,
then builds Angular with the default production configuration. It stops on the first failing
stage and returns that exit status. Builds generate `guitar-app/src/version.ts`.

Browser and UX checks use the existing Docker Playwright setup in [testing.md](testing.md).
This works without adding an MCP server. Use connected documentation tools when available;
verify version-sensitive framework advice against official documentation. Machine-specific
tool settings and credentials belong in local configuration.

Save temporary drafts/logs under `temp/` and useful visual evidence under `temp/ux/<task>/`.
These files are ignored by Git; a reviewer on another machine needs attached or uploaded
artifacts if the delivery scope requires remote visual evidence.

The verification script is run explicitly. This setup adds no automatic stop hook, permission
allowlist, CI job, or global tool configuration. Report every required check that could not run,
including real microphone/listening checks beyond automated tests.
