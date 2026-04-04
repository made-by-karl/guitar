import { BehaviorSubject, Observable } from 'rxjs';
import { AudioService } from '@/app/core/services/audio.service';

export type PlaybackScheduleMode = 'repeat' | 'finite';
export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface PlaybackScheduleState<TCursor = number> {
  mode: PlaybackScheduleMode;
  status: PlaybackStatus;
  cursor: TCursor | null;
  total: number | null;
  canPause: boolean;
  canSeek: boolean;
}

export interface PlaybackScheduler<TCursor = number> {
  readonly state$: Observable<PlaybackScheduleState<TCursor>>;
  getSnapshot(): PlaybackScheduleState<TCursor>;
  play(cursor?: TCursor): void | Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  seek(cursor: TCursor): void;
  destroy(): void;
}

interface FinitePlaybackSchedulerOptions {
  total: number;
  scheduleFrom: (
    cursor: number,
    onCursor: (cursor: number) => void,
    onComplete: () => void
  ) => () => void;
  onStop?: () => void;
}

export class FinitePlaybackScheduler implements PlaybackScheduler<number> {
  private cancelCurrent: (() => void) | null = null;
  private total: number;
  private readonly stateSubject = new BehaviorSubject<PlaybackScheduleState<number>>({
    mode: 'finite',
    status: 'idle',
    cursor: 0,
    total: 0,
    canPause: true,
    canSeek: true
  });

  readonly state$ = this.stateSubject.asObservable();

  constructor(private readonly options: FinitePlaybackSchedulerOptions) {
    this.total = options.total;
    this.stateSubject.next({
      ...this.stateSubject.getValue(),
      total: this.total
    });
  }

  getSnapshot(): PlaybackScheduleState<number> {
    return this.stateSubject.getValue();
  }

  updateTotal(total: number): void {
    this.total = total;
    this.stateSubject.next({
      ...this.stateSubject.getValue(),
      total,
      cursor: total === 0 ? 0 : Math.min(this.getSnapshot().cursor ?? 0, total - 1)
    });
  }

  play(cursor: number = 0): void {
    const nextCursor = this.clampCursor(cursor);
    this.startAt(nextCursor);
  }

  pause(): void {
    const snapshot = this.getSnapshot();
    if (snapshot.status !== 'playing') {
      return;
    }

    this.cancelScheduledWork();
    this.stateSubject.next({
      ...snapshot,
      status: 'paused'
    });
  }

  resume(): void {
    const snapshot = this.getSnapshot();
    if (snapshot.status !== 'paused') {
      return;
    }

    this.startAt(this.clampCursor(snapshot.cursor ?? 0));
  }

  stop(): void {
    const snapshot = this.getSnapshot();
    this.cancelScheduledWork();
    this.options.onStop?.();
    this.stateSubject.next({
      ...snapshot,
      status: 'idle',
      cursor: 0
    });
  }

  seek(cursor: number): void {
    const nextCursor = this.clampCursor(cursor);
    const snapshot = this.getSnapshot();

    if (snapshot.status === 'playing') {
      this.startAt(nextCursor);
      return;
    }

    this.stateSubject.next({
      ...snapshot,
      cursor: nextCursor
    });
  }

  destroy(): void {
    this.stop();
    this.stateSubject.complete();
  }

  private startAt(cursor: number): void {
    this.cancelScheduledWork();

    const total = this.total;
    if (total === 0) {
      this.stateSubject.next({
        ...this.getSnapshot(),
        status: 'idle',
        cursor: 0
      });
      return;
    }

    this.stateSubject.next({
      ...this.getSnapshot(),
      status: 'playing',
      cursor
    });

    this.cancelCurrent = this.options.scheduleFrom(
      cursor,
      (nextCursor) => {
        const snapshot = this.getSnapshot();
        this.stateSubject.next({
          ...snapshot,
          cursor: this.clampCursor(nextCursor)
        });
      },
      () => {
        const snapshot = this.getSnapshot();
        this.cancelCurrent = null;
        this.stateSubject.next({
          ...snapshot,
          status: 'idle',
          cursor: 0
        });
      }
    );
  }

  private cancelScheduledWork(): void {
    this.cancelCurrent?.();
    this.cancelCurrent = null;
  }

  private clampCursor(cursor: number): number {
    const total = this.total;
    if (total <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(total - 1, Math.round(cursor)));
  }
}

export class TransportRepeatPlaybackScheduler implements PlaybackScheduler<number> {
  private scheduledIds: number[] = [];
  private readonly stateSubject = new BehaviorSubject<PlaybackScheduleState<number>>({
    mode: 'repeat',
    status: 'idle',
    cursor: 0,
    total: null,
    canPause: true,
    canSeek: false
  });

  readonly state$ = this.stateSubject.asObservable();

  constructor(private readonly audioService: AudioService) {}

  getSnapshot(): PlaybackScheduleState<number> {
    return this.stateSubject.getValue();
  }

  play(): void {
    const transport = this.audioService.getTransport();
    if (transport.state !== 'started') {
      transport.start();
    }

    this.stateSubject.next({
      ...this.getSnapshot(),
      status: 'playing'
    });
  }

  pause(): void {
    const transport = this.audioService.getTransport() as ReturnType<typeof this.audioService.getTransport> & { pause?: () => void };
    if (typeof transport.pause === 'function') {
      transport.pause();
    } else {
      transport.stop();
    }

    this.stateSubject.next({
      ...this.getSnapshot(),
      status: 'paused'
    });
  }

  resume(): void {
    this.play();
  }

  stop(): void {
    this.clearScheduledIds();
    const transport = this.audioService.getTransport();
    transport.stop();
    this.stateSubject.next({
      ...this.getSnapshot(),
      status: 'idle',
      cursor: 0
    });
  }

  seek(cursor: number): void {
    this.stateSubject.next({
      ...this.getSnapshot(),
      cursor
    });
  }

  replaceSchedule(scheduleFactory: () => number[], shouldPlay: boolean): void {
    this.clearScheduledIds();

    if (!shouldPlay) {
      this.stateSubject.next({
        ...this.getSnapshot(),
        status: 'idle'
      });
      return;
    }

    this.play();
    this.scheduledIds = scheduleFactory();
  }

  destroy(): void {
    this.stop();
    this.stateSubject.complete();
  }

  private clearScheduledIds(): void {
    const transport = this.audioService.getTransport();
    for (const id of this.scheduledIds) {
      transport.clear(id);
    }
    this.scheduledIds = [];
  }
}
