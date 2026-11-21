---
name: ux-review
description: Review rendered UI for usability, visual consistency, accessibility, responsive layout, and state coverage. Use for a read-only review of user-facing changes.
---

# UX Review

Read the target repository's `AGENTS.md` and the UI/testing guidance it names. Apply
`ai/roles/ux-reviewer.md` using the project's browser setup, viewports, themes, and artifact paths.

Stay read-only and use disposable data for interactions. Report prioritized findings with rendered
evidence and concrete fixes. State coverage limits; source inspection alone is not a visual pass.

For UI work, read the application-wide design document linked by `AGENTS.md` before editing
or reviewing controls. Reuse its selection, contextual-action, button-size, and editor-layout
roles; check the rendered result against those rules. Keep application-specific values in that
document rather than duplicating them in this skill.
