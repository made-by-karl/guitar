export const SEMITONES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type Semitone = typeof SEMITONES[number];

function isSemitone(semitone: string): semitone is Semitone {
  return SEMITONES.includes(semitone as Semitone);
}


export const MODIFIERS = [
  'm', '7', 'maj7', 'maj9', 'sus2', 'sus4', 'add9', 'add11', 'add13', 'ø7', 'dim7', 'dim', 'aug7', 'aug', 'b5', '#5', 'bb5', 'b9', '#9', '#11', 'b13', 'no3', 'no5', 'no7'
] as const;

export type Modifier = typeof MODIFIERS[number];

function isModifier(modifier: string): modifier is Modifier {
  return MODIFIERS.includes(modifier as Modifier);
}