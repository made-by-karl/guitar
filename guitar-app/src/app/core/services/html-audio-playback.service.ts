import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface HtmlAudioProgress {
  channel: string;
  currentTime: number;
  duration: number;
  ended: boolean;
}

interface AudioPlayer {
  audio: HTMLAudioElement;
  progressSubject: BehaviorSubject<HtmlAudioProgress>;
  frameId: number | null;
  intervalId: ReturnType<typeof setInterval> | null;
  fadeFrameId: number | null;
  fadeIntervalId: ReturnType<typeof setInterval> | null;
  ownedUrl: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class HtmlAudioPlaybackService implements OnDestroy {
  private readonly players = new Map<string, AudioPlayer>();

  progress$(channel: string = 'default'): Observable<HtmlAudioProgress> {
    return this.getPlayer(channel).progressSubject.asObservable();
  }

  async play(channel: string, url: string, options: { loop?: boolean; startTime?: number; ownedUrl?: boolean } = {}): Promise<void> {
    const player = this.getPlayer(channel);
    this.stopProgress(player);
    this.stopFade(player);
    this.revokeOwnedUrl(player);

    player.audio.loop = options.loop ?? false;
    player.audio.volume = 1;
    player.audio.src = url;
    player.ownedUrl = options.ownedUrl ? url : null;
    player.audio.currentTime = Math.max(0, options.startTime ?? 0);
    await player.audio.play();
    this.startProgress(channel, player);
  }

  pause(channel: string): void {
    this.getPlayer(channel).audio.pause();
  }

  async resume(channel: string): Promise<void> {
    const player = this.getPlayer(channel);
    await player.audio.play();
    this.startProgress(channel, player);
  }

  stop(channel: string): void {
    const player = this.getPlayer(channel);
    this.stopFade(player);
    player.audio.pause();
    player.audio.removeAttribute('src');
    player.audio.load();
    this.stopProgress(player);
    this.revokeOwnedUrl(player);
    this.emitProgress(channel, player, true);
  }

  async fadeOutAndStop(channel: string, durationMs: number = 120): Promise<void> {
    const player = this.getPlayer(channel);
    this.stopFade(player);

    if (player.audio.paused || durationMs <= 0) {
      this.stop(channel);
      return;
    }

    const startVolume = player.audio.volume;
    const startTime = Date.now();

    await new Promise<void>((resolve) => {
      const tick = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        player.audio.volume = startVolume * (1 - progress);

        if (progress >= 1) {
          this.stopFade(player);
          this.stop(channel);
          player.audio.volume = 1;
          resolve();
          return;
        }

        if (typeof requestAnimationFrame === 'function') {
          player.fadeFrameId = requestAnimationFrame(tick);
        }
      };

      if (typeof requestAnimationFrame === 'function') {
        player.fadeFrameId = requestAnimationFrame(tick);
      } else {
        player.fadeIntervalId = setInterval(tick, 16);
      }
    });
  }

  seek(channel: string, timeSeconds: number): void {
    const player = this.getPlayer(channel);
    player.audio.currentTime = Math.max(0, timeSeconds);
    this.emitProgress(channel, player, false);
  }

  getCurrentTime(channel: string): number {
    return this.getPlayer(channel).audio.currentTime;
  }

  getDuration(channel: string): number {
    return this.getPlayer(channel).audio.duration;
  }

  ngOnDestroy(): void {
    for (const [channel, player] of this.players) {
      this.stop(channel);
      player.progressSubject.complete();
    }
    this.players.clear();
  }

  private getPlayer(channel: string): AudioPlayer {
    const existing = this.players.get(channel);
    if (existing) {
      return existing;
    }

    const audio = new Audio();
    audio.preload = 'auto';
    const player: AudioPlayer = {
      audio,
      progressSubject: new BehaviorSubject<HtmlAudioProgress>({
        channel,
        currentTime: 0,
        duration: 0,
        ended: false
      }),
      frameId: null,
      intervalId: null,
      fadeFrameId: null,
      fadeIntervalId: null,
      ownedUrl: null
    };

    audio.addEventListener('ended', () => {
      this.stopProgress(player);
      this.emitProgress(channel, player, true);
    });
    this.players.set(channel, player);
    return player;
  }

  private startProgress(channel: string, player: AudioPlayer): void {
    this.stopProgress(player);

    const tick = () => {
      this.emitProgress(channel, player, false);
      if (!player.audio.paused && !player.audio.ended) {
        if (typeof requestAnimationFrame === 'function') {
          player.frameId = requestAnimationFrame(tick);
        }
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      player.frameId = requestAnimationFrame(tick);
    } else {
      player.intervalId = setInterval(tick, 100);
    }
  }

  private stopProgress(player: AudioPlayer): void {
    if (player.frameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(player.frameId);
    }
    if (player.intervalId !== null) {
      clearInterval(player.intervalId);
    }
    player.frameId = null;
    player.intervalId = null;
  }

  private stopFade(player: AudioPlayer): void {
    if (player.fadeFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(player.fadeFrameId);
    }
    if (player.fadeIntervalId !== null) {
      clearInterval(player.fadeIntervalId);
    }
    player.fadeFrameId = null;
    player.fadeIntervalId = null;
  }

  private emitProgress(channel: string, player: AudioPlayer, ended: boolean): void {
    player.progressSubject.next({
      channel,
      currentTime: player.audio.currentTime || 0,
      duration: Number.isFinite(player.audio.duration) ? player.audio.duration : 0,
      ended
    });
  }

  private revokeOwnedUrl(player: AudioPlayer): void {
    if (player.ownedUrl) {
      URL.revokeObjectURL(player.ownedUrl);
      player.ownedUrl = null;
    }
  }
}
