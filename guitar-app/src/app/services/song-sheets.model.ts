import { Note } from 'app/common/semitones';
import { Grip } from './grips/grip.model';
import { RhythmPattern } from './rhythm-patterns.model';

export interface SongSheetGrip {
  gripId: string;
  chordName: string;
}

// Extended interface for when grips are loaded
export interface SongSheetGripWithData extends SongSheetGrip {
  grip?: Grip;
}

export interface SongSheetPattern {
  patternId: string; // Reference to the pattern ID only
}

// Extended interface for when patterns are loaded
export interface SongSheetPatternWithData extends SongSheetPattern {
  pattern?: RhythmPattern;
}

export interface SongPart {
  section: string; // e.g., Verse, Chorus
  patterns: {
    pattern: SongSheetPattern,
    grips: { grip: SongSheetGrip, startBeat: number }[]
  }[];
}

export interface SongSheet {
  id: string;
  name: string;
  tuning: Note[],
  capodaster: number,
  tempo: number,
  grips: SongSheetGrip[];
  patterns: SongSheetPattern[];
  parts: SongPart[];
  created: number;
  updated: number;
}

// Extended interface for when patterns are loaded
export interface SongSheetWithData extends Omit<SongSheet, 'grips' | 'patterns'> {
  grips: SongSheetGripWithData[];
  patterns: SongSheetPatternWithData[];
}
