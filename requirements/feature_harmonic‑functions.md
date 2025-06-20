# Harmonic Functions Dictionary – Build‑time Data + Runtime Service

> **Target**: GitHub Copilot (or any code‑gen tool)
> **Outcome**: Pre‑computed JSON of diatonic chords for every key **+** a TypeScript service to query that data.

---

## 0. Prerequisites & Conventions

* The project already exports the domain primitive:

  ```ts
  export type Semitone =
    | 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#'
    | 'G' | 'G#' | 'A' | 'A#' | 'B'
    | 'Db' | 'Eb' | 'Gb' | 'Ab' | 'Bb';

  export type Modifier =
    | 'm' | '7' | 'maj7' | 'maj9' | 'sus2' | 'sus4'
    | 'add9' | 'add11' | 'add13'
    | 'ø7' | 'dim7' | 'dim' | 'aug7' | 'aug'
    | 'b5' | '#5' | 'bb5' | 'b9' | '#9' | '#11' | 'b13'
    | 'no3' | 'no5' | 'no7';
  ```
* Minor quality is denoted by a single modifier `'m'` (no other suffix). Major keys pass `undefined` as modifier.

---

## 1. Runtime Service

\| Path                     | `services/chords/harmonic‑functions.service.ts` |
\| Export Name              | **`HarmonicFunctionsService`**                 |
\| Responsibility           | Pure in‑memory lookup of the generated JSON  |

### 2.1 Public API

```ts
import { Semitone } from '../../common/semitones';


export class HarmonicFunctionsService {
  /**
   * Returns the diatonic chord map of the requested key.
   * @param chord The tonic note (must be major or minor).
   * @throws Error if key does not exist in dictionary.
   */
  getChordsInKeyOf(chord: Chord): Map<Degree, Chord>;

  /**
   * Finds every key that contains the given chord symbol (root+modifier) and
   * returns its degree + harmonic function.
   *
   * @example find('E', undefined)  // could match: C major (iii), A major (V)
   */
  find(chord: Chord): Array<{
    tonic: Chord;
    degree: Degree;                // e.g. "ii", "V", "VI"
    function: 'Tonic' | 'Predominant' | 'Dominant';
  }>;
}
```
### 2.2 Datastructure

```jsonc
{
  "C": {
    "I":   "C",
    "ii":  "Dm",
    "iii": "Em",
    "IV":  "F",
    "V":   "G",
    "vi":  "Am",
    "vii°":"Bdim"
  },
  "Cm": {
    "i":   "Cm",
    "ii°": "Ddim",
    "III": "D#",
    "iv":  "Fm",
    "v":   ["Gm", "G7"],
    "VI":  "G#",
    "VII": "A#"
  },
  // …repeat for all 12 tonics
}
```

* Keys are stored **with tonic and optional `'m'` suffix** (e.g. `"C"`, `"Cm"`).
* Each value is an object with seven **degree → chord** pairs (strings matching lead‑sheet symbols).


### 2.3 Harmonic‑function Table (major / minor)

| Degree  | Major Function | Minor Function  |
| ------- | -------------- | --------------- |
| I / i   | Tonic          | Tonic           |
| ii      | Predominant    | —               |
| ii°     | —              | Predominant     |
| iii     | Tonic          | —               |
| III     | —              | Tonic           |
| IV / iv | Predominant    | Predominant     |
| V / v   | Dominant       | Dominant        |
| VI / vi | Tonic          | Tonic           |
| VII     | —              | Dominant (weak) |
| vii°    | Dominant       | —               |

*Service uses this table to label functions in `find()`.*

---

## 3. Acceptance Criteria

1. Service creates a static lookup table at startup.
2. `getChordsInKeyOf('C')` returns object with 7 entries and `I === 'C'`.
3. `getChordsInKeyOf('C','m')` returns `v === 'Gm'` or `v === 'G7'`, if the service has set a property useV7forMinor=true.
4. `find('E')` includes at least `{ tonic:{root:'C'}, degree:'III', function:'Tonic' }`.
5. Service is an Angular service.


---

## 4. Implementation Hints

1. For minor keys, add both `v` and `V7` values as array. This must also be handled in reading the data and depends on a property useV7forMinor in the service.
2. Keep keys for degrees *exactly as shown* (uppercase for major degrees, lowercase for minor, dim symbol `°`).

When these items are implemented, the feature is **complete and ready for use**.
