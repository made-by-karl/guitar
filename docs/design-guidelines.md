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
  primary actions and use the shared touch size for icon actions. Verify dense editor controls
  on a narrow touch viewport.
- Global coarse-pointer styles keep text inputs/selects at least 16px to avoid iOS focus zoom.
  Preserve that behavior when adding small controls or local font-size overrides.


### Selection and contextual actions

- Blue is the application-wide selection role, independent of the warm brand/action colors.
  Use `--app-selection-color` (`#0d6efd`) for the selection edge/indicator and
  `--app-selection-bg` (`#e7f1ff`) for the selected surface. Import pickers and song sections,
  parts, measures, grips, and patterns share these tokens. Pair the color with an accessible
  pressed/checked state and a visible indicator or named contextual action bar.
- Selecting an item reveals its actions; entering an editor requires the explicit Edit action.
  Keep reorder handles separate from selection controls and track selection by stable identity.
- Use `.app-selectable.is-selected` for selectable song cards/rows. Use
  `.app-selection-actions` for the sticky contextual action surface and
  `.app-selection-buttons` for its icon group. The opaque charcoal surface, light icons,
  contrasting destructive icons, border, and shadow distinguish actions from the selected list.
  Keep the selected item's name visible. Do not use selection blue as the action-bar background.
- Contextual actions use Bootstrap Icons with accessible names and title tooltips, including
  Edit, Copy/Duplicate, Delete, Play/Stop, Export, and Clear selection. Keep explanatory text
  outside the buttons. Action bars wrap within their owning column and remain usable while
  scrolling; selector dialogs hide or cover parent actions.

### Button sizes

- Reuse `.btn` and Bootstrap variants. Standard labeled actions use the normal Bootstrap size;
  dense secondary actions use `.btn-sm`. Neighboring controls serving the same role use the
  same size and spacing. Avoid component-specific minimum sizes that override shared controls.
- Icon-only toolbar, breadcrumb, contextual, and preview controls use `.btn.app-icon-button`.
  This is a centered **32×32 CSS pixel** control, matching the compact preview chevron.
  The shared `--app-icon-button-size` increases to **44×44** on coarse touch pointers.
  Play and expand/collapse in the measure preview must match in both states.
- Keep icon buttons square, give them `aria-label` and `title`, hide decorative icons from
  assistive technology, and show keyboard focus. Do not hide a visible label to compensate for
  an undersized hit target. Use clear save/error/disabled states without changing geometry.

The shared implementation is `guitar-app/src/app/core/ui/_interaction-styles.scss`, loaded by
`src/styles.scss`. Extend these roles there before introducing another local variation.

### Editor layout

- Align the first list card and the adjacent workspace/empty-state box. Reserve insertion-button
  space above both columns rather than adding an independent top margin to only the list.
- Empty workspaces use `.app-workspace-placeholder`: a bordered box, contextual icon, and short
  instruction, consistently across Song and Parts.
- Child editors keep breadcrumb, preview, and preview controls in one flex flow above the
  scrolling form. A sticky breadcrumb must not slide over a sibling notation preview when the
  outer page scrolls. Verify both outer-page and inner-form scrolling.


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
