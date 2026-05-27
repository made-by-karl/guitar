import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PlaybackService } from '@/app/core/services/playback.service';
import { PlaybackStatus } from '@/app/core/services/playback-scheduler.service';
import { note, Note } from '@/app/core/music/semitones';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import {
  PlayingPatternPlaybackMeasure,
  PlayingPatternPlaybackPlannerService
} from '@/app/features/patterns/services/playing-pattern-playback-planner.service';

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

  private readonly gripIdForE = 'o|2|2|1|o|o';
  private readonly gripIdForA = 'x|o|2|2|2|o';

  constructor(
    private playback: PlaybackService,
    private planner: PlayingPatternPlaybackPlannerService
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
    pattern: PlayingPattern,
    tuning?: Note[],
    grips?: string[],
    tempo: number = 80
  ): Promise<void> {
    const snapshot = this.getSnapshot();
    if (snapshot.status === 'playing' && snapshot.patternId === pattern.id) {
      this.stopPatternPreview();
      return;
    }

    grips = grips ?? [ this.gripIdForE, this.gripIdForA ];
    const measures = grips.flatMap((grip) => this.createPlaybackMeasures(pattern, grip));

    const preview = this.planner.buildPlaybackPlan(
      measures,
      tuning ?? this.defaultTuning,
      tempo
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

  private createPlaybackMeasures(pattern: PlayingPattern, defaultGripId: string): PlayingPatternPlaybackMeasure[] {
    return pattern.measures.map<PlayingPatternPlaybackMeasure>((measure, measureIndex) => {
      // Inserts the default grip as actionGrip, if the pattern does not contain a grip
      let actionGrips = (pattern.actionGrips ?? []).filter(v => v.measureIndex === measureIndex);
      const addDefaultGrip = !(actionGrips.length > 0 && actionGrips[0].actionIndex === 0);
      if (addDefaultGrip) {
        actionGrips = [{ measureIndex, actionIndex: 0, gripId: defaultGripId, name: defaultGripId }, ...actionGrips];
      }

      return ({
        measure,
        actionGrips
      });
    });
  }
}
