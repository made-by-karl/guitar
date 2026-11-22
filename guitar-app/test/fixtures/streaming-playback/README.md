# Streaming playback benchmark snapshots

These three transfer envelopes are exact snapshots of the local examples named in
issue [#29](https://github.com/made-by-karl/guitar/issues/29), copied for reproducible
verification. The original `guitar-app/examples/` directory remains local and untracked;
changes there do not silently change these fixtures.

| Snapshot | Original example |
| --- | --- |
| `tears-in-heaven.json` | `guitar-song-sheet-tears-in-heaven.json` |
| `open-road.json` | `guitar-song-sheet-open-road.json` |
| `rising-sun.json` | `guitar-song-sheet-rising-sun-rock-demo.json` |

The primary arrangement has 84 measures, 14 occurrences and 76 BPM. Its written
length is 265.263158 seconds; rendered duration also includes audible release.
The imported model version is deliberately preserved, so the benchmark exercises
normal import normalization rather than bypassing it with an internal model cast.

The opt-in browser benchmark and codec prototype are described in
[the testing guide](../../../../docs/testing.md#incremental-streaming-playback-issue-29).
