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
      const report = () => { if (current()) this.emit(player, { currentTime: audio.currentTime || 0 }); };
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
        this.clear(player); player.prepare = undefined;
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
    this.emit(player, { status: 'starting', error: undefined });
    try {
      // Called synchronously from the visible Play/Resume action on retry. The prepared
      // source is retained, so a rejected autoplay attempt does not require rendering again.
      await audio.play();
      if (generation !== player.generation || player.audio !== audio) { audio.pause(); return; }
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
    this.emit(player, { currentTime: player.audio.currentTime });
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
  private clear(player: Player): void {
    player.generation++; player.abort?.abort(); this.stopProgress(player);
    const audio = player.audio; player.audio = undefined;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (player.url) URL.revokeObjectURL(player.url);
    player.url = undefined;
  }
}
