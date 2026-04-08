export type String = ('x' | 'o' | { fret: number; finger?: 1 | 2 | 3 | 4, isPartOfBarre?: boolean; }[])

export interface Grip {
  strings: String[]; // 0 = low E, 5 = high E
}

export interface TunedGrip extends Grip {
  notes: (string | null)[]; // Semitone+octave, i.e. E4
  inversion: 'root' | '1st' | '2nd' | 'other' | undefined;
}

export function stringifyGrip(grip: Grip): string {
  return grip.strings.map(s => {
    if (s === 'x') return 'x';
    if (s === 'o') return 'o';
    const maxFret = Math.max(...s.map(n => n.fret));
    const string = s.filter(n => n.fret === maxFret)[0];
    return stringifyGripEntry(string);
  }).join('|');
}

export function serializeGrip(grip: Grip): string {
  return grip.strings.map(s => {
    if (s === 'x') return 'x';
    if (s === 'o') return 'o';
    const entries = s.map(stringifyGripEntry);
    return entries.length === 1 ? entries[0] : `[${entries.join('&')}]`;
  }).join('|');
}

export function parseGrip(gripString: string): Grip {
  const strings = gripString.split('|').map(s => {
    if (s === 'x') return 'x';
    if (s === 'o') return 'o';
    if (s.startsWith('[') && s.endsWith(']')) {
      return s.slice(1, -1).split('&').map(parseGripEntry);
    }

    return [parseGripEntry(s)];
  });

  return { strings };
}

function stringifyGripEntry(entry: { fret: number; finger?: 1 | 2 | 3 | 4; isPartOfBarre?: boolean; }): string {
  return `${entry.fret}${entry.isPartOfBarre ? 'b' : ''}`;
}

function parseGripEntry(value: string): { fret: number; finger?: 1 | 2 | 3 | 4; isPartOfBarre?: boolean; } {
  const match = value.match(/^(\d+)(b)?$/);
  if (!match) {
    throw new Error(`Invalid grip entry: ${value}`);
  }

  return {
    fret: parseInt(match[1], 10),
    isPartOfBarre: match[2] === 'b' ? true : undefined
  };
}
