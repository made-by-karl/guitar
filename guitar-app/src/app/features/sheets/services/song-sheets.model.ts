import { Note } from '@/app/core/music/semitones';
import { Grip } from '@/app/features/grips/services/grips/grip.model';
import {
  Measure,
  PlayingPattern,
  PlayingPatternActionGripOverride,
  PlayingPatternBeatGrip
} from '@/app/features/patterns/services/playing-patterns.model';

export interface SongSheetGrip {
  gripId: string;
  chordName: string;
}

export interface SongSheetGripWithData extends SongSheetGrip {
  grip?: Grip;
}

export interface SongSheetPattern extends PlayingPattern {}

export interface SongPartMeasureText {
  measureIndex: number;
  lyrics: string;
  notes: string;
}

export type SongPartBeatGrip = PlayingPatternBeatGrip;

export type SongPartActionGrip = PlayingPatternActionGripOverride;

export interface SongPartPatternItem {
  id: string;
  patternId: string;
  measureTexts: SongPartMeasureText[];
  beatGrips: SongPartBeatGrip[];
  actionGripOverrides: SongPartActionGrip[];
}

export interface SongPart {
  id: string;
  section: string;
  items: SongPartPatternItem[];
}

export interface SongSheet {
  id: string;
  name: string;
  tuning: Note[];
  capodaster: number;
  tempo: number;
  grips: SongSheetGrip[];
  patterns: SongSheetPattern[];
  parts: SongPart[];
  created: number;
  updated: number;
}

export interface SongSheetWithData extends Omit<SongSheet, 'grips'> {
  grips: SongSheetGripWithData[];
}

export interface ResolvedSongPartMeasure {
  itemId: string;
  itemIndex: number;
  patternId: string;
  patternName: string;
  measureIndex: number;
  absoluteMeasureIndex: number;
  measure: Measure;
  lyrics: string;
  notes: string;
  patternBeatGrips: PlayingPatternBeatGrip[];
  patternActionGripOverrides: PlayingPatternActionGripOverride[];
  beatGrips: SongPartBeatGrip[];
  actionGripOverrides: SongPartActionGrip[];
}
