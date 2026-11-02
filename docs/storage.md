# Storage Overview

## Summary

Client-side persistence is handled with Dexie/IndexedDB in `guitar-app/src/app/core/services/database.service.ts`. The database name is `GuitarAppDatabase`.

## Tables

Current schema version is `9` with two tables:

- `songSheets`: keyed by `id`, indexed by `created` and `updated`
- `playingPatterns`: keyed by `id`, indexed by `category` and `isCustom`

Version 2 clears `playingPatterns` during upgrade so defaults can be rebuilt cleanly. Versions 2–4 retain their previously released upgrade behavior.

Version 9 combines the song-sheet changes developed on this branch into one upgrade. It copies legacy part pattern items into measures, folds grip and text overlays into their current locations, creates reusable-part occurrences with independent lyrics, and repairs explicit legato string indices in both song sheets and library patterns. Versions 5–8 were development-only steps and are no longer registered separately. The conversion helpers tolerate those intermediate shapes and preserve existing occurrence and measure identities. Databases already at version 9 open without rerunning the upgrade.

## Ownership Model

### Song sheets

`SongSheetsService` treats a song sheet as a document-like aggregate:

- sheet metadata
- tuning, capo, tempo
- external links with optional descriptions
- sheet-local grip references
- sheet-local pattern copies
- reusable musical parts and ordered occurrences with their own lyrics

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
- `resolvePartMeasures()` resolves the copied measures stored directly on each part.
- Legacy arrangements are normalized on read; new writes store lyrics on occurrences.

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
