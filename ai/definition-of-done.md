# Definition of done — Guitar Companion

Apply the checks that match the change. The [product charter](product.md),
[constraints](constraints.md), and task acceptance criteria supply the project context.

## Verification

- Application code or test changes pass `bash scripts/verify.sh` from the repo root
  (equivalently `bash ../scripts/verify.sh` from `guitar-app/`). The gate runs Jest with
  `--runInBand --watch=false`, followed by `npm run build`.
- Add or update meaningful Jest specs for nontrivial behavior. Storage, music rules,
  scheduling, and tuner changes need coverage at their owning layer, including relevant edges.
- Routing and interaction changes need focused Playwright coverage in `guitar-app/e2e/`.
  Run relevant specs through Docker as described in [../docs/testing.md](../docs/testing.md).
- Review rendered UI against [../docs/design-guidelines.md](../docs/design-guidelines.md).
  Record viewport/state coverage and screenshot paths for material visual changes.
- Documentation-only changes need link, command, and consistency checks. Changes to scripts
  also need syntax and execution checks; application tests/builds are needed when their behavior
  is affected or when validating a new verification gate.

## Code and data

- Preserve strict typing, standalone conventions, the `@/` alias, and existing feature boundaries.
- Migrations preserve stored user work; editing does not leak changes between library patterns,
  sheet snapshots, and canceled drafts.
- Audio, microphone, subscriptions, timers, and browser resources have correct cleanup.
- Changed public behavior and architectural contracts are reflected in the owning documentation.
  Resolve ambiguity that would change product intent before committing to a new contract.

## User experience

- Relevant empty, loading, validation, error, disabled, and interrupted states are understandable.
- Changed controls are keyboard operable with visible focus and accessible names; dialogs manage
  focus and cancellation. Status is communicated with more than color.
- Layout remains usable on narrow touch screens and larger screens. Review notation, scrollable
  editors, page toolbars, and modal action reachability where affected.
- Distinguish automated checks from real microphone/listening checks; disclose unverified behavior.

## Handoff

- Review the complete change using [roles/code-reviewer.md](roles/code-reviewer.md) and address
  actionable findings within scope.
- Report what changed, what passed, and any remaining blockers or limits. A failed or unavailable
  check is reported explicitly and does not count as a pass.
- A reviewable diff completes a local implementation request. Commit, push, or create a PR when
  requested by the user or the agreed delivery scope; leave merging and deployment to that scope.
- For a PR that fully resolves an issue, include `Closes #<number>`; use a reference for partial work.

The script provides a manual verification gate. Review roles and these instructions are guidance;
there is no automatic stop hook or CI enforcement installed by this workflow.
