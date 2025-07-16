export type String = ('x' | 'o' | { fret: number; finger?: 1 | 2 | 3 | 4, isPartOfBarree?: boolean; }[])

export interface Grip {
  strings: String[]; // 0 = low E, 5 = high E
}

export interface TunedGrip extends Grip {
  notes: (string | null)[]; // Semitone+octave, i.e. E4
  inversion: 'root' | '1st' | '2nd' | undefined;
}