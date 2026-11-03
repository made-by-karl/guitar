# JSON import, export, and practice backups

Song Sheets can export a saved sheet and import a sheet JSON file. Playing Patterns can
export a library pattern and import a pattern JSON file. A sheet's Patterns tab also exports
its local pattern snapshots using the same pattern format. File imports first show a preview;
selecting a file never writes practice content.

Single-item imports always create a copy with a fresh top-level ID and timestamps. A pattern
copy is custom, including when the source was a built-in. Nested sheet identities and ownership
remain intact. Names stay unchanged when unused; collisions use `Name (Imported)`,
`Name (Imported 2)`, and so on. If another tab occupies the proposed name before import, the
user must inspect the file again. Importing a sheet never publishes its patterns to the global library.

Settings → Data Management downloads and restores backups. A backup includes exactly the
stored song sheets and global patterns, including stored built-ins and custom patterns. It
excludes debug settings, version/update bookkeeping, diagnostics, permissions, audio/service
worker caches, drafts, and live playback. Deleted built-ins are absent from the file.

Restore inspection displays the filename, export date, app version, file/current counts, and
matching ID counts. Merge adds missing IDs and replaces matching IDs with complete file
records, even when the file timestamps are older. Other records remain. Replace removes both
practice tables' current contents and writes exactly the file's records; it requires a separate
confirmation of the affected content. Neither mode remaps IDs, renames records, changes
timestamps, or deduplicates by name. Empty Merge preserves existing records; empty Replace
deletes all practice content. Writes and initialization metadata commit in one Dexie transaction.
Failure rolls everything back and leaves the preview available for retry. Success reloads the
application after commit, releasing playback and discarding stale in-memory library/editor state.
Existing unsaved-work navigation guards still apply when navigating to Settings.

## Portable contract

All files are readable UTF-8 JSON (`application/json`) with these fields:

| Field | Version 1 contract |
| --- | --- |
| `format` | `guitar-song-sheet`, `guitar-playing-pattern`, or `guitar-backup` |
| `formatVersion` | `1` (envelope layout) |
| `modelVersion` | `1` (portable record shape, independent of Dexie schema version) |
| `exportedAt` | Nonnegative epoch milliseconds |
| `appVersion` | Generated application version, diagnostic only |
| `data` | A `SongSheet`, a `PlayingPattern`, or `{ songSheets: [], playingPatterns: [] }` |

The implementation supports only format/model version 1. Older and newer versions are
rejected with guidance before writing. No unversioned Guitar import format predates this one.
Future supported model upgrades must use explicit content migrations; importing a file must
never replay destructive historical database upgrades.

Sheets travel as complete aggregates: metadata, tuning, capo, tempo, described links, labeled
grip encodings, local patterns, all parts (including unused parts), and ordered occurrences
with independent lyrics. An explicit empty arrangement stays empty. Optional absent arrangement
and action-grip fields retain their existing model defaults. Resolved runtime `Grip` objects
are excluded from exported sheet grip references. All supported musical variants, including
numeric-array strum ranges and relative legato targets, retain their values.

Unknown JSON is validated before enabling import: required types, supported discriminators,
time signatures and matching subdivision counts, finite numeric values, six-string grip
encodings, valid grip-assignment positions, unique IDs in each identity scope, and valid part
references. Names/text may be blank; patterns and parts may be empty; rest-only measures,
unused parts and repeated occurrences are valid. Records in different tables or different
sheets may share IDs. Additional JSON fields on supported records are preserved, including
through backup export/restore. Unsupported musical shapes are rejected rather than normalized.

Backup reads use a single read transaction and propagate read errors. They do not initialize
patterns, so even a never-initialized empty database can be downloaded as an empty snapshot.
Export changes no practice records or timestamps. Filenames are sanitized convenience labels;
file type is determined by `format`, never by the filename.

`guitar.lastBackupDownload` in localStorage records the last full-backup download handoff on
this browser. A failed export, individual export, or restore does not advance it. Download
handoff cannot prove the user retained the file. This metadata is outside the portable payload;
if localStorage is unavailable, downloads still work but their date cannot be recorded.

## Implementation and verification

`DataTransferService` owns inspection, apply, envelope construction, and download handoff.
`data-transfer-format.ts` owns pure validation/version/name rules. `DatabaseService` owns
snapshot reads, initialization coordination, and atomic restore. The shared JSON import control
invalidates obsolete reads, permits choosing the same file again, blocks changes/submission
while writing, and returns focus to the picker on cancel.

Jest covers validation, copy isolation, download metadata/error paths, and asynchronous UI
selection/retry behavior. `e2e/json-import-export.spec.ts` exercises real downloads/uploads,
IndexedDB payload round trips, Merge/Replace, transaction rollback after sheet writes, default
initialization and reload behavior, and keyboard/responsive flows. The transaction failure
is injected into a real Dexie table after earlier writes; it does not simulate an actual exhausted
disk. Browser checks do not establish audible playback quality or cross-browser compatibility.
