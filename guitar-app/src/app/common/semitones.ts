export const SEMITONES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type Semitone = typeof SEMITONES[number];

export function isSemitone(semitone: string): semitone is Semitone {
  return SEMITONES.includes(semitone as Semitone);
}

/** Return pitch 'root' moved up 'semitones' steps */
export function transpose<T extends Semitone | Note>(root: T, semitones: number): T {
  if (isNote(root)) {
    const currentSemitoneIndex = SEMITONES.indexOf(root.semitone);
    const newSemitoneIndex = (currentSemitoneIndex + semitones) % 12;
    const newSemitone = SEMITONES[(newSemitoneIndex + 12) % 12];
    
    // Calculate octave changes
    const octaveChange = Math.floor((currentSemitoneIndex + semitones) / 12);
    
    return {
      semitone: newSemitone,
      octave: root.octave + octaveChange
    } as T;
  } else {
    // Handle Semitone case
    const newSemitoneIndex = (SEMITONES.indexOf(root as Semitone) + semitones) % 12;
    return SEMITONES[(newSemitoneIndex + 12) % 12] as T;
  }
}

const FLAT_EQUIVS: Record<string, Semitone> = {
    'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

export function normalize(note: string): Semitone {
    return FLAT_EQUIVS[note] || note;
}

export interface Note {
  semitone: Semitone;
  octave: number;
}

export function note(semitone: Semitone, octave: number): Note {
  return { semitone, octave };
}

  /**
   * Convert note name (e.g., "E4") to Note
   */
export function noteNameToNote(noteName: string): Note {
    const match = noteName.match(/^([A-G][#b]?)(\d+)$/);
    if (!match) {
      throw new Error(`Invalid note name: ${noteName}`);
    }
    
    const semitone = normalize(match[1]) as Semitone;
    const octave = parseInt(match[2]);
    
    return { semitone: semitone, octave: octave };
  }

export function isNote(value: Semitone | Note): value is Note {
  return typeof value === 'object' && 'semitone' in value && 'octave' in value;
}
