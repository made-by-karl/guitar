# Glossary

Short implementation-oriented definitions used by the tuner docs and tests.

### Candidate

A frame-level pitch hypothesis. In code this usually means a `DetectedPitchCandidate` from `DetectedPitch.candidates`. See also [harmonic candidate pool](#harmonic-candidate-pool).

### Local minimum

A CMNDF trough collected from the YIN curve by `collectTopLocalMinima()`. Local minima seed the ranking pool.

### Spectral peak

A frequency suggested by the spectrum scan on the quarter-semitone grid. Spectral peaks add non-YIN candidates to the pool.

### Harmonic candidate pool

The merged set built by `buildHarmonicCandidatePool()` from local minima, spectral peaks, and the fallback selected lag.

### Threshold match

A candidate whose CMNDF value is below the configured YIN threshold. This slightly increases confidence but does not guarantee acceptance.

### Fallback candidate

The lag chosen by the detector's normal YIN-style path before candidate-ranking promotion is considered.

### Accepted frequency

The tracker-level pitch currently trusted by `TunerTracker`, surfaced through `TunerService`. This is what drives the visible note state.

### Pending candidate

A multi-frame switch or correction hypothesis being accumulated by `accumulatePendingCandidate()`. See also [promotion](#promotion).

### Startup hypothesis

The service's temporary low or upper interpretation during a contested startup before any lock is accepted.

### Compatible pitch

Two frequencies close enough to be treated as the same note for continuity, using a semitone tolerance rather than exact Hz equality.

### Onset

A fresh attack event. A strong onset opens a short service window that allows faster acquisition or switching behavior.

### Subharmonic shadow

A too-low candidate that repeats well because the waveform also contains structure at a fraction of the real pitch. See also [third shadow](#third-shadow) and [octave shadow](#octave-shadow).

### Octave shadow

A low candidate that sits near half the intended note, such as `99 -> 198 Hz` or `123 -> 248 Hz`.

### Third shadow

A low candidate that sits near one third of the intended note, such as `110 -> 330 Hz` or `116 -> 349 Hz`.

### Contested startup

A startup case where a low-band candidate in `90..135 Hz` is treated as suspicious because a viable `2x` or `3x` upper candidate exists.

### Promotion

Choosing a higher candidate over a lower one because the higher one has better support. Promotion can happen in the detector ranking stage or in service-side startup/correction logic.

### Strong / very strong

Context-dependent quality labels, not one universal threshold. See [detection-pipeline.md](./detection-pipeline.md#5-what-strong-means-here).

### Acquire / lock / hold / decay

The service lifecycle:

- acquire: collect stable evidence before a first lock or switch
- lock: accept a pitch and expose it to the UI
- hold: preserve the accepted pitch through small or brief disturbances
- decay: keep showing the last lock while confidence fades, before eventually clearing it
