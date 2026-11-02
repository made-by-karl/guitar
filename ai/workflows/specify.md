# Workflow: specify a change

Turn an idea into a testable task before implementation. Read the repository's `AGENTS.md`
and the project context it names, then use [../roles/requirements-analyst.md](../roles/requirements-analyst.md).

1. Inspect the current behavior and relevant code. State the user outcome and distinguish existing
   capabilities from proposed ones.
2. Draft a story, observable acceptance criteria, concrete affected paths, non-goals, dependencies,
   and open questions. Include counterexamples or boundary cases for rules the code must decide.
3. Check the criteria against product guidance, architecture, UI guidance, and other relevant tasks.
   Each criterion must be deliverable using existing functionality plus this task's own scope.
   Surface shared-file conflicts and missing prerequisites without silently widening the task.
4. Resolve only questions whose answers materially change the result. Continue independent
   investigation while waiting. For broad input, consider product, feasibility, UX, and failure cases
   as separate review lenses and synthesize one spec.
5. Deliver the spec in the location requested by the user. For an authorized issue-creation request,
   use the repository's issue tooling and existing labels; otherwise provide a reviewable draft.
   Write multiline issue bodies to a scratch file and pass them through a body-file argument.

Finish with the spec or issue URL and any unresolved blockers. Specifying a task does not start
implementation. Feature-specific criteria stay in the task; update durable product guidance only
when the requested scope establishes a lasting requirement.
