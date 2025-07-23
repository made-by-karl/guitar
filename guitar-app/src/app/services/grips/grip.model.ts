export type String = ('x' | 'o' | { fret: number; finger?: 1 | 2 | 3 | 4, isPartOfBarree?: boolean; }[])

export interface Grip {
  strings: String[]; // 0 = low E, 5 = high E
}

export interface TunedGrip extends Grip {
  notes: (string | null)[]; // Semitone+octave, i.e. E4
  inversion: 'root' | '1st' | '2nd' | undefined;
}

export function stringifyGrip(grip: Grip): string {
  return grip.strings.map(s => {
    if (s === 'x') return 'x';
    if (s === 'o') return 'o';
    const maxFret = Math.max(...s.map(n => n.fret));
    const string = s.filter(n => n.fret === maxFret)[0];
    return string.fret + (string.isPartOfBarree ? 'b' : '');
  }).join('|');
}

export function parseGrip(gripString: string): Grip {
  const strings = gripString.split('|').map(s => {
    if (s === 'x') return 'x';
    if (s === 'o') return 'o';
    const isBarree = s.endsWith('b');
    const f = isBarree ? s.slice(0, -1) : s; // Remove 'b' if it's a barree

    return [{ fret: parseInt(f), isPartOfBarree: isBarree }];
  });

  return { strings };
}