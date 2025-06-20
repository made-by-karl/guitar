import { Semitone, SEMITONES } from 'app/common/semitones';
import { Chord, chordEquals, chordToString } from 'app/common/chords';
import { Injectable } from '@angular/core';
import { Modifier } from 'app/common/modifiers';

export type HarmonicFunction = 'Tonic' | 'Predominant' | 'Dominant';
export type Degree = 'I' | 'i' | 'ii' | 'ii°' | 'iii' | 'III' | 'IV' | 'iv' | 'V' | 'v' | 'vi' | 'VI' | 'vii°' | 'VII';

const HARMONIC_FUNCTIONS: Record<Degree, HarmonicFunction> = {
  'I': 'Tonic', 'i': 'Tonic',
  'ii': 'Predominant', 'ii°': 'Predominant',
  'iii': 'Tonic', 'III': 'Tonic',
  'IV': 'Predominant', 'iv': 'Predominant',
  'V': 'Dominant', 'v': 'Dominant',
  'vi': 'Tonic', 'VI': 'Tonic',
  'vii°': 'Dominant', 'VII': 'Dominant',
};

@Injectable({ providedIn: 'root' })
export class HarmonicFunctionsService {
  static data: Map<string, Map<Degree, Chord | Chord[]>> = buildHarmonicFunctionsDictionary();
  useV7forMinor = false;

  getChordsInKeyOf(chord: Chord): Map<Degree, Chord> {
    const key = chordToString(chord);
    const map = HarmonicFunctionsService.data.get(key);
    if (!map) throw new Error(`Key not found: ${key}`);

    //helper function to clone the data map
    function toResultMap(map: Map<Degree, Chord | Chord[]>): Map<Degree, Chord> {
      const resultMap = new Map<Degree, Chord>();
      for (const [degree, chord] of map.entries()) {
        if (Array.isArray(chord)) {
          resultMap.set(degree, chord[0]);
        } else {
          resultMap.set(degree, chord);
        }
      }
      return resultMap;
    }

    // For minor keys, handle 'v' as array
    if (chord.modifiers.every(m => m === 'm')) {
      const minorMap = toResultMap(map);
      const vChord = map.get('v');
      if (Array.isArray(vChord)) {
        minorMap.set('v', this.useV7forMinor ? vChord[1] : vChord[0]);
      }
      
      return minorMap;
    }

    return toResultMap(map);
  }

  find(chord: Chord) {
    const results: Array<{
      tonic: Chord;
      degree: Degree;
      function: HarmonicFunction;
    }> = [];

    for (const [key, degreeMapping] of HarmonicFunctionsService.data.entries()) {
      for (const [degreeKey, chordEntry] of degreeMapping.entries()) {
        const degree = degreeKey as Degree;
        const chordValue = chordEntry as Chord | Chord[];

        if (Array.isArray(chordValue)) {
          for (const c of chordValue) {
            if (chordEquals(c, chord)) {
              const [tonicRoot, tonicMod] = key.endsWith('m')
                ? [key.slice(0, -1) as Semitone, ['m'] as Array<Modifier>]
                : [key as Semitone, []];
              results.push({
                tonic: { root: tonicRoot, modifiers: tonicMod },
                degree,
                function: HARMONIC_FUNCTIONS[degree] || 'Tonic',
              });
            }
          }
        } else {
          if (chordEquals(chordValue, chord)) {
            const [tonicRoot, tonicMod] = key.endsWith('m')
              ? [key.slice(0, -1) as Semitone, ['m'] as Array<Modifier>]
              : [key as Semitone, []];
            results.push({
              tonic: { root: tonicRoot, modifiers: tonicMod },
              degree: degree as Degree,
              function: HARMONIC_FUNCTIONS[degree] || 'Tonic',
            });
          }
        }
      }
    }
    return results;
  }
}

function getMajorScale(tonic: Semitone) {
  const chroma = SEMITONES;
  const idx = chroma.indexOf(tonic);
  const steps = [2,2,1,2,2,2,1];
  let scale = [tonic];
  let pos = idx;
  for (let i=0; i<6; ++i) {
    pos = (pos + steps[i]) % 12;
    scale.push(chroma[pos]);
  }
  return scale;
}

function getMinorScale(tonic: Semitone) {
  const chroma = SEMITONES;
  const idx = chroma.indexOf(tonic);
  const steps = [2,1,2,2,1,2,2];
  let scale = [tonic];
  let pos = idx;
  for (let i=0; i<6; ++i) {
    pos = (pos + steps[i]) % 12;
    scale.push(chroma[pos]);
  }
  return scale;
}

export const MAJOR_DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] as const;

export const MINOR_DEGREES = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] as const;

function buildHarmonicFunctionsDictionary(): Map<string, Map<Degree, Chord | Chord[]>> {

  const asChord = (root: Semitone, modifier?: Modifier): Chord => {
    return { root, modifiers: (modifier) ? [modifier] : [] }
  }

  const dict: Map<string, Map<Degree, Chord | Chord[]>> = new Map();
  for (const tonic of SEMITONES) {
    // Major
    const majorScale = getMajorScale(tonic);
    const majorValues: Map<Degree, Chord | Chord[]> = new Map();
    majorValues.set('I',    asChord(majorScale[0]));
    majorValues.set('ii',   asChord(majorScale[1], 'm'));
    majorValues.set('iii',  asChord(majorScale[2], 'm'));
    majorValues.set('IV',   asChord(majorScale[3]));
    majorValues.set('V',    asChord(majorScale[4]));
    majorValues.set('vi',   asChord(majorScale[5], 'm'));
    majorValues.set('vii°', asChord(majorScale[6], 'dim'));

    dict.set(tonic, majorValues);

    // Minor
    const minorScale = getMinorScale(tonic);
    const minorValues: Map<Degree, Chord | Chord[]> = new Map();
    minorValues.set('i',   asChord(minorScale[0], 'm'));
    minorValues.set('ii°', asChord(minorScale[1], 'dim'));
    minorValues.set('III', asChord(minorScale[2]));
    minorValues.set('iv',  asChord(minorScale[3], 'm'));
    minorValues.set('v',   [asChord(minorScale[4], 'm'), asChord(minorScale[4], '7')]);
    minorValues.set('VI',  asChord(minorScale[5]));
    minorValues.set('VII', asChord(minorScale[6]));

    dict.set(tonic + 'm', minorValues);
  }

  return dict;
}
