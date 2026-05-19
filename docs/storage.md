# Storage Overview

## Summary

Client-side persistence is handled with Dexie/IndexedDB in `guitar-app/src/app/core/services/database.service.ts`. The database name is `GuitarAppDatabase`.

## Tables

Current schema version is `3` with two tables:

- `songSheets`: keyed by `id`, indexed by `created` and `updated`
- `playingPatterns`: keyed by `id`, indexed by `category` and `isCustom`

Version 2 also clears `playingPatterns` during upgrade so defaults can be rebuilt cleanly.

## Ownership Model

### Song sheets

`SongSheetsService` treats a song sheet as a document-like aggregate:

- sheet metadata
- tuning, capo, tempo
- external links with optional descriptions
- sheet-local grip references
- sheet-local pattern copies
- part structure and per-measure overlays

Important implication: patterns embedded in a sheet are snapshots stored on the sheet itself, not live references back to the global pattern library.

### Playing patterns

`PlayingPatternsService` manages the reusable global pattern library stored in `playingPatterns`.

- Default patterns are inserted on first use when the table is empty.
- `restoreMissingDefaults()` repopulates any missing built-in patterns by id.
- Custom patterns are cloned before storage to avoid shared nested object references.

## Normalization Rules

`SongSheetsService` performs defensive cloning and normalization before saving or resolving data:

- `cleanSheetForStorage()` strips data back to storage-safe plain objects.
- `clonePattern()`, `clonePart()`, and related helpers deep-copy nested arrays/objects.
- `normalizePartItem()` aligns `measureTexts` to the current pattern measure count.
- `normalizePartItem()` also drops `actionGrips` that point outside the pattern's valid action range.
- `resolvePartItem()` and `resolvePartMeasures()` combine stored sheet data with sheet-local pattern definitions into playback/editor-friendly structures.

Avoid storing parsed/runtime-only objects such as `Grip` instances in IndexedDB. Recompute them from ids when needed.

## Migration Guidance

- Bump the Dexie version in `DatabaseService` when schema shape changes.
- Keep upgrade steps explicit and local to the version change.
- Treat migration changes as behavioral work: update tests around both storage services and any affected consumers.
- Be careful with destructive upgrades. The existing version 2 pattern reset is intentional and should not be copied casually to unrelated tables.

## Related Files

- `guitar-app/src/app/core/services/database.service.ts`
- `guitar-app/src/app/features/sheets/services/song-sheets.service.ts`
- `guitar-app/src/app/features/patterns/services/playing-patterns.service.ts`
