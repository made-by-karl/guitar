import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PlaybackPlan, PlaybackService } from '@/app/core/services/playback.service';
import { PlaybackStatus } from '@/app/core/services/playback-scheduler.service';
import { Note, transpose } from '@/app/core/music/semitones';
import {
  ResolvedSongPartMeasure,
  SongPart,
  SongSheet,
  SongSheetWithData
} from '@/app/features/sheets/services/song-sheets.model';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import {
  PlayingPatternPlaybackMeasure,
  PlayingPatternPlaybackPlannerService
} from '@/app/features/patterns/services/playing-pattern-playback-planner.service';

type SongSheetPlaybackSessionType = 'none' | 'measure' | 'part';

export interface SongSheetPlaybackState {
  type: SongSheetPlaybackSessionType;
  status: PlaybackStatus;
  partId?: string;
  itemId?: string;
  itemMeasureIndex?: number;
  currentMeasureIndex?: number;
  totalMeasures?: number;
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
    | { type: 'measure'; partId: string; itemId: string; itemMeasureIndex: number; totalMeasures: number; }
    | { type: 'part'; partId: string; totalMeasures: number; }
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

      if (this.activePlayback.type === 'measure') {
        this.stateSubject.next({
          type: 'measure',
          status: state.status,
          partId: this.activePlayback.partId,
          itemId: this.activePlayback.itemId,
          itemMeasureIndex: this.activePlayback.itemMeasureIndex,
          currentMeasureIndex: state.cursor,
          totalMeasures: this.activePlayback.totalMeasures
        });
        return;
      }

      this.stateSubject.next({
        type: 'part',
        status: state.status,
        partId: this.activePlayback.partId,
        currentMeasureIndex: state.cursor,
        totalMeasures: this.activePlayback.totalMeasures
      });
    });
  }

  getSnapshot(): SongSheetPlaybackState {
    return this.stateSubject.getValue();
  }

  async toggleMeasurePreview(
    sheet: SongSheet | SongSheetWithData,
    part: SongPart,
    itemId: string,
    itemMeasureIndex: number
  ): Promise<void> {
    const snapshot = this.getSnapshot();
    if (
      snapshot.type === 'measure' &&
      snapshot.status === 'playing' &&
      snapshot.partId === part.id &&
      snapshot.itemId === itemId &&
      snapshot.itemMeasureIndex === itemMeasureIndex
    ) {
      this.stopMeasurePreview();
      return;
    }

    const resolvedMeasures = this.songSheetsService.resolvePartMeasures(sheet, part);
    const targetMeasure = resolvedMeasures.find(
      measure => measure.itemId === itemId && measure.measureIndex === itemMeasureIndex
    );

    if (!targetMeasure) {
      return;
    }

    const mergedMeasures = this.toPlaybackMeasures(resolvedMeasures);
    const preview = this.buildMeasurePreview(sheet, mergedMeasures, targetMeasure.absoluteMeasureIndex);
    if (!preview || preview.instructions.length === 0) {
      return;
    }

    this.activePlayback = {
      type: 'measure',
      partId: part.id,
      itemId,
      itemMeasureIndex,
      totalMeasures: 1
    };
    this.stateSubject.next({
      type: 'measure',
      status: 'playing',
      partId: part.id,
      itemId,
      itemMeasureIndex,
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

  async playSongPart(sheet: SongSheet | SongSheetWithData, part: SongPart): Promise<void> {
    const resolvedMeasures = this.songSheetsService.resolvePartMeasures(sheet, part);
    if (resolvedMeasures.length === 0) {
      return;
    }

    const plan = this.planner.buildPlaybackPlan(
      this.toPlaybackMeasures(resolvedMeasures),
      this.getTuningForSheet(sheet),
      sheet.tempo
    );

    if (plan.instructions.length === 0) {
      return;
    }

    this.activePlayback = {
      type: 'part',
      partId: part.id,
      totalMeasures: plan.totalSegments
    };
    this.stateSubject.next({
      type: 'part',
      status: 'playing',
      partId: part.id,
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
    absoluteMeasureIndex: number
  ): PlaybackPlan | undefined {
    const targetMeasure = measures[absoluteMeasureIndex];
    if (!targetMeasure) {
      return undefined;
    }

    const initialGrip = this.planner.resolveGripBeforeMeasure(measures, absoluteMeasureIndex);
    return this.planner.buildPlaybackPlan(
      [targetMeasure],
      this.getTuningForSheet(sheet),
      sheet.tempo,
      initialGrip
    );
  }

  private toPlaybackMeasures(resolvedMeasures: ResolvedSongPartMeasure[]): PlayingPatternPlaybackMeasure[] {
    return resolvedMeasures.map((resolvedMeasure) => ({
      measure: resolvedMeasure.measure,
      actionGripOverrides: [
        ...resolvedMeasure.actionGripOverrides,
        ...resolvedMeasure.patternActionGripOverrides
      ],
      beatGrips: [
        ...resolvedMeasure.beatGrips,
        ...resolvedMeasure.patternBeatGrips
      ]
    }));
  }

  private getTuningForSheet(sheet: SongSheet | SongSheetWithData): Note[] {
    return sheet.tuning.map(noteValue => transpose(noteValue, sheet.capodaster));
  }
}
