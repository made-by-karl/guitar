# Guitar UI guidance

Use this guidance for new and changed UI. The current source and nearby components establish
the visual baseline; a task can explicitly request a broader design change.

## Visual language and layout

- The app uses Bootstrap 5.3 and Bootstrap Icons, loaded in `guitar-app/src/styles.scss`,
  with warm brown/orange primary and secondary colors and light surfaces. Inspect actual
  computed styles: global and component rules can override Bootstrap defaults.
- Use existing Bootstrap spacing, grid, form, and button classes, with component SCSS for local
  behavior. Reuse existing variables and patterns before introducing new values or utilities.
- The shared shell in `app.component.*` owns the main navigation, secondary toolbar slot,
  wake-lock control, and notification outlet. Feature pages should integrate with that shell.
- Use the established `.container` / `.app-page` layout where appropriate. Musical editors may
  need dedicated scrolling regions; keep the page and its primary actions usable at narrow widths.
- The shipped UI has a light presentation. Review that presentation; additional themes are a
  separately scoped feature.

## Controls and musical content

- Keep primary actions distinct from secondary and destructive actions using existing Bootstrap
  variants. Give icon-only controls accessible names and clear selected/disabled feedback.
- Preserve readable chord names, accidentals, fret/string labels, rhythm notation, and playback
  position. Meaningful musical differences must remain visible at the actual rendered size.
- Reuse chord, grip, tempo, and selection controls from `core/ui/` or their feature owners.
  Match local single/multiple-selection behavior and make the current selection clear.
- Touch controls need adequate spacing and a usable hit area; aim for 44×44 CSS pixels for
  primary and icon actions. Verify dense editor controls on a narrow touch viewport.
- Global coarse-pointer styles keep text inputs/selects at least 16px to avoid iOS focus zoom.
  Preserve that behavior when adding small controls or local font-size overrides.

## Dialogs and state

- Use `ModalService`, `DialogService`, and `ModalContainerComponent` as appropriate. Read
  [ui/modal_dialogs.md](ui/modal_dialogs.md) for typed data/results and scrolling structure.
- Modal bodies scroll while headers and actions stay reachable. Check nested overlays and
  the virtual-keyboard-sized viewport where the task affects forms.
- Editing/canceling must respect draft ownership. Destructive dialogs describe the affected data.
  Preserve route-level unsaved-work protection when changing sheet editing/navigation.
- Show useful empty states and recoverable validation/errors. Indicate loading only for actual
  asynchronous work. Explain unavailable playback, denied microphone access, and interrupted
  capture where those states apply.

## Accessibility and review evidence

- Use semantic elements, associated labels, accessible names, and visible keyboard focus.
  Ensure dialogs receive/trap focus appropriately and restore it when closed.
- Pair status colors with text, icons, or shape. Check changed text/background pairs for AA
  contrast (4.5:1 normal text; 3:1 large text) and required control boundaries for 3:1 contrast.
- Respect reduced-motion preferences when adding animation. Avoid unnecessary motion during practice.
- Review material layout changes at phone **375×667**, tablet **768×1024**, and desktop
  **1280×800**; choose additional sizes when the affected editor needs them.
- Use the Docker browser setup in [testing.md](testing.md). Save curated screenshots and short
  captions under `temp/ux/<task>/`; reference paths in the handoff. Record exercised states,
  keyboard checks, and limits such as real microphone or audible playback not tested.
