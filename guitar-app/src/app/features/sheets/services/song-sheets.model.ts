import { Note } from '@/app/core/music/semitones';
import { Grip } from '@/app/features/grips/services/grips/grip.model';
import {
  Measure,
  PlayingPattern,
  PlayingPatternActionGrip
} from '@/app/features/patterns/services/playing-patterns.model';

export interface SongSheetGrip {
  gripId: string;
  name: string;
}

export interface SongSheetGripWithData extends SongSheetGrip {
  grip?: Grip;
}

export interface SongSheetPattern extends PlayingPattern {}

export interface SongSheetLink {
  id: string;
  url: string;
  description: string;
}

export type SongPartActionGrip = PlayingPatternActionGrip;

export interface SongPartMeasure {
  id: string;
  measure: Measure;
}

export interface SongPart {
  id: string;
  section: string;
  /** Legacy lyrics are migrated to an occurrence when a sheet is loaded. */
  lyrics?: string;
  notes: string;
  measures: SongPartMeasure[];
}

export interface SongPartOccurrence {
  id: string;
  partId: string;
  lyrics: string;
}

export interface SongSheet {
  id: string;
  name: string;
  tuning: Note[];
  capodaster: number;
  tempo: number;
  links: SongSheetLink[];
  grips: SongSheetGrip[];
  patterns: SongSheetPattern[];
  parts: SongPart[];
  /** Absent only on legacy sheets; an empty array is an intentionally empty song. */
  arrangement?: SongPartOccurrence[];
  created: number;
  updated: number;
}

export interface SongSheetWithData extends Omit<SongSheet, 'grips'> {
  grips: SongSheetGripWithData[];
}

export interface ResolvedSongPartMeasure {
  measureId: string;
  measureIndex: number;
  measure: Measure;
}
