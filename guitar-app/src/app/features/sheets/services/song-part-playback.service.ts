import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PlaybackService, PlaybackStatus } from '@/app/core/services/playback.service';
import { Note, transpose } from '@/app/core/music/semitones';
import { getSongArrangement, getOccurrenceHistory, getOccurrenceNumber } from '@/app/features/sheets/services/song-arrangement';
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

import { Measure } from '@/app/features/patterns/services/playing-patterns.model';

export interface SongPlaybackMeasure {
  part: SongPart;
  measureId: string;
  measureIndex: number;
  occurrenceId?: string;
  occurrenceNumber?: number;
  precedingMeasures: Measure[];
}
export interface SongPlaybackSequence {
  measures: Measure[];
  precedingMeasures: Measure[];
}

export type SongPlaybackSource = 'song' | 'parts' | 'editor';

type SongSheetPlaybackSessionType = 'none' | 'measure' | 'part' | 'song';

export interface SongSheetPlaybackState {
  runId?: number;
  actionIndex?: number;
  source?: SongPlaybackSource;
  presentation?: SongPlaybackMeasure;
  sequence?: SongPlaybackSequence;
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
  private activePlayback: {
    type: 'measure' | 'part' | 'song';
    rows: SongPlaybackMeasure[];
    sequence: SongPlaybackSequence;
    source: SongPlaybackSource;
  } | null = null;

  constructor(
    private playback: PlaybackService,
    private songSheetsService: SongSheetsService,
    private planner: PlayingPatternPlaybackPlannerService
  ) {
    this.session = this.playback.getFiniteSession('song-part-playback');
    this.session.state$.subscribe((state) => {
      if (!this.activePlayback || state.status === 'idle') {
        if (!state.ended) this.activePlayback = null;
        this.stateSubject.next({
          type: 'none',
          status: 'idle'
        });
        return;
      }

      const active = this.activePlayback;
      const row = active.rows[state.cursor];
      this.stateSubject.next({
        type: active.type, status: state.status, runId: state.runId,
        actionIndex: state.actionIndex, source: active.source, presentation: row, sequence: active.sequence,
        partId: row?.part.id, measureId: row?.measureId, occurrenceId: row?.occurrenceId,
        currentMeasureIndex: state.cursor, totalMeasures: active.rows.length
      });
    });
  }

  pause(): void { this.session.pause(); }
  resume(): void { this.session.resume(); }
  stop(): void { this.session.stop(); }

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

    part = this.copyPart(part);
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

    this.activate('measure', [this.rowsForPart(sheet, part, occurrenceId)[targetMeasureIndex]], 'editor');

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

  async playSongPart(sheet: SongSheet | SongSheetWithData, part: SongPart, occurrenceId?: string, source: SongPlaybackSource = 'parts'): Promise<void> {
    part = this.copyPart(part);
    const plan = this.buildPartPlaybackPlan(sheet, part, occurrenceId);
    for (const message of plan.diagnostics) console.warn(message);
    if (plan.instructions.length === 0) return;

    this.activate('part', this.rowsForPart(sheet, part, occurrenceId), source);

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
    const rows: SongPlaybackMeasure[] = [];
    for (const occurrence of getSongArrangement(sheet)) {
      const part = this.copyPart(sheet.parts.find(item => item.id === occurrence.partId)!);
      rows.push(...this.rowsForPart(sheet, part, occurrence.id));
      for (const item of part.measures) {
        measures.push({ measure: item.measure, actionGrips: item.measure.actionGrips ?? [] });
      }
    }
    const plan = this.planner.buildPlaybackPlan(measures, this.getTuningForSheet(sheet), sheet.tempo);
    for (const message of plan.diagnostics) console.warn(message);
    this.activate('song', rows, 'song');
    await this.session.play(plan, 0);
  }

  pauseSong(): void { if (this.activePlayback?.type === 'song') this.session.pause(); }
  resumeSong(): void { if (this.activePlayback?.type === 'song') this.session.resume(); }
  stopSong(): void { if (this.activePlayback?.type === 'song') this.session.stop(); }

  private activate(type: 'measure' | 'part' | 'song', rows: SongPlaybackMeasure[], source: SongPlaybackSource): void {
    this.activePlayback = { type, rows, source, sequence: {
      measures: rows.map(row => row.part.measures[row.measureIndex].measure),
      precedingMeasures: rows[0]?.precedingMeasures ?? []
    } };
  }

  private copyPart(part: SongPart): SongPart {
    return JSON.parse(JSON.stringify(part)) as SongPart;
  }

  private rowsForPart(sheet: SongSheet, part: SongPart, occurrenceId?: string): SongPlaybackMeasure[] {
    const arrangement = getSongArrangement(sheet);
    const occurrence = arrangement.find(item => item.id === occurrenceId);
    const preceding = this.precedingMeasures(sheet, part, occurrenceId).map(item => item.measure);
    return part.measures.map((item, measureIndex) => ({
      part, measureId: item.id, measureIndex, occurrenceId,
      occurrenceNumber: occurrence ? getOccurrenceNumber(arrangement, occurrence) : undefined,
      precedingMeasures: JSON.parse(JSON.stringify([...preceding, ...part.measures.slice(0, measureIndex).map(entry => entry.measure)])) as Measure[]
    }));
  }

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
