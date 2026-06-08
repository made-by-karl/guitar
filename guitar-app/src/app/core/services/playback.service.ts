import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { MidiInstruction, MidiNote, MidiTechnique } from '@/app/core/services/midi.model';
import { noteNameToNote } from '@/app/core/music/semitones';
import { RenderedAudioService } from '@/app/core/services/rendered-audio.service';
import { HtmlAudioPlaybackService, HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

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
  private mediaProgressSubscription: Subscription | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly scope: string,
    private readonly renderedAudioService: RenderedAudioService,
    private readonly htmlAudioPlaybackService: HtmlAudioPlaybackService,
    private readonly beforePlay: (session: FinitePlaybackSession) => void,
    private readonly onDestroySession: (sessionId: string) => void
  ) {
    this.stateSubject.next({
      ...this.stateSubject.getValue(),
      sessionId: this.sessionId,
      scope: this.scope
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

    this.beforePlay(this);
    this.plan = plan;
    this.unsubscribeMediaProgress();

    try {
      const startTime = plan.segmentStartTimes[this.clampCursor(startCursor, plan)] ?? 0;
      const rendered = await this.renderedAudioService.renderInstructions(
        plan.instructions,
        plan.totalDuration + 0.1
      );
      await this.htmlAudioPlaybackService.play(this.mediaChannel, rendered.url, { startTime });
      this.mediaProgressSubscription = this.htmlAudioPlaybackService.progress$(this.mediaChannel)
        .subscribe(progress => this.handleMediaProgress(progress));
      this.stateSubject.next({
        sessionId: this.sessionId,
        scope: this.scope,
        status: 'playing',
        cursor: this.resolveCursor(startTime, plan),
        total: plan.totalSegments,
        canPause: true,
        canSeek: true
      });
    } catch (error) {
      console.error('Rendered playback failed:', error);
      this.unsubscribeMediaProgress();
      this.plan = null;
      this.stateSubject.next({
        ...this.getSnapshot(),
        status: 'idle',
        cursor: 0,
        total: plan.totalSegments
      });
      throw error;
    }
  }

  pause(): void {
    if (this.getSnapshot().status === 'playing') {
      this.htmlAudioPlaybackService.pause(this.mediaChannel);
      this.stateSubject.next({
        ...this.getSnapshot(),
        status: 'paused'
      });
    }
  }

  resume(): void {
    if (!this.plan) {
      return;
    }

    if (this.getSnapshot().status === 'paused') {
      void this.htmlAudioPlaybackService.resume(this.mediaChannel);
      this.stateSubject.next({
        ...this.getSnapshot(),
        status: 'playing'
      });
    }
  }

  stop(): void {
    this.plan = null;
    this.unsubscribeMediaProgress();
    this.htmlAudioPlaybackService.stop(this.mediaChannel);
    this.stateSubject.next({
      ...this.getSnapshot(),
      status: 'idle',
      cursor: 0
    });
  }

  seek(cursor: number): void {
    if (!this.plan) {
      return;
    }

    const nextCursor = this.clampCursor(cursor, this.plan);
    const nextTime = this.plan.segmentStartTimes[nextCursor] ?? 0;
    this.htmlAudioPlaybackService.seek(this.mediaChannel, nextTime);
    this.stateSubject.next({
      ...this.getSnapshot(),
      cursor: nextCursor
    });
  }

  destroy(): void {
    this.plan = null;
    this.unsubscribeMediaProgress();
    this.htmlAudioPlaybackService.stop(this.mediaChannel);
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

  private get mediaChannel(): string {
    return `finite:${this.sessionId}`;
  }

  private handleMediaProgress(progress: HtmlAudioProgress): void {
    const plan = this.plan;
    const snapshot = this.getSnapshot();
    if (!plan || snapshot.status === 'idle') {
      return;
    }

    if (progress.ended || progress.currentTime >= plan.totalDuration) {
      this.unsubscribeMediaProgress();
      this.plan = null;
      this.htmlAudioPlaybackService.stop(this.mediaChannel);
      this.stateSubject.next({
        ...snapshot,
        status: 'idle',
        cursor: 0
      });
      return;
    }

    this.stateSubject.next({
      ...snapshot,
      cursor: this.resolveCursor(progress.currentTime, plan)
    });
  }

  private resolveCursor(currentTime: number, plan: PlaybackPlan): number {
    let cursor = 0;
    for (let index = 0; index < plan.segmentStartTimes.length; index++) {
      if (plan.segmentStartTimes[index] <= currentTime) {
        cursor = index;
      } else {
        break;
      }
    }
    return this.clampCursor(cursor, plan);
  }

  private clampCursor(cursor: number, plan: PlaybackPlan): number {
    return Math.max(0, Math.min(plan.totalSegments - 1, Math.round(cursor)));
  }

  private unsubscribeMediaProgress(): void {
    this.mediaProgressSubscription?.unsubscribe();
    this.mediaProgressSubscription = null;
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

  constructor(
    private renderedAudioService: RenderedAudioService,
    private htmlAudioPlaybackService: HtmlAudioPlaybackService
  ) { }

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
      this.renderedAudioService,
      this.htmlAudioPlaybackService,
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

    try {
      const rendered = await this.renderedAudioService.renderInstructions([instruction], duration);
      await this.htmlAudioPlaybackService.play('chord-preview', rendered.url);
    } catch (error) {
      console.error('Rendered chord playback failed:', error);
      throw error;
    }
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
