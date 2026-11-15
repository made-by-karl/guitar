# Song arrangements

The Song tab is the default song-sheet view. It shows a compact ordered outline, with one occurrence editor beside it at desktop and tablet widths. Below 701px the selected editor replaces the outline, with Back to song returning to the list.

## Storage

`SongSheet.parts` contains reusable musical definitions (`SongPart`): name (`section`), notes, and measures/actions/grips. `SongSheet.arrangement` contains ordered `SongPartOccurrence` records with `id`, `partId`, and occurrence-specific `lyrics`.

Repeating music adds a reference with fresh lyrics. It does not copy the musical definition. Moving an occurrence moves its lyrics with it. Removing an occurrence preserves its music in Parts. Removing a musical part from the Parts library removes all its references after a confirmation explaining the impact.

Database version 9 migrates each existing part into one occurrence, in its existing order, transferring its lyrics. The musical definitions retain their notes, measure IDs, and actions. The migration is idempotent. Reads and storage cleanup also normalize legacy imported data. An explicitly empty arrangement stays empty even when unused musical parts exist. The optional legacy `SongPart.lyrics` and optional arrangement field in the TypeScript DTO support old data; new storage writes lyrics only on occurrences.

## Writing and editing

Start writing creates an untitled musical part and its first occurrence together, then opens the empty part editor. It does not open a measure modal or add a measure automatically. Add offers a new measure, a sheet pattern when available, a pattern-library import, or a new pattern. Naming and preparing reusable content are optional.

Music combines the name and measures. Notes open through a button whose filled/empty indicator reflects whether notes exist. Lyrics is a separate occurrence-specific tab. The Parts library edits musical definitions and has no Lyrics tab.

When multiple occurrences reference a musical part, Music starts read-only and its tab displays a lock. Unlock editing opens a dialog with two choices: edit all occurrences for this editing session, or make the current occurrence independent. Independent music gets a new part ID and new measure IDs, with deep copies of its musical data and notes; the occurrence keeps its identity and lyrics. No independent-copy button or shared badges appear in the editor footer, outline, or input labels.

Switching editor tabs preserves the current unlock. Saving, leaving the editor, or selecting another occurrence locks reused music again. Occurrence numbers count references per part identity and are displayed in separate circular badges, so a part named `Verse 2` is distinct from occurrence 2 of `Verse`.

Unsaved changes are guarded when switching occurrences, closing the editor, changing sheet tabs, or navigating away. The writer can save and continue, discard changes, or keep editing. Reload/close uses the browser's unsaved-changes prompt. While a save is pending, the editor is inert and navigation remains on the current edit.

## Measure notation

Grip names remain complete above the notation. The shared renderer measures the text after
segments wrap, keeps names within the notation container, and places colliding names in
additional rows. Raised or horizontally shifted names have leader lines to their action
positions. Names wider than the container wrap onto multiple lines. The label band grows
without changing rhythmic spacing or reducing the text or notation size, and is recalculated
on content changes, container resizing, and font loading. This is a display rule; stored grip
names, action positions, and playback are unchanged.

The importable two-measure example at `guitar-app/test/fixtures/long-grip-labels.json` covers
edge names, consecutive sixteenth-note changes, and a measure boundary. The focused browser
regression is `guitar-app/e2e/grip-label-layout.spec.ts`.

## Playback

Full-song playback follows arrangement order, including repeated references. Isolated occurrence and measure previews rebuild the preceding grip and sounding-string state in that same order. Only the requested occurrence/measure is scheduled. Repeated part definitions therefore get the history of their particular occurrence, rather than the order of the Parts library.

The song player highlights the currently playing occurrence and supports pause, resume, and stop. Empty parts, missing part definitions, and sections whose actions cannot produce audio disable full-song playback; defined rest measures keep their duration. Playback requires at least one audible event. Previewing completed sections remains available while other sections are unfinished.

The sheet uses the music-note-list icon for Song, the navigation's up/down arrows for Patterns, and the overview's grid icon for Grips.

## Picker selection

Grip and pattern selectors, including their modal data, accept `selectionMode: 'single' | 'multiple'` (default: `multiple`). Assigning a grip to an action, including in the pattern editor, uses single selection. Adding a library pattern to a part also uses single selection; all measures of that one pattern are inserted. Importing grips or patterns into the sheet libraries uses multiple selection and applies every selected item.

Single selection uses radio cards: choosing another item replaces the previous choice, and arrow keys move the selection. Multiple selection uses independent checkboxes. Both modal result types keep their existing arrays; a single-select dialog only enables Apply when exactly one item is selected.

## Verification

Jest covers migration/idempotency, per-part numbering, reference reuse, independent lyrics, independent copies, edit guards, and occurrence playback history. Chromium coverage includes a real upgrade from database version 7, the full arrangement workflow at 390/768/1280px, and starting an empty song with a pattern-library import. Existing sheet, grip, pattern and measure editor browser regressions remain covered.

## Following playback

Song and outline playback reveal a read-only notation pane without opening or switching the
occurrence editor. Song and Parts draw the entire scheduled stream once, including subsequent
measures and repeated occurrences. Position updates move the marker without replacing the
drawing at measure boundaries. The pane displays part/occurrence, measure, action and
Playing/Paused status. Transport and recovery controls stay with the owning workflow and the
existing media UI. Parts keeps this pane independently of its standalone score.

Part-editor notation and the nested measure editor's live preview reuse their existing drawings.
They show the scheduled draft snapshot and its preceding notation history. Editing selection,
lyrics, reuse locks and save/cancel boundaries stay independent of playback. Only the current
occurrence gets the outline cue. Owner teardown clears playback, including retained completed
media.

`PlaybackHighlightView` is a clock-independent drawing contract; `appPlaybackHighlight` binds
resolved positions to implementing views. `songPlaybackHighlight` projects playback identity
into each view's local measure/action coordinates. An enclosing measure band and a solid slot
outline distinguish playback from editor selection and focus; paused slots use a dashed
outline. Blank slots and actions inside a connected SVG segment have their own marker.
Consumers without a highlight binding retain their presentation.

Following adjusts only a compact drawing's horizontal scroll position when needed. It never
scrolls the page or forms, changes focus, or forces the user back after scrolling away. All
following is immediate, including under reduced motion. The focused regression is
`e2e/playback-highlighting.spec.ts`; curated evidence is kept under
`temp/ux/playback-highlighting/`.
