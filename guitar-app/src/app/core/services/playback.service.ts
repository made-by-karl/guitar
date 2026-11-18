import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { MidiInstruction, MidiNote, MidiTechnique } from '@/app/core/services/midi.model';
import { noteNameToNote } from '@/app/core/music/semitones';
import { RenderedAudioService } from '@/app/core/services/rendered-audio.service';
import { HtmlAudioPlaybackService, HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';

export type PlaybackStatus = 'idle' | 'preparing' | 'playing' | 'paused';

export interface PlaybackSlot {
  time: number; segmentIndex: number; actionIndex: number;
}

export interface PlaybackPlan {
  slots?: PlaybackSlot[];
  instructions: MidiInstruction[];
  segmentStartTimes: number[];
  totalDuration: number;
  totalSegments: number;
}
export interface PlaybackSessionState {
  runId?: number; actionIndex?: number;
  sessionId: string; scope: string; status: PlaybackStatus; cursor: number;
  total: number; canPause: boolean; canSeek: boolean; ended: boolean;
}
/** Continuous samples of the same media clock used for discrete notation positions. */
export interface PlaybackClockPosition {
  runId?: number;
  currentTime: number;
}

export interface PlaybackSession {
  readonly state$: Observable<PlaybackSessionState>;
  readonly clock$: Observable<PlaybackClockPosition>;
  getSnapshot(): PlaybackSessionState;
  play(plan: PlaybackPlan, startCursor?: number): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  seek(cursor: number): void;
  destroy(): void;
}

class FinitePlaybackSession implements PlaybackSession {
  private readonly stateSubject: BehaviorSubject<PlaybackSessionState>;
  readonly state$: Observable<PlaybackSessionState>;
  private readonly clockSubject = new BehaviorSubject<PlaybackClockPosition>({ currentTime: 0 });
  readonly clock$ = this.clockSubject.asObservable();
  private plan: PlaybackPlan | null = null;
  private readonly progress: Subscription;
  private destroyed = false;
  private runId = 0;

  constructor(
    private readonly sessionId: string,
    private readonly scope: string,
    private readonly rendered: RenderedAudioService,
    private readonly media: HtmlAudioPlaybackService,
    private readonly beforePlay: (session: FinitePlaybackSession) => void,
    private readonly onDestroySession: (id: string) => void
  ) {
    this.stateSubject = new BehaviorSubject<PlaybackSessionState>({ sessionId, scope,
      status: 'idle', cursor: 0, total: 0, canPause: false, canSeek: false, ended: false });
    this.state$ = this.stateSubject.asObservable();
    this.progress = media.progress$(this.channel).subscribe(state => this.onProgress(state));
  }
  getSnapshot(): PlaybackSessionState { return this.stateSubject.value; }
  async play(plan: PlaybackPlan, startCursor = 0): Promise<void> {
    if (this.destroyed) return;
    if (!plan.instructions.length || !plan.totalSegments) { this.stop(); return; }
    this.beforePlay(this);
    this.runId++;
    this.plan = plan;
    const startTime = plan.segmentStartTimes[this.clamp(startCursor)] ?? 0;
    await this.media.play(this.channel, signal => this.rendered.renderInstructions(plan.instructions, plan.totalDuration, signal),
      { label: this.sessionId === 'pattern-preview' ? 'Pattern preview' : 'Song playback', startTime });
  }
  pause(): void { this.media.pause(this.channel); }
  resume(): void { if (this.plan) void this.media.resume(this.channel); }
  stop(): void { this.media.stop(this.channel); this.plan = null; }
  seek(cursor: number): void {
    if (this.plan && this.getSnapshot().canSeek) this.media.seek(this.channel, this.plan.segmentStartTimes[this.clamp(cursor)] ?? 0);
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true; this.stop(); this.progress.unsubscribe();
    this.media.release(this.channel); this.stateSubject.complete(); this.clockSubject.complete(); this.onDestroySession(this.sessionId);
  }
  isActive(): boolean { return this.getSnapshot().status !== 'idle' || this.getSnapshot().ended; }
  hasScope(scope: string): boolean { return this.scope === scope; }
  private get channel(): string { return `finite:${this.sessionId}`; }
  private clamp(cursor: number): number { return Math.max(0, Math.min((this.plan?.totalSegments ?? 1) - 1, Math.round(cursor))); }
  private onProgress(progress: HtmlAudioProgress): void {
    const plan = this.plan;
    const runId = this.runId;
    if (!plan) return;
    const status: PlaybackStatus = progress.status === 'preparing' || progress.status === 'starting' ? 'preparing'
      : progress.status === 'ready' || progress.status === 'error' ? 'paused' : progress.status;
    // Media seeks truncate to microseconds in some engines. A sub-microsecond
    // difference at (for example) 180 BPM belongs to the requested boundary.
    const presentationTime = progress.currentTime + 0.000001;
    let cursor = 0;
    plan.segmentStartTimes.forEach((time, index) => { if (time <= presentationTime) cursor = index; });
    // A frame samples media time directly: delayed frames skip stale slots. Retain the
    // final slot through the rendered release tail, clearing it only on actual end.
    const slots = plan.slots ?? [];
    let low = 0, high = slots.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (slots[middle].time <= presentationTime) low = middle + 1;
      else high = middle;
    }
    const slot = slots[low - 1];
    const actionIndex = (status === 'playing' || progress.status === 'paused') && slot?.segmentIndex === cursor
      ? slot.actionIndex : undefined;
    const next: PlaybackSessionState = { ...this.getSnapshot(), runId: this.runId, actionIndex, status, cursor: status === 'idle' ? 0 : this.clamp(cursor),
      total: plan.totalSegments, canPause: status === 'playing', canSeek: status === 'playing' || status === 'paused', ended: progress.ended };
    if (Object.keys(next).some(key => next[key as keyof PlaybackSessionState] !== this.getSnapshot()[key as keyof PlaybackSessionState])) {
      this.stateSubject.next(next);
    }
    // A state subscriber may synchronously stop or replace this run.
    if (this.plan !== plan || this.runId !== runId || this.destroyed) return;
    this.clockSubject.next({ runId, currentTime: progress.currentTime });
    // Ended comes from the media element after its release tail, never from plan duration.
    // The system player can replay completed media. Keep its plan so cursor and
    // transport state follow that replay; explicit Stop/replacement still clear it.
    if (status === 'idle' && !progress.ended && this.plan === plan && this.runId === runId) this.plan = null;
  }
}

@Injectable({ providedIn: 'root' })
/**
 * Provides generic playback primitives for finite sessions and direct note playback.
 */
export class PlaybackService implements OnDestroy {
  private readonly finiteSessions = new Map<string, FinitePlaybackSession>();

  constructor(private rendered: RenderedAudioService, private media: HtmlAudioPlaybackService) {}

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
      this.rendered,
      this.media,
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
    technique: MidiTechnique = 'normal',
    owner: string = 'chord-preview'
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
      playNotes: technique === 'dead-note' ? 'sequential' : 'parallel'
    };

    await this.media.play(owner, signal => this.rendered.renderInstructions([instruction], duration, signal), { label: 'Chord preview' });
  }

  stopChordPreview(owner = 'chord-preview'): void { this.media.release(owner); }

  ngOnDestroy(): void {
    for (const session of [...this.finiteSessions.values()]) session.destroy();
    this.media.release('chord-preview');
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
