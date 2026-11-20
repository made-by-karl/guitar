# Song arrangements

The Song tab is the default song-sheet view. Song and Parts select one occurrence or reusable
part by ID before offering actions. Selecting a row with a pointer, Enter or Space opens no
editor and starts no audio. The selected-item bar provides playback, Edit, Remove and Clear
selection; Parts also offers Copy. Insertion buttons and drag handles remain separate. Clearing
selection leaves any active preview's transport in its owning playback area.

Edit opens the part in the page. Above 700px the outline remains on the left and one workspace
on the right holds the active editing level. At 700px and below the active editor replaces the
outline. A compact, single-line ancestor row identifies Song/Parts, the part (including its
occurrence number), and the active measure, Notes or local pattern. Long names shorten visually
while keeping their accessible text. Back/ancestor actions return through draft guards.

## Storage

`SongSheet.parts` contains reusable musical definitions (`SongPart`): name (`section`), notes, and measures/actions/grips. `SongSheet.arrangement` contains ordered `SongPartOccurrence` records with `id`, `partId`, and occurrence-specific `lyrics`.

Repeating music adds a reference with fresh lyrics. It does not copy the musical definition. Moving an occurrence moves its lyrics with it. Removing an occurrence preserves its music in Parts. Removing a musical part from the Parts library removes all its references after a confirmation explaining the impact.

Database version 9 migrates each existing part into one occurrence, in its existing order, transferring its lyrics. The musical definitions retain their notes, measure IDs, and actions. The migration is idempotent. Reads and storage cleanup also normalize legacy imported data. An explicitly empty arrangement stays empty even when unused musical parts exist. The optional legacy `SongPart.lyrics` and optional arrangement field in the TypeScript DTO support old data; new storage writes lyrics only on occurrences.

## Writing and editing

Start writing creates an untitled musical part and its first occurrence together, then opens the empty part editor. It does not open a measure modal or add a measure automatically. Add offers a new measure, a sheet pattern when available, a pattern-library import, or a new pattern. Naming and preparing reusable content are optional.

Music combines the name and measures. Notes open in the workspace through a button whose filled/empty indicator reflects whether notes exist. They update the retained part draft; use the breadcrumb Save action to persist them. Lyrics is a separate occurrence-specific tab. The Parts library edits musical definitions and has no Lyrics tab.

When multiple occurrences reference a musical part, Music starts read-only and its tab displays a lock. Unlock editing opens a dialog with two choices: edit all occurrences for this editing session, or make the current occurrence independent. Independent music gets a new part ID and new measure IDs, with deep copies of its musical data and notes; the occurrence keeps its identity and lyrics. No independent-copy button or shared badges appear in the editor footer, outline, or input labels.

Switching editor tabs preserves the current unlock. Saving, leaving the editor, or opening another occurrence for editing locks reused music again. Occurrence numbers count references per part identity and appear in circular outline badges and the compact editor path, so a part named `Verse 2` is distinct from occurrence 2 of `Verse`.

Measure Edit and New measure replace the part form in the same workspace. Apply to part
updates only the retained parent draft; returning through the breadcrumb offers Discard measure changes to cancel without applying. Saving the
part persists applied measures, notes and occurrence lyrics. Only the active level's actions
are shown. Returning restores the parent's editor tab, measure selection, scroll position and
focus. Grip and source selectors remain dialogs and retain the draft/navigation path.

Leaving a dirty measure through an ancestor offers Apply and continue, Discard measure changes,
or Keep editing. Leaving the part resolves that decision before its own unsaved-work decision.
Unsaved changes are guarded when switching editors, closing the editor, changing sheet tabs, or navigating away. The writer can save and continue, discard changes, or keep editing. Reload/close uses the browser's unsaved-changes prompt. While a save is pending, the editor is inert and navigation remains on the current edit.
Failures retain the draft and expose retryable status.

Song-local patterns use the workspace both from Add content and from the sheet Patterns tab.
The existing multiple-measure pattern form keeps its own Save Pattern boundary; breadcrumb Back offers Save, Discard or Keep editing.
Saving a pattern created from a part adds a song-local snapshot and inserts its measures into
the parent draft, which still needs a part save. Pattern cancellation cannot mutate stored
patterns or the global library. Standalone pattern-library editors retain their existing layout.

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

Song and list previews use saved music without navigating the active editor or resolving its
pending drafts. Editor-level previews use that editor's draft. Play view keeps its separate
entry guard and presentation-only exit behavior.

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
existing media UI. Parts cards show names, measure counts and notes without a static
measure preview; their notation pane appears during playback. Song outline summaries
show measure counts without enumerating chords. The embedded occurrence editor keeps its compact breadcrumb and active-level save icon visible
below the sheet tabs while content scrolls. The icon's accessible name and tooltip identify
Save changes, Apply to part or Save Pattern. Pending saves disable the action and show a waiting
icon; failures keep the draft and offer a retry with an error icon and message. Save status
remains available to assistive technology. The breadcrumb Back action handles guarded return;
there are no duplicate bottom Back or Save controls.

Selected-measure actions remain in their reserved contextual bar. Nested editing replaces the
parent form and its actions, and returning restores keyboard focus to the measure's Edit action.
Measure playback sits beside the live preview's collapse control. The measure form explains
that Apply updates the part draft before a parent save; its save icon also exposes that
explanation to assistive technology. At constrained heights the preview starts collapsed and
the explanation remains accessible without taking space from the fields.

Part previews in both the editor and the Parts selection bar use the same ordered transport: Play/Pause/
Resume, Previous measure, Next measure, Stop. Close and part editing actions are separate.
Preparation disables play/seek while retaining Stop; ready/error recovery stays with the
existing media controls and audio session. Sheet lists own recovery notices when no editor
is open. In-page and modal editor recovery notices live in the scrolling body so ready/retry feedback cannot push Save or Apply off screen. Parts card surfaces
inherit their idle Bootstrap card color throughout preview; playback adds no white surface.

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

## Play view

The Song workflow offers a separate **Play view** action. It opens a viewport-sized overlay
through `ModalService`, with the song context, continuous song notation and its current action, occurrence lyrics and
compact Current grip / Next / After next diagrams. The exit control is an accessible × button.
The part heading includes the song measure on the same line; detailed position text remains
available to assistive technology. Grip change locations are accessible descriptions rather than
visible subtitles, leaving more space for lyrics. Normal Play song keeps its inline presentation.
Entry uses the existing unsaved-work guard. Canceling entry leaves playback and drafts alone;
accepted entry never recreates the occurrence editor. The covered application is inert, CDK
contains keyboard focus, Escape exits, and focus returns to the entry button.

Opening during full-song playback or pause attaches to the existing run and its copied song
snapshot. Opening while idle shows the first measure without starting audio; an unrelated
sheet preview is stopped after entry is allowed. The transport uses the same player: Stop
resets to the first measure, completion retains the final measure and lyrics with End of song,
and Play starts again from the beginning. Exit changes presentation only; inline highlighting
continues and the previous editor selection/draft remains. Leaving the playback owner closes
the overlay and stops its audio.

`SongSheetPlaybackState.songSnapshot` retains the full song data used for planning, including
lyrics, tempo, tuning and capo. Natural completion exposes `ended` and the final presentation
with `type: 'none'` and no active action marker. Explicit Stop clears that retained context.
Existing inline consumers still hide their completed playback pane.

`buildSongPlayViewTimeline` indexes occurrence order and action grip assignments once per
snapshot. `projectSongPlayView` resolves the current assignment and the next two changes from
the shared position, including after resume or media seek. Assignments on null slots count;
grips carry across rests, measures and occurrences. Explicit notes, percussion and slides do
not infer a new grip. Consecutive assignments of the same serialized ID are one continuing
shape for look-ahead; a later return to that ID remains a change. Different shapes with the
same name remain separate. Serialized IDs resolve outside the sheet library. Missing shapes
keep their label/location and unavailable feedback; wide shapes use the shared diagram limit.
Invalid serialized IDs cannot prevent otherwise playable explicit music from being planned.

Lyrics preserve the current occurrence's entire block and line breaks, with no inferred timing.
Their contained scroll position survives action and measure changes within that occurrence;
a different occurrence starts at the top, including an empty block. Narrow layouts place the
grip strip after notation and lyrics below it; each region can be reached within the scrolling
content while header and transport stay fixed. The notation scroller opts into keyboard access
through the shared renderer's `scrollLabel` input. No view-specific playback clock is created.

The Next and After next cards each have a thin progress bar toward their upcoming shape
change. Each interval begins when its target first appears in After next; the opening targets
begin at song start. Moving from After next to Next preserves the target's fill and speed,
and repeated aliases do not restart it. At the assignment boundary the diagrams/labels advance
in their fixed cards and the new After next target begins its countdown. Current receives a
brief background highlight derived from media time for that handoff. A delayed frame skips a
past highlight instead of replaying it. Reduced motion removes the background transition.
Empty Next and After next cards retain only their headings, with no explanatory placeholder.
The Current card still explains when no grip has been assigned.

A bar above the lyrics tracks the complete current arrangement occurrence, including
rest measures. A grip change inside that occurrence leaves its progress and lyric scroll alone.
The next occurrence changes the lyric block and resets the bar, even when it reuses the same
part definition. These are section timing cues; lyric lines and words have no timestamps.
Pause/seek/replay follow the shared media position. Idle/preparation/Stop show zero progress;
completion retains the final lyric block with a full part bar, including after an audio release
tail. No countdown or action instruction text accompanies these bars.

The Play view drawing contains the complete arranged song, including repeated occurrences and
rest measures, before playback and throughout the session. During a run it uses the scheduled
sequence and global measure/action coordinates, keeping the SVG stream mounted across section
boundaries. Ready and paused players can browse the contained horizontal score with touch,
keyboard or scrolling. Browsing changes the viewport only. Play/Resume reveals the current
audio position and resumes following; Stop resets the viewport to the beginning. Part labels,
lyrics and grip cards continue to follow the shared transport position. The covered inline
drawing is unmounted while Play view is open and recreated from the current shared state on
exit, avoiding a second full-score drawing at audio startup.

## Full-song section navigation

Previous part and Next part in Song and Play view seek to the first measure of the
preceding/following arrangement occurrence. Previous always leaves the current occurrence,
even midway through its first measure. Repeated and adjacent references to the same part
remain distinct targets; Parts-library order has no effect. There is no wraparound.

The scheduled snapshot supplies targets and preserves rest-only sections and their duration.
Navigation preserves playing/paused state and updates notation, occurrence, lyrics, grips and
progress from the existing media position. It does not select an editor or replace a draft.
Controls are disabled before playback, during preparation/recovery/error, after completion and
at the corresponding first/last boundary. Play keeps its restart behavior. Part-editor
Previous measure and Next measure continue to move within the part by measure.

Playback actions use icon buttons consistently in the Song transport, Play view, part
cards/editor and shared media recovery controls. Accessible names and tooltips identify
Play/Pause/Resume/Stop and navigation; preparation and playback status remain separate text.
