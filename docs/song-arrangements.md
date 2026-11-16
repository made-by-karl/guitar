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
existing media UI. Parts cards show names, measure counts and notes without a static
measure preview; their notation pane appears during playback. Song outline summaries
show measure counts without enumerating chords. The embedded occurrence editor keeps
its name, playback controls and close action visible below the sheet tabs while its
content scrolls.

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
