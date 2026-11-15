import { Injectable, OnDestroy, signal } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { RenderedAudio } from '@/app/core/services/rendered-audio.service';

export type MediaPlaybackStatus = 'idle' | 'preparing' | 'ready' | 'starting' | 'playing' | 'paused' | 'error';
export interface HtmlAudioProgress {
  channel: string; label: string; status: MediaPlaybackStatus; currentTime: number;
  duration: number; ended: boolean; error?: string;
}
interface PlayOptions { label?: string; loop?: boolean; startTime?: number; autoStart?: boolean; }
interface Player {
  state: BehaviorSubject<HtmlAudioProgress>;
  generation: number;
  abort?: AbortController;
  audio?: HTMLAudioElement;
  url?: string;
  timer?: ReturnType<typeof setInterval>;
  prepare?: (signal: AbortSignal) => Promise<RenderedAudio>;
  options: PlayOptions;
}

@Injectable({ providedIn: 'root' })
export class HtmlAudioPlaybackService implements OnDestroy {
  readonly notices = signal<HtmlAudioProgress[]>([]);
  private readonly players = new Map<string, Player>();
  private mediaOwner?: Player;
  private readonly mediaActions: MediaSessionAction[] = ['play', 'pause', 'stop', 'seekto', 'seekbackward', 'seekforward'];

  progress$(channel: string): Observable<HtmlAudioProgress> { return this.player(channel).state.asObservable(); }
  getSnapshot(channel: string): HtmlAudioProgress { return this.player(channel).state.value; }

  async play(channel: string, prepare: (signal: AbortSignal) => Promise<RenderedAudio>, options: PlayOptions = {}): Promise<void> {
    const player = this.player(channel);
    this.clear(player);
    player.options = options; player.prepare = prepare;
    player.abort = new AbortController();
    const generation = player.generation;
    this.emit(player, { status: 'preparing', label: options.label ?? 'Audio playback', currentTime: 0, duration: 0, ended: false, error: undefined });
    try {
      const rendered = await prepare(player.abort.signal);
      if (player.generation !== generation) return;
      const audio = new Audio();
      audio.preload = 'auto'; audio.loop = !!options.loop;
      const url = URL.createObjectURL(rendered.blob);
      player.url = url; player.audio = audio;
      audio.src = url;
      const current = () => player.audio === audio && player.generation === generation;
      const report = () => {
        if (current()) { this.emit(player, { currentTime: audio.currentTime || 0 }); this.updateMediaPosition(player); }
      };
      audio.addEventListener('timeupdate', report);
      audio.addEventListener('playing', () => {
        if (current()) { this.emit(player, { status: 'playing', error: undefined }); this.startProgress(player, audio); }
      });
      audio.addEventListener('pause', () => {
        if (current() && !audio.ended && player.state.value.status === 'playing') {
          this.stopProgress(player); this.emit(player, { status: 'paused' });
        }
      });
      audio.addEventListener('ended', () => {
        if (!current()) return;
        this.stopProgress(player);
        // Keep only the system player's last clip replayable. Other channels still
        // release immediately; Stop/navigation/replacement also release this clip.
        const other = this.playingPlayer(player);
        if (this.mediaOwner !== player || other) this.clear(player);
        player.prepare = undefined;
        this.emit(player, { status: 'idle', currentTime: 0, ended: true });
      });
      audio.addEventListener('error', () => {
        if (!current()) return;
        this.clear(player);
        this.emit(player, { status: 'error', error: 'Audio could not be played. Retry playback.' });
      });
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
      this.clear(player);
      this.emit(player, { status: 'error', error: error instanceof Error ? error.message : 'Audio preparation failed. Retry playback.' });
    }
  }

  async resume(channel: string): Promise<void> {
    const player = this.player(channel), audio = player.audio;
    if (player.state.value.status === 'starting' || player.state.value.status === 'playing') return;
    if (!audio) {
      if (player.prepare) await this.play(channel, player.prepare, player.options);
      return;
    }
    const generation = player.generation;
    if (player.state.value.ended || audio.ended) audio.currentTime = 0;
    this.emit(player, { status: 'starting', ended: false, currentTime: audio.currentTime, error: undefined });
    try {
      // Called synchronously from the visible Play/Resume action on retry. The prepared
      // source is retained, so a rejected autoplay attempt does not require rendering again.
      await audio.play();
      if (generation !== player.generation || player.audio !== audio) { audio.pause(); return; }
      if (audio.ended) return;
      this.emit(player, { status: audio.paused ? 'paused' : 'playing' });
      if (!audio.paused) this.startProgress(player, audio);
    } catch (error) {
      if (generation !== player.generation || player.audio !== audio) { audio.pause(); return; }
      audio.pause(); this.stopProgress(player);
      const blocked = error instanceof DOMException && error.name === 'NotAllowedError';
      this.emit(player, { status: 'ready', error: blocked ? undefined : 'Playback could not start. Select Play to retry.' });
    }
  }

  pause(channel: string): void {
    const player = this.player(channel);
    // Invalidate an outstanding play promise without reusing its media element in a newer run.
    if (player.state.value.status === 'starting') { this.stop(channel); return; }
    player.audio?.pause(); this.stopProgress(player);
    if (player.audio) this.emit(player, { status: 'paused' });
  }
  seek(channel: string, time: number): void {
    const player = this.player(channel);
    if (!player.audio) return;
    player.audio.currentTime = Math.max(0, Math.min(time, player.state.value.duration));
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
    player.timer = setInterval(() => {
      if (player.audio === audio) this.emit(player, { currentTime: audio.currentTime || 0 });
    }, 25);
  }
  private stopProgress(player: Player): void { if (player.timer) clearInterval(player.timer); player.timer = undefined; }
  private get mediaSession(): MediaSession | undefined {
    return typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  }
  private playingPlayer(except: Player): Player | undefined {
    return [...this.players.values()].reverse().find(p => p !== except && p.audio && p.state.value.status === 'playing');
  }
  private claimMediaSession(player: Player): void {
    if (this.mediaOwner === player) return;
    const previous = this.mediaOwner;
    if (previous?.state.value.ended) { this.mediaOwner = undefined; this.clear(previous); }
    this.mediaOwner = player;
    const session = this.mediaSession, audio = player.audio;
    if (!session || !audio) return;
    if (typeof MediaMetadata !== 'undefined') {
      session.metadata = new MediaMetadata({
        title: player.state.value.label,
        artist: 'Guitar Companion',
        artwork: [{ src: new URL('icons/guitar_icon.png', document.baseURI).href, sizes: '1024x1024', type: 'image/png' }]
      });
    }
    const channel = player.state.value.channel;
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => { void this.resume(channel); },
      pause: () => this.pause(channel),
      stop: () => this.stop(channel),
      seekto: details => { if (details.seekTime !== undefined) this.seek(channel, details.seekTime); },
      seekbackward: details => this.seek(channel, audio.currentTime - (details.seekOffset ?? 10)),
      seekforward: details => this.seek(channel, audio.currentTime + (details.seekOffset ?? 10))
    };
    for (const action of this.mediaActions) {
      // WebKit versions differ in the actions they support. One unsupported
      // action must not prevent playback or registration of the others.
      try {
        session.setActionHandler(action, details => {
          if (this.mediaOwner === player && player.audio === audio) handlers[action]?.(details);
        });
      } catch { /* Unsupported system control. */ }
    }
    this.updateMediaSession(player);
  }
  private updateMediaSession(player: Player): void {
    const session = this.mediaSession;
    if (!session || this.mediaOwner !== player) return;
    session.playbackState = player.state.value.status === 'playing' ? 'playing' : 'paused';
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
    player.generation++; player.abort?.abort(); this.stopProgress(player);
    const audio = player.audio; player.audio = undefined;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (player.url) URL.revokeObjectURL(player.url);
    player.url = undefined;
    this.releaseMediaSession(player);
  }
}
