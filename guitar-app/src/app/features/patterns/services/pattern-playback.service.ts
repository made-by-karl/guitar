import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PlaybackService } from '@/app/core/services/playback.service';
import { PlaybackStatus } from '@/app/core/services/playback-scheduler.service';
import { Grip } from '@/app/features/grips/services/grips/grip.model';
import { note, Note } from '@/app/core/music/semitones';
import { RhythmPattern } from '@/app/features/patterns/services/rhythm-patterns.model';
import {
  RhythmPatternPlaybackMeasure,
  RhythmPatternPlaybackPlannerService
} from '@/app/features/patterns/services/rhythm-pattern-playback-planner.service';

export interface PatternPlaybackState {
  status: PlaybackStatus;
  patternId?: string;
  currentMeasureIndex?: number;
  totalMeasures?: number;
}

@Injectable({ providedIn: 'root' })
export class PatternPlaybackService {
  private readonly stateSubject = new BehaviorSubject<PatternPlaybackState>({
    status: 'idle'
  });

  readonly state$ = this.stateSubject.asObservable();

  private readonly session;
  private activePreview: { patternId: string; totalMeasures: number } | null = null;

  private readonly defaultTuning = [
    note('E', 2),
    note('A', 2),
    note('D', 3),
    note('G', 3),
    note('B', 3),
    note('E', 4)
  ];

  private readonly defaultGrip: Grip = {
    strings: ['o', [{ fret: 2 }], [{ fret: 2 }], [{ fret: 1 }], 'o', 'o']
  };

  constructor(
    private playback: PlaybackService,
    private planner: RhythmPatternPlaybackPlannerService
  ) {
    this.session = this.playback.getFiniteSession('pattern-preview');
    this.session.state$.subscribe((state) => {
      if (!this.activePreview || state.status === 'idle') {
        this.activePreview = null;
        this.stateSubject.next({ status: 'idle' });
        return;
      }

      this.stateSubject.next({
        status: state.status,
        patternId: this.activePreview.patternId,
        currentMeasureIndex: state.cursor,
        totalMeasures: this.activePreview.totalMeasures
      });
    });
  }

  getSnapshot(): PatternPlaybackState {
    return this.stateSubject.getValue();
  }

  async togglePatternPreview(
    pattern: RhythmPattern,
    tuning?: Note[],
    grip?: Grip,
    tempo: number = 80
  ): Promise<void> {
    const snapshot = this.getSnapshot();
    if (snapshot.status === 'playing' && snapshot.patternId === pattern.id) {
      this.stopPatternPreview();
      return;
    }

    const measures = pattern.measures.map<RhythmPatternPlaybackMeasure>((measure, measureIndex) => ({
      measure,
      beatGrips: (pattern.beatGrips ?? []).filter(gripValue => gripValue.measureIndex === measureIndex),
      actionGripOverrides: (pattern.actionGripOverrides ?? []).filter(gripValue => gripValue.measureIndex === measureIndex)
    }));

    const preview = this.planner.buildPlaybackPlan(
      measures,
      tuning ?? this.defaultTuning,
      tempo,
      grip ?? this.defaultGrip
    );

    if (preview.instructions.length === 0) {
      return;
    }

    this.activePreview = {
      patternId: pattern.id,
      totalMeasures: preview.totalSegments
    };
    this.stateSubject.next({
      status: 'playing',
      patternId: pattern.id,
      currentMeasureIndex: 0,
      totalMeasures: preview.totalSegments
    });

    await this.session.play(preview, 0);
  }

  stopPatternPreview(): void {
    this.session.stop();
  }
}
