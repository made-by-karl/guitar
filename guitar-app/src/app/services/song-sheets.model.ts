import { TunedGrip } from './grips/grip-generator.service';
import { RhythmPattern } from './rhythm-patterns.model';

export interface SongSheetGrip {
  id: string; // unique id for the grip (could be a hash or generated)
  chordName: string;
  grip: TunedGrip;
}

export interface SongSheetPattern {
  id: string; // unique id for this entry in the song sheet
  pattern: RhythmPattern;
  section?: string; // optional: which section of the song
  chordName?: string; // optional: associated chord
}

export interface SongSheet {
  id: string;
  name: string;
  grips: SongSheetGrip[];
  patterns: SongSheetPattern[];
  created: number;
  updated: number;
}
