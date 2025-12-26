export type TimeSignature = '2/4' | '3/4' | '4/4' | '6/8' | '5/4' | '7/8' | '9/8' | '12/8';

export type RhythmTechnique = 'strum' | 'pick' | 'rest' | 'percussive';

// Style modifiers that can be applied to strum and pick techniques
export type RhythmModifier = 'mute' | 'palm-mute' | 'accent';

export interface PickingNote {
  string: number; // 0-5 (low E to high E)
  fret: number;   // 0 = open, -1 = muted
}

export type StrumRange = 
  | 'all'           // All 6 strings
  | 'bass'          // Strings 0-2 (low E, A, D)
  | 'treble'        // Strings 3-5 (G, B, high E)
  | 'middle'        // Strings 1-4 (A, D, G, B)
  | 'power'         // Strings 0-3 (low E, A, D, G)
  | number[];       // Specific string indices

export type StrumDirection = 'D' | 'U';

export interface StrumPattern {
  strings: StrumRange;
  direction: StrumDirection;
}

export interface Percussive {
  technique: 'body-knock' | 'string-slap';
}

export interface Measure {
  timeSignature: TimeSignature;
  actions: (RhythmAction | null)[];
}

export interface RhythmAction {
  technique: RhythmTechnique;
  
  // Style modifiers that can be applied to strum and pick techniques
  modifiers?: RhythmModifier[];
  
  // For strumming patterns
  strum?: StrumPattern;
  
  // For picking patterns
  pick?: PickingNote[]; // array of notes to pick

  // For percussive technique
  percussive?: Percussive;
}

export interface RhythmPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  measures: Measure[];
  createdAt: number;
  updatedAt: number;
  isCustom?: boolean;
}

/**
 * Helper to get string indices for strumming patterns
 */
export function getStringsForStrum(strings: any): number[] {
  if (typeof strings === 'string') {
    switch (strings) {
      case 'all': return [0, 1, 2, 3, 4, 5];
      case 'bass': return [0, 1, 2];
      case 'treble': return [3, 4, 5];
      case 'middle': return [1, 2, 3, 4];
      case 'power': return [0, 1, 2, 3];
      default: return [0, 1, 2, 3, 4, 5];
    }
  } else if (Array.isArray(strings)) {
    return strings;
  }
  return [0, 1, 2, 3, 4, 5];
}

/**
 * Helper to get the number of beats from a TimeSignature
 */
export function getBeatsFromTimeSignature(ts: TimeSignature): number {
  switch (ts) {
    case '2/4': return 2;
    case '3/4': return 3;
    case '4/4': return 4;
    case '5/4': return 5;
    case '6/8': return 6;
    case '7/8': return 7;
    case '9/8': return 9;
    case '12/8': return 12;
    default: return 4;
  }
}

/**
 * Helper to get the number of 16th per beat from a TimeSignature
 */
export function getSixteenthPerBeatFromTimeSignature(ts: TimeSignature): number {
  switch (ts) {
    case '2/4': return 4;
    case '3/4': return 4;
    case '4/4': return 4;
    case '5/4': return 4;
    case '6/8': return 2;
    case '7/8': return 2;
    case '9/8': return 2;
    case '12/8': return 2;
    default: return 4;
  }
}
