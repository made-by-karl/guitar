import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PlaybackService, PlaybackStatus } from '@/app/core/services/playback.service';
import { Note, transpose } from '@/app/core/music/semitones';
import { getSongArrangement, getOccurrenceHistory } from './song-arrangement';
import {
  ResolvedSongPartMeasure,
  SongPart,
  SongSheet,
  SongSheetWithData
} from '@/app/features/sheets/services/song-sheets.model';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import {
  PlayingPatternPlaybackPlan,
  PlayingPatternPlaybackMeasure,
  PlayingPatternPlaybackPlannerService
} from '@/app/features/patterns/services/playing-pattern-playback-planner.service';

type SongSheetPlaybackSessionType = 'none' | 'measure' | 'part' | 'song';

export interface SongSheetPlaybackState {
  type: SongSheetPlaybackSessionType;
  status: PlaybackStatus;
  partId?: string;
  measureId?: string;
  currentMeasureIndex?: number;
  totalMeasures?: number;
  occurrenceId?: string;
}

@Injectable({ providedIn: 'root' })
export class SongPartPlaybackService {
  private readonly stateSubject = new BehaviorSubject<SongSheetPlaybackState>({
    type: 'none',
    status: 'idle'
  });

  readonly state$ = this.stateSubject.asObservable();
  private readonly session;
  private activePlayback:
    | { type: 'measure'; partId: string; measureId: string; totalMeasures: number; occurrenceId?: string; }
    | { type: 'part'; partId: string; totalMeasures: number; occurrenceId?: string; }
    | { type: 'song'; occurrenceIds: string[]; totalMeasures: number; }
    | null = null;

  constructor(
    private playback: PlaybackService,
    private songSheetsService: SongSheetsService,
    private planner: PlayingPatternPlaybackPlannerService
  ) {
    this.session = this.playback.getFiniteSession('song-part-playback');
    this.session.state$.subscribe((state) => {
      if (!this.activePlayback || state.status === 'idle') {
        this.activePlayback = null;
        this.stateSubject.next({
          type: 'none',
          status: 'idle'
        });
        return;
      }

      if (this.activePlayback.type === 'song') {
        this.stateSubject.next({ type: 'song', status: state.status, occurrenceId: this.activePlayback.occurrenceIds[state.cursor ?? 0],
          currentMeasureIndex: state.cursor, totalMeasures: this.activePlayback.totalMeasures });
        return;
      }
      if (this.activePlayback.type === 'measure') {
        this.stateSubject.next({
          type: 'measure',
          status: state.status,
          partId: this.activePlayback.partId,
          measureId: this.activePlayback.measureId,
          currentMeasureIndex: state.cursor,
          totalMeasures: this.activePlayback.totalMeasures,
          occurrenceId: this.activePlayback.occurrenceId
        });
        return;
      }

      this.stateSubject.next({
        type: 'part',
        status: state.status,
        partId: this.activePlayback.partId,
        currentMeasureIndex: state.cursor,
        totalMeasures: this.activePlayback.totalMeasures,
        occurrenceId: this.activePlayback.occurrenceId
      });
    });
  }

  getSnapshot(): SongSheetPlaybackState {
    return this.stateSubject.getValue();
  }

  async toggleMeasurePreview(
    sheet: SongSheet | SongSheetWithData,
    part: SongPart,
    measureId: string,
    occurrenceId?: string
  ): Promise<void> {
    const snapshot = this.getSnapshot();
    if (
      snapshot.type === 'measure' &&
      (snapshot.status === 'playing' || snapshot.status === 'preparing') &&
      snapshot.partId === part.id &&
      snapshot.measureId === measureId
      && snapshot.occurrenceId === occurrenceId
    ) {
      this.stopMeasurePreview();
      return;
    }

    const resolvedMeasures = this.songSheetsService.resolvePartMeasures(sheet, part);
    const targetMeasureIndex = resolvedMeasures.findIndex(measure => measure.measureId === measureId);

    if (targetMeasureIndex === -1) {
      return;
    }

    const mergedMeasures = this.toPlaybackMeasures(resolvedMeasures);
    const preview = this.buildMeasurePreview(sheet, mergedMeasures, targetMeasureIndex, this.precedingMeasures(sheet, part, occurrenceId));
    if (!preview) return;
    for (const message of preview.diagnostics) console.warn(message);
    if (preview.instructions.length === 0) return;

    this.activePlayback = {
      type: 'measure',
      partId: part.id,
      measureId,
      occurrenceId,
      totalMeasures: 1
    };
    this.stateSubject.next({
      type: 'measure',
      status: 'preparing',
      partId: part.id,
      measureId,
      occurrenceId,
      currentMeasureIndex: 0,
      totalMeasures: 1
    });

    await this.session.play(preview, 0);
  }

  stopMeasurePreview(): void {
    if (this.activePlayback?.type === 'measure') {
      this.session.stop();
    }
  }

  canPlaySongPart(sheet: SongSheet | SongSheetWithData, part: SongPart, occurrenceId?: string): boolean {
    return this.buildPartPlaybackPlan(sheet, part, occurrenceId).instructions.length > 0;
  }

  canPlayMeasure(sheet: SongSheet | SongSheetWithData, part: SongPart, measureId: string, occurrenceId?: string): boolean {
    const measures = this.songSheetsService.resolvePartMeasures(sheet, part);
    const index = measures.findIndex(measure => measure.measureId === measureId);
    return index >= 0 && (this.buildMeasurePreview(sheet, this.toPlaybackMeasures(measures), index, this.precedingMeasures(sheet, part, occurrenceId))?.instructions.length ?? 0) > 0;
  }

  private buildPartPlaybackPlan(sheet: SongSheet | SongSheetWithData, part: SongPart, occurrenceId?: string): PlayingPatternPlaybackPlan {
    return this.planner.buildPlaybackPlan(
      this.toPlaybackMeasures(this.songSheetsService.resolvePartMeasures(sheet, part)),
      this.getTuningForSheet(sheet), sheet.tempo, undefined, this.precedingMeasures(sheet, part, occurrenceId)
    );
  }

  async playSongPart(sheet: SongSheet | SongSheetWithData, part: SongPart, occurrenceId?: string): Promise<void> {
    const plan = this.buildPartPlaybackPlan(sheet, part, occurrenceId);
    for (const message of plan.diagnostics) console.warn(message);
    if (plan.instructions.length === 0) return;

    this.activePlayback = {
      type: 'part',
      partId: part.id,
      occurrenceId,
      totalMeasures: plan.totalSegments
    };
    this.stateSubject.next({
      type: 'part',
      status: 'preparing',
      partId: part.id,
      occurrenceId,
      currentMeasureIndex: 0,
      totalMeasures: plan.totalSegments
    });

    await this.session.play(plan, 0);
  }

  pauseSongPart(): void {
    const snapshot = this.getSnapshot();
    if (snapshot.type !== 'part') {
      return;
    }

    this.session.pause();
  }

  resumeSongPart(): void {
    const snapshot = this.getSnapshot();
    if (snapshot.type !== 'part') {
      return;
    }

    this.session.resume();
  }

  stopSongPart(): void {
    if (this.activePlayback?.type === 'part') {
      this.session.stop();
    }
  }

  seekSongPartMeasure(delta: -1 | 1): void {
    const snapshot = this.getSnapshot();
    if (snapshot.type !== 'part' || snapshot.totalMeasures === undefined) {
      return;
    }

    const target = Math.max(0, Math.min(snapshot.totalMeasures - 1, (snapshot.currentMeasureIndex ?? 0) + delta));
    this.session.seek(target);
  }

  private buildMeasurePreview(
    sheet: SongSheet | SongSheetWithData,
    measures: PlayingPatternPlaybackMeasure[],
    measureIndex: number,
    preceding: PlayingPatternPlaybackMeasure[] = []
  ): PlayingPatternPlaybackPlan | undefined {
    const targetMeasure = measures[measureIndex];
    if (!targetMeasure) {
      return undefined;
    }

    return this.planner.buildPlaybackPlan(
      [targetMeasure],
      this.getTuningForSheet(sheet),
      sheet.tempo,
      undefined,
      [...preceding, ...measures.slice(0, measureIndex)]
    );
  }

  private precedingMeasures(sheet: SongSheet, part: SongPart, occurrenceId?: string): PlayingPatternPlaybackMeasure[] {
    return occurrenceId ? getOccurrenceHistory(sheet, occurrenceId, part).flatMap(previous => previous.measures.map(item => ({
      measure: item.measure, actionGrips: item.measure.actionGrips ?? []
    }))) : [];
  }

  canPlaySong(sheet: SongSheet): boolean {
    const arrangement = getSongArrangement(sheet);
    let hasPlayableMusic = false;
    const complete = arrangement.every(occurrence => {
      const part = sheet.parts.find(item => item.id === occurrence.partId);
      if (!part || part.measures.length === 0) return false;
      const playable = this.canPlaySongPart(sheet, part, occurrence.id);
      hasPlayableMusic ||= playable;
      // Defined rests keep their duration; a part without measures is a draft.
      return playable || part.measures.every(item => item.measure.actions.every(action => !action));
    });
    return complete && hasPlayableMusic;
  }

  async playSong(sheet: SongSheet): Promise<void> {
    if (!this.canPlaySong(sheet)) return;
    const measures: PlayingPatternPlaybackMeasure[] = [];
    const occurrenceIds: string[] = [];
    for (const occurrence of getSongArrangement(sheet)) {
      const part = sheet.parts.find(item => item.id === occurrence.partId)!;
      for (const item of part.measures) {
        measures.push({ measure: item.measure, actionGrips: item.measure.actionGrips ?? [] });
        occurrenceIds.push(occurrence.id);
      }
    }
    const plan = this.planner.buildPlaybackPlan(measures, this.getTuningForSheet(sheet), sheet.tempo);
    for (const message of plan.diagnostics) console.warn(message);
    this.activePlayback = { type: 'song', occurrenceIds, totalMeasures: measures.length };
    this.stateSubject.next({ type: 'song', status: 'preparing', occurrenceId: occurrenceIds[0], currentMeasureIndex: 0, totalMeasures: measures.length });
    await this.session.play(plan, 0);
  }

  pauseSong(): void { if (this.activePlayback?.type === 'song') this.session.pause(); }
  resumeSong(): void { if (this.activePlayback?.type === 'song') this.session.resume(); }
  stopSong(): void { if (this.activePlayback?.type === 'song') this.session.stop(); }

  private toPlaybackMeasures(resolvedMeasures: ResolvedSongPartMeasure[]): PlayingPatternPlaybackMeasure[] {
    return resolvedMeasures.map((resolvedMeasure) => ({
      measure: resolvedMeasure.measure,
      actionGrips: resolvedMeasure.measure.actionGrips ?? []
    }));
  }

  private getTuningForSheet(sheet: SongSheet | SongSheetWithData): Note[] {
    return sheet.tuning.map(noteValue => transpose(noteValue, sheet.capodaster));
  }
}
