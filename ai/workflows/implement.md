# Workflow: implement a change

Carry a clear task through implementation, tests, review, and a reviewable handoff. Read the
repository's `AGENTS.md` and its project-context links first.

1. **Understand the outcome.** Inspect the relevant source, tests, and architectural contracts.
   Use a supplied issue or the user's clear request as acceptance criteria. Use
   [specify.md](specify.md) when product ambiguity needs a spec; routine fixes do not require an issue.
   Verify explicit dependencies and identify contract changes that affect other consumers.
2. **Inspect the working state.** Check status, branch, and the intended base. Preserve existing
   user edits and follow the repository's Git guidance. Settle a consequential base ambiguity with
   evidence; continue work whose base is already established by the session.
3. **Implement the coherent scope.** State the intended changes and give meaningful progress
   updates. Reuse existing architecture and controls. Keep framework choices, file locations,
   data rules, and commands in the project guidance. Update owning docs for changed contracts.
4. **Cover behavior.** Use [../roles/test-author.md](../roles/test-author.md) to select tests at the
   owning layer. Reproduce nontrivial regressions and cover relevant error/boundary cases.
5. **Verify.** Follow [verify.md](verify.md). Fix failures caused by the change and distinguish
   environmental or pre-existing failures with evidence.
6. **Review user-facing work.** Use [../roles/ux-reviewer.md](../roles/ux-reviewer.md) for rendered
   UI inspection. Exercise changed interactions and retain useful evidence in project scratch space.
   Report any real-device or hardware behavior that remains unverified.
7. **Review the diff.** Apply [../roles/code-reviewer.md](../roles/code-reviewer.md). Correct
   actionable findings, then rerun the checks affected by those corrections.
8. **Hand off.** Report the result, validation, and limitations. Complete commits or PRs when
   included in the agreed scope. Use the repository's issue-closing conventions and report the URL.

Use the repository's definition of done to assess completion. Review roles are lenses the current
agent can apply; they do not require delegation or a separate agent runtime.
