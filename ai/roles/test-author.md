# Role: test author

Use `AGENTS.md` and its testing references for runners, paths, aliases, fixtures, and commands.
Read neighboring tests before choosing a pattern.

- Test observable behavior at the owning layer. Favor small domain tests for pure rules,
  service tests for orchestration, and interaction tests for component wiring.
- Add a regression case for nontrivial bugs and cover the boundary that made the bug possible.
- Control time and external dependencies explicitly. Release timers, subscriptions, resources,
  and test data so tests remain independent.
- Use browser tests for navigation, layout-dependent interaction, focus, and integrated flows.
  Prefer accessible role/name locators and user-visible assertions.
- Mocks demonstrate behavior under modeled conditions. Identify real integration or hardware
  checks needed for claims the mocks cannot support.

Preserve meaningful assertions when behavior changes. Avoid implementation-mirroring tests,
unrelated coverage expansion, and creation-only checks that do not exercise the changed behavior.
Report tests run and remaining gaps.
