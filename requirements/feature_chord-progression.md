# Chord Progression Service – Functional Specification & Acceptance Criteria

> **Audience**: GitHub Copilot / GPT agents generating TypeScript code inside the existing project.
>
> **Context**: The codebase already defines two domain primitives:
>
> ```ts
> // already present types
> export type Semitone =
>   | 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'
>   | 'Db' | 'Eb' | 'Gb' | 'Ab' | 'Bb';
>
> export type Modifier =
>   | 'm' | '7' | 'maj7' | 'maj9' | 'sus2' | 'sus4' | 'add9' | 'add11' | 'add13'
>   | 'ø7' | 'dim7' | 'dim' | 'aug7' | 'aug'
>   | 'b5' | '#5' | 'bb5' | 'b9' | '#9' | '#11' | 'b13'
>   | 'no3' | 'no5' | 'no7';
> ```
>
> **Goal**: Provide a production‑ready service that can (a) suggest harmonically relevant chords for a given chord and (b) generate basic chord progressions, using the above domain types instead of raw strings.
> Implement the new service as ChordProgressionService in '/services/chords'.

---

## 1. Public API (TypeScript)

```ts
/**
 * Domain object representing a concrete chord.
 */
export interface Chord {
  /** Root of the chord, letter + optional accidental. */
  root: Semitone;
  /** Zero or more modifiers in the exact shorthand from `Modifier`. */
  modifiers: Modifier[];
}

export type HarmonicFunction =
  | 'Tonic'
  | 'Predominant'
  | 'Dominant'
  | 'Secondary Dominant';

export interface SuggestedChord {
  chord: Chord;
  /** Roman numeral or slash notation (e.g. "V7/vi"). */
  degree: string;
  function: HarmonicFunction;
}

export interface Progression {
  /** List of harmonically compatible chords (bar‑wise, 1 chord ≙ 1 bar) */
  chords: Chord[];
}

export class ChordProgressionService {
  /**
   * Returns the diatonic chords of the key detected from `base` **plus**
   * special chords (dominant 7th in minor, common secondary dominants).
   */
  suggestChords(base: Chord): SuggestedChord[];

  /**
   * Generates between **3 and 8 bars** of a smooth progression that contains at
   * least one Tonic, one Predominant, and one Dominant function.
   * The first chord is always `base`, the last chord resolves to the tonic of
   * the detected key.
   */
  suggestProgressions(base: Chord, count?: number): Progression[];
}
```

### Notes

* *count* (optional) – number of distinct progressions to return; default =`3`.
* Service must be **pure** (no external side effects, deterministic except for
  `Math.random` usage inside `suggestProgressions`).

---

## 2. Functional Requirements

### 2.1 Key Detection

1. Accept **major** and **minor** triads, with or without modifiers.
2. A chord with root `X` **and** quality `major` is assumed to be **I** of **X major**.
3. A chord with root `X` **and** modifier `'m'` is assumed to be **i** of **X minor**.
4. If multiple keys match (e.g. `Em` matches G major *and* E minor), pick the
   key where the chord has a **Tonic** function. If still ambiguous, prefer
   the minor key.
5. For **minor keys**, treat the dominant as **V7** (raised 7th → harmonic minor).

### 2.2 Diatonic Generation (suggestChords)

1. Generate **all seven diatonic triads** for the chosen key.
2. Add the **dominant‑7th** chord (V7) **exactly once**.
3. Add the five common **secondary dominants**: V7/ii, /iii, /IV, /V, /vi
   (use `/VI` in minor).
4. Every chord is represented as a `Chord` object.
5. Each `SuggestedChord` is tagged with correct `degree` and `function`.

### 2.3 Progression Generation (suggestProgressions)

1. Use output of `suggestChords` to build progressions.
2. Each progression length = `count` ? `count` : random 3‑8 chords.
3. Must contain the harmonic pattern **Tonic → Predominant → Dominant → Tonic**
   (not necessarily contiguously, but order must appear).
4. **First chord** =`base`; **last chord** = tonic of the key.
5. Prefer voice‑leading (minimise root jumps) when picking intermediate chords.
6. Avoid two identical consecutive chords.

---

## 3. Non‑Functional Requirements

* **Type‑safe**: No `any`, all roots and modifiers are the declared enums.
* **Pure functions** inside service (good for unit testing).
* **Coverage ≥ 95 %** for unit tests in `*.spec.ts`.
* Execution time for `suggestProgressions` must be < 1 ms for 10 calls.

---

## 4. Acceptance Criteria

### 4.1 suggestChords()

| # | Scenario                                                                 | Expected                                                                                                                                           |
| - | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Input `{root:'C', modifiers:[]}`                                         | Returns 7 triads (`C`, `Dm`, `Em`, `F`, `G`, `Am`, `Bdim`), plus `G7` and 5 secondary dominants. `C` tagged `Tonic`, `G` & `G7` tagged `Dominant`. |
| 2 | Input `{root:'A', modifiers:['m']}`                                      | Key = A minor. Includes `E7` tagged `Dominant` (not secondary), plus other chords (`Am`, `Bdim`, `C`, `Dm`, `F`, `G`).                             |
| 3 | Unknown chord (e.g. `{root:'H#', modifiers:[]}`)                         | Returns empty array.                                                                                                                               |
| 4 | Every returned `SuggestedChord.chord` uses only `Semitone` + `Modifier`. |                                                                                                                                                    |

### 4.2 suggestProgressions()

| # | Scenario               | Expected                                                                                                           |
| - | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1 | Base `C`               | All progressions begin with `C` and end with `C`. Each progression contains ≥ 1 chord from each harmonic function. |
| 2 | Base `Am`              | Progressions resolve to `Am`. Contains `E7` before final tonic at least once.                                      |
| 3 | Length param `count=4` | Exactly 4 progressions are returned.                                                                               |
| 4 | Runtime & purity       | Running the method twice with the same `Math.random` seed yields identical output (allow seeding in tests).        |

---

## 5. Implementation Hints for Copilot

1. **Utility tables**: build chromatic array, interval helpers (`+2`, `+4`,…). There are some helper methods in semitones.ts
2. **Quality inference**: if `modifiers` contains `'m'` treat as minor, else major.
3. Use **object literals** for interval → quality mapping (like `'m','dim'`).
4. For voice‑leading, score consecutive roots by absolute semitone distance; pick smallest.
5. Export service as **singleton** or provide static methods — your choice.

---

When these criteria are met, the feature is considered **done**.
