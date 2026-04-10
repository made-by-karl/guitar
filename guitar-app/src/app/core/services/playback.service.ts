import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MidiService } from '@/app/core/services/midi.service';
import { MidiInstruction, MidiNote, MidiTechnique } from '@/app/core/services/midi.model';
import { noteNameToNote } from '@/app/core/music/semitones';
import { FinitePlaybackScheduler, PlaybackStatus } from '@/app/core/services/playback-scheduler.service';

/**
 * Describes a finite playback run as timed instructions plus segment boundaries.
 */
export interface PlaybackPlan {
  instructions: MidiInstruction[];
  segmentStartTimes: number[];
  totalDuration: number;
  totalSegments: number;
}

/**
 * Represents the transport state of a playback session.
 */
export interface PlaybackSessionState {
  sessionId: string;
  scope: string;
  status: PlaybackStatus;
  cursor: number;
  total: number;
  canPause: boolean;
  canSeek: boolean;
}

/**
 * Controls a finite playback run and exposes its transport state.
 */
export interface PlaybackSession {
  readonly state$: Observable<PlaybackSessionState>;
  /** Returns the current transport state without subscribing. */
  getSnapshot(): PlaybackSessionState;
  /** Starts playback for the provided plan, optionally from a later segment. */
  play(plan: PlaybackPlan, startCursor?: number): Promise<void>;
  /** Suspends playback and keeps the current segment position. */
  pause(): void;
  /** Continues a paused playback run from its current segment. */
  resume(): void;
  /** Stops playback and resets the session to its idle state. */
  stop(): void;
  /** Moves the transport to another segment in the active plan. */
  seek(cursor: number): void;
  /** Releases scheduler state and removes the session from the manager. */
  destroy(): void;
}

class FinitePlaybackSession implements PlaybackSession {
  private readonly scheduler = new FinitePlaybackScheduler({
    total: 0,
    scheduleFrom: (cursor, onCursor, onComplete) => this.schedulePlan(cursor, onCursor, onComplete),
    onStop: () => this.handleStop()
  });

  private readonly stateSubject = new BehaviorSubject<PlaybackSessionState>({
    sessionId: '',
    scope: '',
    status: 'idle',
    cursor: 0,
    total: 0,
    canPause: true,
    canSeek: true
  });

  readonly state$ = this.stateSubject.asObservable();

  private plan: PlaybackPlan | null = null;
  private isStartingPlayback = false;

  constructor(
    private readonly sessionId: string,
    private readonly scope: string,
    private readonly midiService: MidiService,
    private readonly beforePlay: (session: FinitePlaybackSession) => void,
    private readonly onDestroySession: (sessionId: string) => void
  ) {
    this.stateSubject.next({
      ...this.stateSubject.getValue(),
      sessionId: this.sessionId,
      scope: this.scope
    });

    this.scheduler.state$.subscribe((state) => {
      // Starting playback updates the scheduler total before the first play event,
      // which would otherwise look like a spurious "idle" transition to consumers.
      if (this.isStartingPlayback && state.status === 'idle' && this.plan) {
        return;
      }

      if (state.status === 'playing') {
        this.isStartingPlayback = false;
      }

      this.stateSubject.next({
        sessionId: this.sessionId,
        scope: this.scope,
        status: state.status,
        cursor: state.cursor ?? 0,
        total: state.total ?? 0,
        canPause: state.canPause,
        canSeek: state.canSeek
      });
    });
  }

  getSnapshot(): PlaybackSessionState {
    return this.stateSubject.getValue();
  }

  async play(plan: PlaybackPlan, startCursor: number = 0): Promise<void> {
    if (plan.instructions.length === 0 || plan.totalSegments === 0) {
      this.stop();
      return;
    }

    await this.midiService.ensureReady();
    this.beforePlay(this);
    this.plan = plan;
    this.isStartingPlayback = true;
    this.scheduler.updateTotal(plan.totalSegments);
    this.scheduler.play(startCursor);
  }

  pause(): void {
    this.scheduler.pause();
  }

  resume(): void {
    if (!this.plan) {
      return;
    }

    this.scheduler.resume();
  }

  stop(): void {
    this.isStartingPlayback = false;
    this.plan = null;
    this.scheduler.stop();
  }

  seek(cursor: number): void {
    if (!this.plan) {
      return;
    }

    this.scheduler.seek(cursor);
  }

  destroy(): void {
    this.isStartingPlayback = false;
    this.plan = null;
    this.scheduler.destroy();
    this.stateSubject.complete();
    this.onDestroySession(this.sessionId);
  }

  isActive(): boolean {
    const status = this.getSnapshot().status;
    return status === 'playing' || status === 'paused';
  }

  hasScope(scope: string): boolean {
    return this.scope === scope;
  }

  private schedulePlan(
    startCursor: number,
    onCursor: (cursor: number) => void,
    onComplete: () => void
  ): () => void {
    const plan = this.plan;
    if (!plan) {
      onComplete();
      return () => {};
    }

    const startTime = plan.segmentStartTimes[startCursor] ?? 0;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    onCursor(startCursor);

    for (let segmentIndex = startCursor; segmentIndex < plan.totalSegments; segmentIndex++) {
      const delay = Math.max(0, (plan.segmentStartTimes[segmentIndex] - startTime) * 1000);
      timeoutIds.push(setTimeout(() => {
        onCursor(segmentIndex);
      }, delay));
    }

    for (const instruction of plan.instructions) {
      if (instruction.time < startTime) {
        continue;
      }

      const delay = Math.max(0, (instruction.time - startTime) * 1000);
      timeoutIds.push(setTimeout(() => {
        this.midiService.triggerInstruction({
          ...instruction,
          time: instruction.time - startTime
        });
      }, delay));
    }

    timeoutIds.push(setTimeout(() => {
      this.isStartingPlayback = false;
      this.plan = null;
      onComplete();
    }, Math.max(0, (plan.totalDuration - startTime + 0.1) * 1000)));

    return () => {
      for (const id of timeoutIds) {
        clearTimeout(id);
      }
    };
  }

  private handleStop(): void {
    this.isStartingPlayback = false;
    this.plan = null;
  }
}

@Injectable({
  providedIn: 'root'
})
/**
 * Provides generic playback primitives for finite sessions and direct note playback.
 */
export class PlaybackService {
  private readonly finiteSessions = new Map<string, FinitePlaybackSession>();

  constructor(private midiService: MidiService) { }

  /**
   * Returns a stable finite playback session for the given identifier.
   */
  getFiniteSession(sessionId: string, scope: string = 'finite-playback'): PlaybackSession {
    const existing = this.finiteSessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const session = new FinitePlaybackSession(
      sessionId,
      scope,
      this.midiService,
      (nextSession) => this.stopOtherFiniteSessionsInScope(nextSession),
      (destroyedSessionId) => this.finiteSessions.delete(destroyedSessionId)
    );

    this.finiteSessions.set(sessionId, session);
    return session;
  }

  /**
   * Play a chord from note names (e.g., ["E4", "A4", "C5"])
   */
  async playChordFromNotes(
    noteNames: string[],
    duration: number = 2.0,
    velocity: number = 0.7,
    technique: MidiTechnique = 'normal'
  ): Promise<void> {
    const notes: MidiNote[] = noteNames.map(noteName => ({
      note: noteNameToNote(noteName)
    }));

    const instruction: MidiInstruction = {
      time: 0,
      playbackDuration: duration,
      actionDuration: duration,
      notes,
      velocity,
      technique,
      playNotes: 'parallel'
    };

    await this.midiService.playSequence([instruction]);
  }

  private stopOtherFiniteSessionsInScope(nextSession: FinitePlaybackSession): void {
    const scope = nextSession.getSnapshot().scope;

    for (const session of this.finiteSessions.values()) {
      if (session === nextSession) {
        continue;
      }

      // Sessions in the same scope represent competing transports in one UI context.
      if (session.hasScope(scope) && session.isActive()) {
        session.stop();
      }
    }
  }
}
