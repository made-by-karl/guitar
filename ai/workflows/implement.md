# Workflow: implement a change

Carry a clear task through implementation, tests, review, and a pull request. Read the
repository's `AGENTS.md` and its project-context links first.

1. **Understand the outcome.** Inspect the relevant source, tests, and architectural contracts.
   Use a supplied issue or the user's clear request as acceptance criteria. Use
   [specify.md](specify.md) when product ambiguity needs a spec; routine fixes do not require an issue.
   Verify explicit dependencies and identify contract changes that affect other consumers.
2. **Inspect the working state.** Check status, branch, and the intended base. Preserve existing
   user edits and follow the repository's Git guidance. Settle a consequential base ambiguity with
   evidence; continue work whose base is already established by the session.
   When a ticket is supplied, assign it to the requesting user: use the authenticated tracker
   account unless the session identifies a different account. Preserve other assignees and verify
   the assignment. Fetch and verify the intended base before creating a new delivery branch.
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
8. **Create the PR and hand off.** Once all required verification and reviews pass and actionable
   findings are resolved, commit the task's changes on a feature branch, push it, and create a
   pull request against the verified base. Reuse an existing PR for the branch when present.
   Describe the resulting behavior and validation, follow the repository's issue-closing
   conventions, and report the PR URL and material limits. If a required check or external action
   is blocked, report the blocker and completed work; do not present the delivery as complete.

Use the repository's definition of done to assess completion. Follow explicit user limits such
as local-only delivery; otherwise ticket assignment and PR creation are part of this workflow.
Merging and deployment require their own authorized scope. Review roles are lenses the current
agent can apply; they do not require delegation or a separate agent runtime.
