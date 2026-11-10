import { Injectable, OnDestroy } from '@angular/core';
import * as Tone from 'tone';
import { getNoteMidi, noteNameToNote } from '@/app/core/music/semitones';
import { PitchSlideVoice } from '@/app/core/services/audio.service';
import { MidiInstruction } from '@/app/core/services/midi.model';
import { MIDI_PLAYBACK_CONFIG, MIDI_SAMPLE_SET_VERSION, MidiSamplerSet, scheduleMidiInstruction } from '@/app/core/services/midi-renderer';
import { WavEncoderService } from '@/app/core/services/wav-encoder.service';

export interface RenderedAudio { blob: Blob; durationSeconds: number; }
export const RENDER_CACHE_BYTES = 32 * 1024 * 1024;
export const MAX_PENDING_RENDERS = 8;
export const RENDER_SAMPLE_RATE = 44100;
export const GUITAR_ANCHORS = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4', 'E5'] as const;
export const guitarUrls = (palmMuted = false): Record<string, string> => Object.fromEntries(
  GUITAR_ANCHORS.map(pitch => [pitch, palmMuted ? `/samples/palm-muted/guitar_${pitch}.wav` : `/samples/notes/guitar_${pitch}.mp3`])
);

interface PendingRender { promise: Promise<RenderedAudio>; signals: Set<AbortSignal | undefined>; }

@Injectable({ providedIn: 'root' })
export class RenderedAudioService implements OnDestroy {
  private readonly cache = new Map<string, RenderedAudio>();
  private readonly pending = new Map<string, PendingRender>();
  private queue: Promise<unknown> = Promise.resolve();
  private bytes = 0;
  private destroyed = false;

  constructor(private readonly encoder: WavEncoderService) {}

  renderInstructions(instructions: MidiInstruction[], duration: number, signal?: AbortSignal): Promise<RenderedAudio> {
    // A queued render must use the same plain-data snapshot as its cache identity,
    // even if its caller edits or reuses the original plan while samples load.
    const identity = JSON.stringify(instructions);
    instructions = JSON.parse(identity) as MidiInstruction[];
    // Include the final strum spread and release, even if a plan ends at its last action.
    const end = Math.max(duration, ...instructions.map(i => i.time + i.playbackDuration
      + (i.playNotes && i.playNotes !== 'parallel' ? 0.22 : 0)
      + (i.percussion ? 0.5 : i.technique === 'palm-muted' ? 0.12 : i.technique === 'slide' ? 0.04 : 3)));
    return this.render(identity, end, async (context, resources, check) => {
      const instruments: MidiSamplerSet = {};
      if (instructions.some(i => !i.percussion && i.technique !== 'palm-muted')) {
        instruments.guitar = await this.sampler(context, resources, guitarUrls(), MIDI_PLAYBACK_CONFIG.samplers.guitar.releaseSeconds, MIDI_PLAYBACK_CONFIG.samplers.guitar.attackSeconds);
        check();
      }
      if (instructions.some(i => !i.percussion && i.technique === 'palm-muted')) {
        instruments.palmMuted = await this.sampler(context, resources, guitarUrls(true), MIDI_PLAYBACK_CONFIG.techniques.palmMuted.releaseSeconds);
        check();
      }
      if (instructions.some(i => i.percussion)) {
        instruments.percussion = await this.sampler(context, resources, {
          C3: '/samples/percussion/guitar_body_knock.mp3', 'C#3': '/samples/percussion/guitar_string_slap.mp3'
        }, MIDI_PLAYBACK_CONFIG.samplers.percussion.releaseSeconds, MIDI_PLAYBACK_CONFIG.samplers.percussion.attackSeconds, MIDI_PLAYBACK_CONFIG.samplers.percussion.volumeDb);
        check();
      }
      if (instructions.some(i => i.technique === 'slide' && (i.legato?.source || i.legatos?.some(l => l.source)))) {
        const buffers = new Map<number, Tone.ToneAudioBuffer>();
        for (const pitch of GUITAR_ANCHORS) {
          const buffer = await this.loadSlideBuffer(guitarUrls()[pitch]);
          resources.push(buffer);
          check();
          buffers.set(getNoteMidi(noteNameToNote(pitch)), buffer);
        }
        instruments.slide = voice => this.slide(context, resources, buffers, voice);
      }
      for (const instruction of instructions) scheduleMidiInstruction(instruments, instruction, instruction.time);
    }, signal);
  }

  render(
    identity: string, duration: number,
    schedule: (context: Tone.OfflineContext, resources: { dispose(): unknown }[], assertActive: () => void) => Promise<void>,
    signal?: AbortSignal, trimStart = 0
  ): Promise<RenderedAudio> {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 603) {
      return Promise.reject(new Error('Audio is too long to prepare. Play a section of up to ten minutes.'));
    }
    if (this.destroyed || signal?.aborted) return Promise.reject(new DOMException('Playback canceled', 'AbortError'));
    const key = JSON.stringify({ revision: MIDI_SAMPLE_SET_VERSION, identity, duration, trimStart, sampleRate: RENDER_SAMPLE_RATE });
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key); this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    let pending = this.pending.get(key);
    if (!pending) {
      if (this.pending.size >= MAX_PENDING_RENDERS) {
        return Promise.reject(new Error('Audio preparation is busy. Wait for the current preparation to finish and retry.'));
      }
      const signals = new Set<AbortSignal | undefined>();
      const check = () => {
        if (this.destroyed || ![...signals].some(s => !s?.aborted)) throw new DOMException('Playback canceled', 'AbortError');
      };
      const promise = this.queue.then(async () => {
        check();
        const context = new Tone.OfflineContext(1, duration, RENDER_SAMPLE_RATE);
        const resources: { dispose(): unknown }[] = [];
        try {
          await schedule(context, resources, check);
          check();
          const buffer = await context.render();
          resources.push(buffer);
          check();
          let audio = buffer.get();
          if (!audio) throw new Error('Audio preparation returned no sound buffer.');
          if (trimStart > 0) {
            const offset = Math.round(trimStart * RENDER_SAMPLE_RATE);
            const cropped = context.createBuffer(audio.numberOfChannels, audio.length - offset, audio.sampleRate);
            for (let channel = 0; channel < audio.numberOfChannels; channel++) cropped.copyToChannel(audio.getChannelData(channel).subarray(offset), channel);
            audio = cropped;
          }
          const result = { blob: this.encoder.encode(audio), durationSeconds: duration - trimStart };
          if (result.blob.size <= RENDER_CACHE_BYTES) {
            while (this.bytes + result.blob.size > RENDER_CACHE_BYTES) {
              const oldest = this.cache.entries().next().value;
              if (!oldest) break;
              this.cache.delete(oldest[0]); this.bytes -= oldest[1].blob.size;
            }
            this.cache.set(key, result); this.bytes += result.blob.size;
          }
          return result;
        } finally {
          for (const resource of resources.reverse()) resource.dispose();
          await context.close(); context.dispose();
        }
      }).finally(() => this.pending.delete(key));
      this.queue = promise.then(() => undefined, () => undefined);
      pending = { signals, promise }; this.pending.set(key, pending);
    }
    pending.signals.add(signal);
    return pending.promise.then(value => {
      if (signal?.aborted) throw new DOMException('Playback canceled', 'AbortError');
      return value;
    });
  }

  async sampler(context: Tone.OfflineContext, resources: { dispose(): unknown }[], urls: Record<string, string>, release: number, attack = 0.001, volume = 0): Promise<Tone.Sampler> {
    let ready!: () => void, fail!: (error: unknown) => void;
    const loaded = new Promise<void>((resolve, reject) => { ready = resolve; fail = reject; });
    const sampler = new Tone.Sampler({ context, urls, release, attack, volume, onload: ready, onerror: fail }).toDestination();
    resources.push(sampler);
    const timeout = setTimeout(() => fail(new Error('Samples could not be loaded. Check your connection and retry.')), 20000);
    try { await loaded; return sampler; }
    finally { clearTimeout(timeout); }
  }

  private async loadSlideBuffer(url: string): Promise<Tone.ToneAudioBuffer> {
    let expired = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => { expired = true; reject(new Error('Slide samples could not be loaded. Check your connection and retry.')); }, 20000);
    });
    const loading = Tone.ToneAudioBuffer.fromUrl(url).then(buffer => {
      if (expired) { buffer.dispose(); throw new Error('Slide sample loading expired.'); }
      return buffer;
    });
    try { return await Promise.race([loading, deadline]); }
    finally { clearTimeout(timeout); }
  }

  private slide(context: Tone.OfflineContext, resources: { dispose(): unknown }[], buffers: Map<number, Tone.ToneAudioBuffer>, voice: PitchSlideVoice): void {
    const high = Math.max(getNoteMidi(voice.source), getNoteMidi(voice.target));
    const anchor = [...buffers.keys()].reduce((best, pitch) => Math.abs(pitch - high) < Math.abs(best - high) ? pitch : best);
    const buffer = buffers.get(anchor)!;
    const rate = 2 ** ((getNoteMidi(voice.source) - anchor) / 12);
    const targetRate = 2 ** ((getNoteMidi(voice.target) - anchor) / 12);
    const source = new Tone.ToneBufferSource({ context, url: buffer, playbackRate: rate, fadeIn: 0.01, fadeOut: 0.04 }).toDestination();
    resources.push(source);
    source.playbackRate.setValueAtTime(rate, voice.startTime);
    source.playbackRate.exponentialRampToValueAtTime(targetRate, voice.startTime + voice.glideDuration);
    source.start(voice.startTime, Math.min(0.03, buffer.duration / 10), undefined, Math.min(1, voice.velocity));
    source.stop(voice.startTime + voice.duration);
  }

  ngOnDestroy(): void { this.destroyed = true; this.cache.clear(); this.bytes = 0; }
}
