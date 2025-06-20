export const SEMITONES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type Semitone = typeof SEMITONES[number];

export function isSemitone(semitone: string): semitone is Semitone {
  return SEMITONES.includes(semitone as Semitone);
}

/** Return pitch 'root' moved up 'semitones' steps */
export function transpose(root: Semitone, semitones: number): Semitone {
    const idx = (SEMITONES.indexOf(root) + semitones) % 12;
    return SEMITONES[(idx + 12) % 12] as Semitone;
}

const FLAT_EQUIVS: Record<string, Semitone> = {
    'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

export function normalize(note: string): Semitone {
    return FLAT_EQUIVS[note] || note;
}