# Workflow: create a component

Read `AGENTS.md` and its architecture, UI, and testing references. Create a component in the
existing system without adding an unrelated framework or design layer.

1. Find the owning feature and nearby components. Decide whether this is a page, feature-local
   control, or shared UI based on its actual consumers.
2. Use the repository's generator options or create files directly. Keep generated tests, imports,
   styles, and selectors consistent with the project instructions.
3. Implement a typed public interface and the required interactions/states. Keep domain logic
   in its owning layer and reuse existing dialogs, notifications, and controls.
4. Add meaningful interaction or rendering tests where behavior warrants them, using
   [../roles/test-author.md](../roles/test-author.md). Avoid a creation-only test as evidence of behavior.
5. Follow [verify.md](verify.md) and apply [../roles/ux-reviewer.md](../roles/ux-reviewer.md)
   to visible changes. Route wiring or a new flow may need browser coverage as well.

Finish with the component's purpose, integration points, and validation results.
