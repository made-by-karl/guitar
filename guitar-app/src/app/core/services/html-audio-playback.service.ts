import { Injectable, OnDestroy, signal } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { RenderedAudio } from '@/app/core/services/rendered-audio.service';
import { StreamingAudioSource } from '@/app/core/services/streaming-audio-source';

export type PreparedMediaAudio = RenderedAudio | StreamingAudioSource;

export type MediaPlaybackStatus = 'idle' | 'preparing' | 'ready' | 'starting' | 'playing' | 'buffering' | 'paused' | 'error';
export interface HtmlAudioProgress {
  channel: string; label: string; status: MediaPlaybackStatus; currentTime: number;
  duration: number; ended: boolean; error?: string;
}
interface PlayOptions { label?: string; loop?: boolean; startTime?: number; autoStart?: boolean; previousSection?: () => void; nextSection?: () => void; }
interface Player {
  state: BehaviorSubject<HtmlAudioProgress>;
  generation: number;
  abort?: AbortController;
  audio?: HTMLAudioElement;
  url?: string;
  stream?: StreamingAudioSource;
  playIntent?: boolean;
  playAttempt?: number;
  playOrder?: number;
  frame?: number;
  frameGeneration?: number;
  prepare?: (signal: AbortSignal) => Promise<PreparedMediaAudio>;
  options: PlayOptions;
}

@Injectable({ providedIn: 'root' })
export class HtmlAudioPlaybackService implements OnDestroy {
  readonly notices = signal<HtmlAudioProgress[]>([]);
  private readonly players = new Map<string, Player>();
  private mediaOwner?: Player;
  private playOrder = 0;
  private readonly mediaActions: MediaSessionAction[] = ['play', 'pause', 'stop', 'seekto', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack'];

  progress$(channel: string): Observable<HtmlAudioProgress> { return this.player(channel).state.asObservable(); }
  getSnapshot(channel: string): HtmlAudioProgress { return this.player(channel).state.value; }

  async play(channel: string, prepare: (signal: AbortSignal) => Promise<PreparedMediaAudio>, options: PlayOptions = {}): Promise<void> {
    const player = this.player(channel);
    this.clear(player);
    player.options = options; player.prepare = prepare;
    player.abort = new AbortController();
    const generation = player.generation;
    this.emit(player, { status: 'preparing', label: options.label ?? 'Audio playback', currentTime: 0, duration: 0, ended: false, error: undefined });
    try {
      const rendered = await prepare(player.abort.signal);
      if (player.generation !== generation) { if ('kind' in rendered) rendered.dispose(); return; }
      const audio = new Audio();
      audio.preload = 'auto'; audio.loop = !!options.loop;
      player.audio = audio;
      if ('kind' in rendered) player.stream = rendered;
      else { player.url = URL.createObjectURL(rendered.blob); audio.src = player.url; }
      const current = () => player.audio === audio && player.generation === generation;
      const report = () => {
        if (current()) { this.emit(player, { currentTime: audio.currentTime || 0 }); this.updateMediaPosition(player); }
      };
      audio.addEventListener('timeupdate', report);
      audio.addEventListener('playing', () => {
        if (current() && !player.playIntent) { audio.pause(); return; }
        if (current()) { this.emit(player, { status: 'playing', currentTime: audio.currentTime || 0, error: undefined }); this.startProgress(player, audio); }
      });
      audio.addEventListener('pause', () => {
        if (current() && !audio.ended && (player.state.value.status === 'playing' || player.state.value.status === 'buffering')) {
          player.playIntent = false;
          this.stopProgress(player); this.emit(player, { status: 'paused', currentTime: audio.currentTime || 0 });
        }
      });
      audio.addEventListener('waiting', () => {
        if (current() && player.playIntent && ['starting', 'playing', 'buffering'].includes(player.state.value.status)) {
          this.stopProgress(player);
          this.emit(player, { status: player.stream ? 'buffering' : 'paused', currentTime: audio.currentTime || 0 });
        }
      });
      audio.addEventListener('ended', () => {
        if (!current()) return;
        this.stopProgress(player);
        // Keep only the system player's last clip replayable. Other channels still
        // release immediately; Stop/navigation/replacement also release this clip.
        const other = this.playingPlayer(player);
        if (this.mediaOwner !== player || other) this.clear(player);
        if (!player.stream) player.prepare = undefined;
        this.emit(player, { status: 'idle', currentTime: 0, ended: true });
      });
      audio.addEventListener('error', () => {
        if (!current()) return;
        player.stream?.onPlaybackError?.();
        this.clear(player);
        this.emit(player, { status: 'error', error: 'Audio could not be played. Retry playback.' });
      });
      if (player.stream) {
        await player.stream.attach(audio, player.abort!.signal, options.startTime ?? 0, {
          duration: duration => { if (current()) { this.emit(player, { duration }); this.updateMediaPosition(player); } },
          error: error => {
            if (!current()) return;
            this.clear(player);
            this.emit(player, { status: 'error', error: 'Playback stopped. Select Retry to prepare the audio again.' });
          }
        });
        if (!current()) return;
      }
      // Setting the initial offset before metadata is supported by media elements. Repeat
      // after metadata for browsers that defer seeks while the duration is unknown.
      audio.currentTime = Math.max(0, options.startTime ?? 0);
      audio.addEventListener('loadedmetadata', () => {
        if (current() && player.state.value.status !== 'playing') audio.currentTime = Math.max(0, player.state.value.currentTime);
      }, { once: true });
      this.emit(player, { status: 'ready', currentTime: options.startTime ?? 0, duration: rendered.durationSeconds });
      if (options.autoStart !== false) await this.resume(channel);
    } catch (error) {
      if (player.generation !== generation) return;
      const streaming = !!player.stream;
      this.clear(player);
      this.emit(player, { status: 'error', error: streaming ? 'Audio preparation was interrupted. Select Retry to try again.'
        : error instanceof Error ? error.message : 'Audio preparation failed. Retry playback.' });
    }
  }

  async resume(channel: string): Promise<void> {
    const player = this.player(channel), audio = player.audio;
    if (player.state.value.status === 'starting' || player.state.value.status === 'playing' || (player.state.value.status === 'buffering' && player.playIntent)) return;
    if (!audio) {
      if (player.prepare) await this.play(channel, player.prepare, player.options);
      return;
    }
    const generation = player.generation, attempt = player.playAttempt = (player.playAttempt ?? 0) + 1;
    player.playIntent = true;
    if (player.state.value.ended || audio.ended) audio.currentTime = 0;
    player.stream?.request(audio.currentTime);
    this.emit(player, { status: 'starting', ended: false, currentTime: audio.currentTime, error: undefined });
    try {
      // Called synchronously from the visible Play/Resume action on retry. The prepared
      // source is retained, so a rejected autoplay attempt does not require rendering again.
      await audio.play();
      if (generation !== player.generation || player.audio !== audio) { audio.pause(); return; }
      if (attempt !== player.playAttempt || !player.playIntent) { if (!player.playIntent) audio.pause(); return; }
      if (audio.ended) return;
      this.emit(player, { status: audio.paused ? 'paused' : 'playing' });
      if (!audio.paused) this.startProgress(player, audio);
    } catch (error) {
      if (generation !== player.generation || player.audio !== audio) { audio.pause(); return; }
      if (attempt !== player.playAttempt || !player.playIntent) return;
      player.playIntent = false; audio.pause(); this.stopProgress(player);
      const blocked = error instanceof DOMException && error.name === 'NotAllowedError';
      this.emit(player, { status: 'ready', error: blocked ? undefined : 'Playback could not start. Select Play to retry.' });
    }
  }

  pause(channel: string): void {
    const player = this.player(channel);
    // Invalidate an outstanding play promise without reusing its media element in a newer run.
    if (player.state.value.status === 'starting' && !player.stream) { this.stop(channel); return; }
    player.playIntent = false; player.playAttempt = (player.playAttempt ?? 0) + 1;
    player.audio?.pause(); this.stopProgress(player);
    if (player.audio) this.emit(player, { status: 'paused' });
  }
  seek(channel: string, time: number): void {
    const player = this.player(channel);
    if (!player.audio || !Number.isFinite(time)) return;
    player.audio.currentTime = Math.max(0, Math.min(time, player.state.value.duration));
    player.stream?.request(player.audio.currentTime);
    this.emit(player, { currentTime: player.audio.currentTime,
      ...(player.state.value.ended ? { ended: false, status: 'paused' as const } : {}) });
    this.updateMediaPosition(player);
  }
  stop(channel: string): void {
    const player = this.players.get(channel);
    if (!player) return;
    this.clear(player); player.prepare = undefined;
    this.emit(player, { status: 'idle', currentTime: 0, ended: false, error: undefined });
  }
  release(channel: string): void {
    const player = this.players.get(channel);
    if (!player) return;
    this.stop(channel); player.state.complete(); this.players.delete(channel);
  }
  stopAll(): void { for (const channel of this.players.keys()) this.stop(channel); }
  getCurrentTime(channel: string): number { return this.players.get(channel)?.audio?.currentTime ?? 0; }
  ngOnDestroy(): void { for (const channel of [...this.players.keys()]) this.release(channel); }

  private player(channel: string): Player {
    let player = this.players.get(channel);
    if (!player) {
      player = { generation: 0, options: {}, state: new BehaviorSubject<HtmlAudioProgress>({
        channel, label: 'Audio playback', status: 'idle', currentTime: 0, duration: 0, ended: false
      }) };
      this.players.set(channel, player);
    }
    return player;
  }
  private emit(player: Player, patch: Partial<HtmlAudioProgress>): void {
    const previous = player.state.value;
    player.state.next({ ...previous, ...patch });
    if (player.audio && player.state.value.status === 'playing' && patch.status === 'playing') this.claimMediaSession(player);
    if (this.mediaOwner === player && patch.status !== undefined) this.updateMediaSession(player);
    if (patch.status !== undefined || patch.error !== undefined) {
      this.notices.set([...this.players.values()].map(p => p.state.value).filter(s => s.status !== 'idle'));
    }
  }
  private startProgress(player: Player, audio: HTMLAudioElement): void {
    this.stopProgress(player);
    const generation = player.generation, frameGeneration = player.frameGeneration;
    const frame = () => {
      if (player.audio !== audio || player.generation !== generation || player.frameGeneration !== frameGeneration || player.state.value.status !== 'playing') return;
      this.emit(player, { currentTime: audio.currentTime || 0 });
      player.frame = requestAnimationFrame(frame);
    };
    player.frame = requestAnimationFrame(frame);
  }
  private stopProgress(player: Player): void {
    if (player.frame !== undefined) cancelAnimationFrame(player.frame);
    player.frame = undefined;
    player.frameGeneration = (player.frameGeneration ?? 0) + 1;
  }
  private get mediaSession(): MediaSession | undefined {
    return typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  }
  private playingPlayer(except: Player): Player | undefined {
    return [...this.players.values()].filter(p => p !== except && p.audio && p.state.value.status === 'playing')
      .sort((a, b) => (b.playOrder ?? 0) - (a.playOrder ?? 0))[0];
  }
  private claimMediaSession(player: Player): void {
    if (this.mediaOwner === player) return;
    const previous = this.mediaOwner;
    if (previous?.state.value.ended) { this.mediaOwner = undefined; this.clear(previous); previous.prepare = undefined; }
    this.mediaOwner = player; player.playOrder = ++this.playOrder;
    const session = this.mediaSession, audio = player.audio;
    if (!session || !audio) return;
    if (typeof MediaMetadata !== 'undefined') {
      session.metadata = new MediaMetadata({
        title: player.state.value.label,
        artist: 'Guitar Companion',
        artwork: [{ src: new URL('app-icons/guitar_icon.png', document.baseURI).href, sizes: '1024x1024', type: 'image/png' }]
      });
    }
    const channel = player.state.value.channel;
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => { void this.resume(channel); },
      pause: () => this.pause(channel),
      stop: () => this.stop(channel),
      seekto: details => { if (details.seekTime !== undefined) this.seek(channel, details.seekTime); },
      seekbackward: details => this.seek(channel, audio.currentTime - (details.seekOffset ?? 10)),
      seekforward: details => this.seek(channel, audio.currentTime + (details.seekOffset ?? 10)),
      previoustrack: player.options.previousSection ? () => player.options.previousSection?.() : undefined,
      nexttrack: player.options.nextSection ? () => player.options.nextSection?.() : undefined
    };
    for (const action of this.mediaActions) {
      // WebKit versions differ in the actions they support. One unsupported
      // action must not prevent playback or registration of the others.
      try {
        session.setActionHandler(action, handlers[action] ? details => {
          if (this.mediaOwner === player && player.audio === audio) handlers[action]?.(details);
        } : null);
      } catch { /* Unsupported system control. */ }
    }
    this.updateMediaSession(player);
  }
  private updateMediaSession(player: Player): void {
    const session = this.mediaSession;
    if (!session || this.mediaOwner !== player) return;
    session.playbackState = player.state.value.status === 'playing' || (player.state.value.status === 'buffering' && player.playIntent) ? 'playing' : 'paused';
    this.updateMediaPosition(player);
  }
  private updateMediaPosition(player: Player): void {
    const session = this.mediaSession, state = player.state.value;
    if (!session || this.mediaOwner !== player || !Number.isFinite(state.duration) || state.duration <= 0) return;
    try {
      session.setPositionState?.({ duration: state.duration, playbackRate: 1,
        position: state.ended ? 0 : Math.max(0, Math.min(player.audio?.currentTime ?? 0, state.duration)) });
    } catch { /* Position reporting is optional on older browsers. */ }
  }
  private releaseMediaSession(player: Player): void {
    if (this.mediaOwner !== player) return;
    this.mediaOwner = undefined;
    const session = this.mediaSession;
    if (session) {
      session.metadata = null;
      session.playbackState = 'none';
      try { session.setPositionState?.(); } catch { /* Optional browser API. */ }
      for (const action of this.mediaActions) {
        try { session.setActionHandler(action, null); } catch { /* Unsupported system control. */ }
      }
    }
    const other = this.playingPlayer(player);
    if (other) this.claimMediaSession(other);
  }
  private clear(player: Player): void {
    player.generation++; player.playIntent = false; player.playAttempt = (player.playAttempt ?? 0) + 1;
    player.abort?.abort(); player.stream?.dispose(); player.stream = undefined; this.stopProgress(player);
    const audio = player.audio; player.audio = undefined;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (player.url) URL.revokeObjectURL(player.url);
    player.url = undefined;
    this.releaseMediaSession(player);
  }
}
