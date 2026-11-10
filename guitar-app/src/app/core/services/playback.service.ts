import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { MidiInstruction, MidiNote, MidiTechnique } from '@/app/core/services/midi.model';
import { noteNameToNote } from '@/app/core/music/semitones';
import { RenderedAudioService } from '@/app/core/services/rendered-audio.service';
import { HtmlAudioPlaybackService, HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';

export type PlaybackStatus = 'idle' | 'preparing' | 'playing' | 'paused';

export interface PlaybackPlan {
  instructions: MidiInstruction[];
  segmentStartTimes: number[];
  totalDuration: number;
  totalSegments: number;
}
export interface PlaybackSessionState {
  sessionId: string; scope: string; status: PlaybackStatus; cursor: number;
  total: number; canPause: boolean; canSeek: boolean;
}
export interface PlaybackSession {
  readonly state$: Observable<PlaybackSessionState>;
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
  private plan: PlaybackPlan | null = null;
  private readonly progress: Subscription;
  private destroyed = false;

  constructor(
    private readonly sessionId: string,
    private readonly scope: string,
    private readonly rendered: RenderedAudioService,
    private readonly media: HtmlAudioPlaybackService,
    private readonly beforePlay: (session: FinitePlaybackSession) => void,
    private readonly onDestroySession: (id: string) => void
  ) {
    this.stateSubject = new BehaviorSubject<PlaybackSessionState>({ sessionId, scope,
      status: 'idle', cursor: 0, total: 0, canPause: false, canSeek: false });
    this.state$ = this.stateSubject.asObservable();
    this.progress = media.progress$(this.channel).subscribe(state => this.onProgress(state));
  }
  getSnapshot(): PlaybackSessionState { return this.stateSubject.value; }
  async play(plan: PlaybackPlan, startCursor = 0): Promise<void> {
    if (this.destroyed) return;
    if (!plan.instructions.length || !plan.totalSegments) { this.stop(); return; }
    this.beforePlay(this);
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
    this.media.release(this.channel); this.stateSubject.complete(); this.onDestroySession(this.sessionId);
  }
  isActive(): boolean { return this.getSnapshot().status !== 'idle'; }
  hasScope(scope: string): boolean { return this.scope === scope; }
  private get channel(): string { return `finite:${this.sessionId}`; }
  private clamp(cursor: number): number { return Math.max(0, Math.min((this.plan?.totalSegments ?? 1) - 1, Math.round(cursor))); }
  private onProgress(progress: HtmlAudioProgress): void {
    const plan = this.plan;
    if (!plan) return;
    const status: PlaybackStatus = progress.status === 'preparing' || progress.status === 'starting' ? 'preparing'
      : progress.status === 'ready' || progress.status === 'error' ? 'paused' : progress.status;
    let cursor = 0;
    plan.segmentStartTimes.forEach((time, index) => { if (time <= progress.currentTime) cursor = index; });
    this.stateSubject.next({ ...this.getSnapshot(), status, cursor: status === 'idle' ? 0 : this.clamp(cursor),
      total: plan.totalSegments, canPause: status === 'playing', canSeek: status === 'playing' || status === 'paused' });
    // Ended comes from the media element after its release tail, never from plan duration.
    if (status === 'idle' && this.plan === plan) this.plan = null;
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
      playNotes: 'parallel'
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
