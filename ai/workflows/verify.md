# Workflow: verify a change

Read `AGENTS.md` for the repository's verification command and definition of done. Inspect the
change first so the validation scope is clear.

1. Run the documented gate for application work. For documentation or tooling changes, use
   the checks required by the repository's definition of done.
2. Stop a failing gate at its first failure. Read the diagnostic, determine whether the change
   caused it, and fix within the authorized implementation scope. A verification-only request
   reports failures without silently modifying the implementation.
3. Run additional integration, browser, migration, or hardware checks required by the affected
   behavior. The standard gate only proves what its stages actually exercise.
4. Inspect generated output and the final working tree. Keep unrelated generated changes out
   of the handoff without discarding pre-existing user work.

Report commands, pass/fail results, and any skipped or blocked checks with the reason. Mark
verification incomplete when a required check could not run. Repeating a passed check needs
a new change or a specific unresolved concern.
