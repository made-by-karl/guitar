import { getTimeSignatureParts, TimeSignature } from '@/app/core/music/rhythm/time-signature.model';

export type PlayingTechnique = 'strum' | 'pick' | 'hammer-on' | 'pull-off' | 'slide' | 'percussive';
export type PickMode = 'explicit' | 'relative';
export type LegatoMode = 'explicit' | 'relative';
export type RelativeNoteAnchor = 'base-note' | 'grip-note';
export type RelativeStringRole = 'bass' | 'second-from-bass' | 'middle' | 'second-from-top' | 'top';

// Style modifiers that can be applied to strum and pick techniques
export type PlayingModifier = 'mute' | 'palm-mute' | 'accent';

export interface ExplicitPickingNote {
  string: number; // 0-5 (low E to high E)
  fret: number;   // 0 = open, -1 = muted
}

export interface RelativePickingNote {
  role: RelativeStringRole;
  anchor: RelativeNoteAnchor;
}

export interface GripRelativePickingNote extends RelativePickingNote {
  anchor: 'grip-note';
  fretOffset: number;
}

export interface BaseRelativePickingNote extends RelativePickingNote {
  anchor: 'base-note';
}

export type PickingNote = ExplicitPickingNote | GripRelativePickingNote | BaseRelativePickingNote;

export interface ExplicitLegatoNote {
  string: number;   // 0-5 (low E to high E)
  fromFret: number; // starting fret, 0 = open
  toFret: number;   // destination fret, 0 = open
}

export interface RelativeLegatoEndpoint {
  anchor: RelativeNoteAnchor;
}

export interface GripRelativeLegatoEndpoint extends RelativeLegatoEndpoint {
  anchor: 'grip-note';
  fretOffset: number;
}

export interface BaseRelativeLegatoEndpoint extends RelativeLegatoEndpoint {
  anchor: 'base-note';
}

export type RelativeLegatoEndpointNote = GripRelativeLegatoEndpoint | BaseRelativeLegatoEndpoint;

export interface RelativeLegatoNote {
  role: RelativeStringRole;
  start: RelativeLegatoEndpointNote;
  target: RelativeLegatoEndpointNote;
}

export type LegatoNote = ExplicitLegatoNote | RelativeLegatoNote;

export interface RelativeStrumRange {
  from: RelativeStringRole;
  to: RelativeStringRole;
}

export type StrumRange = 
  | 'all'           // All 6 strings
  | 'bass'          // Strings 0-2 (low E, A, D)
  | 'treble'        // Strings 3-5 (G, B, high E)
  | 'middle'        // Strings 1-4 (A, D, G, B)
  | 'power'         // Strings 0-3 (low E, A, D, G)
  | RelativeStrumRange
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
  actions: (PlayingAction | null)[];
}

export interface PlayingPatternGripReference {
  gripId: string;
  chordName: string;
}

export interface PlayingPatternBeatGrip extends PlayingPatternGripReference {
  measureIndex: number;
  beatIndex: number;
}

export interface PlayingPatternActionGripOverride extends PlayingPatternGripReference {
  measureIndex: number;
  actionIndex: number;
}

export interface PlayingAction {
  technique: PlayingTechnique;
  
  // Style modifiers that can be applied to strum and pick techniques
  modifiers?: PlayingModifier[];
  
  // For strumming patterns
  strum?: StrumPattern;
  
  // For picking patterns
  pickMode?: PickMode;
  pick?: PickingNote[]; // array of notes to pick

  // For hammer-ons, pull-offs, and slides
  legatoMode?: LegatoMode;
  legato?: LegatoNote;

  // For percussive technique
  percussive?: Percussive;
}

export interface PlayingPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  suggestedGenre: string;
  exampleSong: string;
  measures: Measure[];
  beatGrips?: PlayingPatternBeatGrip[];
  actionGripOverrides?: PlayingPatternActionGripOverride[];
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

export function isRelativeStrumRange(strings: StrumRange | undefined): strings is RelativeStrumRange {
  return !!strings && typeof strings === 'object' && !Array.isArray(strings) && 'from' in strings && 'to' in strings;
}

/**
 * Helper to get the number of beats from a TimeSignature
 */
export function getBeatsFromTimeSignature(ts: TimeSignature): number {
  return getTimeSignatureParts(ts).top;
}

/**
 * Helper to get the number of 16th per beat from a TimeSignature
 */
export function getSixteenthPerBeatFromTimeSignature(ts: TimeSignature): number {
  return getTimeSignatureParts(ts).bottom === 4 ? 4 : 2;
}

export function getPickMode(action: PlayingAction): PickMode {
  return action.pickMode ?? 'explicit';
}

export function getLegatoMode(action: PlayingAction): LegatoMode {
  return action.legatoMode ?? 'explicit';
}

export function getRelativeNoteAnchor(note: RelativePickingNote | RelativeLegatoEndpoint, fallback: RelativeNoteAnchor): RelativeNoteAnchor {
  return note.anchor ?? fallback;
}

export function isRelativePickingNote(note: PickingNote): note is GripRelativePickingNote | BaseRelativePickingNote {
  return 'role' in note;
}

export function isGripRelativePickingNote(note: PickingNote): note is GripRelativePickingNote {
  return isRelativePickingNote(note) && note.anchor === 'grip-note';
}

export function isBaseRelativePickingNote(note: PickingNote): note is BaseRelativePickingNote {
  return isRelativePickingNote(note) && note.anchor === 'base-note';
}

export function isRelativeLegatoNote(note: LegatoNote): note is RelativeLegatoNote {
  return 'role' in note && 'start' in note && 'target' in note;
}

export function isGripRelativeLegatoEndpoint(note: RelativeLegatoEndpointNote): note is GripRelativeLegatoEndpoint {
  return note.anchor === 'grip-note';
}

export function isBaseRelativeLegatoEndpoint(note: RelativeLegatoEndpointNote): note is BaseRelativeLegatoEndpoint {
  return note.anchor === 'base-note';
}
