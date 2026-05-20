# Grip Finding Algorithm

## Summary

Grip generation lives in `guitar-app/src/app/features/grips/services/grips/grip-generator.service.ts`. The service takes a parsed `ChordWithNotes`, searches the standard guitar fretboard for playable shapes, filters them by fingering and harmonic rules, and returns `TunedGrip[]`.

The UI then sorts those grips in `grip-selector.component.ts` and `chord.component.ts` by:

1. Lowest fretted position first
2. `GripScorerService.scoreGrip(...)` within the same area of the neck

## Inputs And Defaults

`GripGeneratorService.generateGrips(chord, options)` accepts these options:

- `minFretToConsider` default `1`
- `maxFretToConsider` default `12`
- `minimalPlayableStrings` default `3`
- `allowBarre` default `true`
- `allowInversions` default `false`
- `allowIncompleteChords` default `true`
- `allowMutedStringsInside` default `false`
- `allowDuplicateNotes` default `false`
- `dissonanceProfile` default `'neutral'`

The service validates that the fret range starts at `1` or above and that `maxFretToConsider >= minFretToConsider`.

## Search Pipeline

### 1. Build generation context

Before searching, the generator builds a shared context:

- A 6-string fretboard matrix from `FretboardService`
- The candidate note set: `chord.notes` plus `chord.bass` if present
- A static four-finger model: index, middle, ring, pinky
- Chord tone analysis used later for completeness checks

Open strings are not used as search anchors. They are introduced later because every provisional grip starts as all-open strings and then gets muted down.

### 2. Scan fret windows

The generator iterates `fretWindowBase` from `minFretToConsider` through `maxFretToConsider`.

For each base fret it uses a fixed configuration from `fretConfiguration(...)`:

- `maxSpan: 3`

`fretConfiguration(...)` also returns `maxFingers: 3`, but the current implementation does not use that value during pruning.

In practice, the active search window is `base fret` through `base fret + 2`, because the end index is exclusive. This keeps the search focused on compact shapes.

### 3. Collect candidate positions

Inside the current window, `getCandidatePositions(...)` records every string/fret location whose note matches one of the expected chord tones.

The result is a map:

- key: absolute fret number
- value: string indices on that fret that produce expected notes

If the current base fret has no candidate notes, the whole window is skipped. That means every generated grip must be anchored by at least one fretted chord tone at the window base.

### 4. Expand placements per fret

For each fret with candidates, `calculateFingerPlacements(...)` creates two kinds of placements:

- Single-string placements, one per candidate string
- One synthetic barre placement when multiple candidate strings exist on the same fret

The barre is generated as a contiguous run from string `5` down to the lowest matching string index. Later filtering can still mute some of those strings if they produce non-chord tones.

### 5. Combine placements across frets

`combineFingerPlacements(...)` builds cross-fret combinations:

- On a single fret, every non-empty subset of single-string placements is allowed
- A barre on that fret is also allowed as its own choice
- Across frets, combinations are merged cartesian-product style

Each combined placement list is validated by `isValidFingerPlacementCombination(...)`.

### 6. Reject impossible fingering layouts

The combination validator rejects shapes that violate the simple finger model:

- More placements than available fingers
- Two single-finger placements on the same string
- A higher-fret barre covering a lower-fret single note on the same string
- A higher-fret barre fully covering another lower-fret barre
- A barre whose covered strings are all already taken by higher-fret single placements

This is the first major pruning step.

### 7. Materialize provisional strings and notes

`buildStringsFromPlacements(...)` starts from six open strings (`'o'`) and applies the chosen placements:

- `'o'` means open string
- `'x'` means muted string
- `GripStringEntry[]` means one or more fret placements on that string

Then `getNotesForGrip(...)` resolves each string to the actual sounding note:

- Open strings use fret `0`
- Fretted strings use the highest fret entry on that string
- Muted strings resolve to `null`

## Harmonic Filtering

### Remove unexpected notes

`muteUnexpectedNotes(...)` immediately mutes any string whose sounding note is not part of the expected semitone set.

This is why wide synthetic barres are acceptable earlier in the pipeline: non-chord tones are removed here.

### Remove internal muted strings by default

If `allowMutedStringsInside` is `false`, `removeMutedStringsInside(...)` prevents holes inside the playable block.

When it finds a muted string between playable strings, it mutes one side of the shape entirely:

- If there are fewer playable strings before the gap, mute everything before it
- Otherwise mute everything after it

This biases the result toward contiguous, strummable chord shapes.

### Force the correct bass note

If the chord is a slash chord, `tryAddGripWithBassNote(...)` requires the requested bass note to appear and then mutes every lower string before that bass note.

If the chord has no explicit bass note, `tryAddGripWithRootNote(...)` tries two variants:

- A root-position version, created by muting all strings before the first root if the root is not already the lowest note
- The original voicing, which may be an inversion

Whether inversions survive depends on the later `allowInversions` validation.

## Completeness Rules

`analyzeChordTones(...)` derives semantic roles for the chord:

- `root`
- `third`
- `fifth`
- `seventh`
- `ninth`
- `eleventh`
- `thirteenth`

It also tracks required non-role tones such as `sus2` and `sus4`, because those suspensions must still appear even though they are not treated as ordinary third/fifth/seventh-style roles.

`getGripCompleteness(...)` classifies each voicing:

- `complete`: all required roles are present
- `omit5`: the only missing role is a perfect fifth that the algorithm considers optional
- `omit3-fallback`: the only missing role is the third, but the voicing contains root, seventh, and explicit extension tones strongly enough to define the chord

Anything else is rejected.

Important details:

- Incomplete chords are only allowed when exactly one role is missing
- Missing required suspension tones always reject the grip
- `omit3-fallback` is disabled for plain triads and for chords that explicitly use modifier `5`

## Final Validation

`isValidGrip(...)` rejects any grip that fails these checks:

- Fewer playable strings than `minimalPlayableStrings`
- Contains a barre while `allowBarre` is `false`
- Repeats the exact same note and octave while `allowDuplicateNotes` is `false`
- Produces an inversion while `allowInversions` is `false`
- Exceeds the active dissonance threshold

### Inversion detection

`determineInversion(...)` inspects the first sounding note after bass handling:

- `root`
- `1st`
- `2nd`
- `other`

For slash chords, the explicit bass is skipped before determining inversion class.

### Dissonance filtering

`isDissonant(...)` computes a score and compares it against an adaptive threshold.

The score is based on:

- Bass-to-upper-voice intervals
- Extra penalty for low-register seconds, sevenths, and tritones
- Additional pairwise penalties for close seconds between neighboring voices
- Extra penalty for doubled sevenths and stacked tensions

The threshold is adjusted by:

- The chord's expected dissonance profile from `core/music/modifiers.ts`
- Bass register
- Number of open strings in the lower four strings
- User-selected profile: `harmonic`, `neutral`, `dissonant`, or `all`

`all` disables this filter entirely.

## Deduplication And Replacement

Accepted grips are added through `addGripToCollection(...)`, which compares the new grip with already accepted ones.

`compareGrips(...)` treats another grip as:

- `match`
- `subset`
- `superset`
- `conflict`

This logic mainly compares which strings sound versus mute, while trying to keep the two shapes compatible at their effective lowest sounding root.

The collection rules prefer:

- Non-barre over equivalent barre shapes
- Supersets over subsets when both are the same general type
- Non-barre supersets over barre versions

This prevents the result set from filling up with near-duplicates.

## Post-Processing

`filterIncompleteGrips(...)` performs one final cleanup by grouping grips by their minimum fret.

Within each minimum-fret group:

- Complete grips are always kept
- Incomplete grips are removed if the same group already contains at least one complete grip

So incomplete voicings only survive when they are the best available option in that neck area.

## UI Ordering

The generator does not rank grips. The UI sorts them after generation:

1. Minimum fret ascending
2. `GripScorerService.scoreGrip(...)` ascending

The score favors:

- Lower neck positions
- Smaller fret spans
- Root position
- Fewer muted strings
- A single muted region
- Open strings

And penalizes:

- Barres
- Higher positions
- Incomplete grips, especially `omit3-fallback`

## Current Constraints

These are worth knowing when changing the algorithm:

- Search windows are currently fixed to a three-fret span
- The search is anchored on fretted notes, not open strings
- The finger model is intentionally simple and does not model thumb fretting
- Deduplication prefers practical playability over exhaustive enumeration
- Completeness rules are tightly coupled to modifier definitions in `core/music/modifiers.ts`
