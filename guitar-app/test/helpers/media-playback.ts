import { BehaviorSubject } from 'rxjs';
import { HtmlAudioPlaybackService, HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';
import { MidiInstruction } from '@/app/core/services/midi.model';
import { RenderedAudioService } from '@/app/core/services/rendered-audio.service';
import { PlaybackService } from '@/app/core/services/playback.service';

/** Controllable media time; no Tone transport or wall-clock note scheduling. */
export function playbackHarness(capture: { captureInstruction?: (instruction: MidiInstruction) => void } = {}) {
  const states = new Map<string, BehaviorSubject<HtmlAudioProgress>>();
  const state = (channel: string) => {
    if (!states.has(channel)) states.set(channel, new BehaviorSubject<HtmlAudioProgress>({
      channel, label: '', status: 'idle', currentTime: 0, duration: 0, ended: false
    }));
    return states.get(channel)!;
  };
  const emit = (channel: string, patch: Partial<HtmlAudioProgress>) => state(channel).next({ ...state(channel).value, ...patch });
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const finish = (channel: string) => { clearTimeout(timers.get(channel)); emit(channel, { status: 'idle', ended: true }); };
  const rendered = {
    renderInstructions: jest.fn(async (instructions: MidiInstruction[], duration: number) => {
      instructions.forEach(instruction => capture.captureInstruction?.(instruction));
      return { blob: new Blob(), durationSeconds: Math.max(duration, ...instructions.map(i => i.time + i.playbackDuration)) + 3 };
    })
  };
  const media = {
    progress$: (channel: string) => state(channel).asObservable(),
    play: jest.fn(async (channel: string, prepare: (signal: AbortSignal) => Promise<{ durationSeconds: number }>, options = {} as { startTime?: number; loop?: boolean; autoStart?: boolean }) => {
      clearTimeout(timers.get(channel));
      emit(channel, { status: 'preparing', ended: false });
      const result = await prepare(new AbortController().signal);
      emit(channel, { status: options.autoStart === false ? 'ready' : 'playing', currentTime: options.startTime ?? 0, duration: result.durationSeconds });
      if (!options.loop && options.autoStart !== false) timers.set(channel, setTimeout(() => finish(channel), result.durationSeconds * 1000));
    }),
    pause: jest.fn((channel: string) => { clearTimeout(timers.get(channel)); emit(channel, { status: 'paused' }); }),
    resume: jest.fn(async (channel: string) => emit(channel, { status: 'playing' })),
    seek: jest.fn((channel: string, currentTime: number) => emit(channel, { currentTime })),
    stop: jest.fn((channel: string) => { clearTimeout(timers.get(channel)); emit(channel, { status: 'idle', ended: false }); }),
    release: jest.fn((channel: string) => { clearTimeout(timers.get(channel)); state(channel).complete(); }),
    getSnapshot: (channel: string) => state(channel).value,
    getCurrentTime: (channel: string) => state(channel).value.currentTime
  };
  return { service: new PlaybackService(rendered as unknown as RenderedAudioService, media as unknown as HtmlAudioPlaybackService), rendered, media, emit, finish };
}
export function createPlaybackService(capture: { captureInstruction?: (instruction: MidiInstruction) => void } = {}): PlaybackService {
  return playbackHarness(capture).service;
}
