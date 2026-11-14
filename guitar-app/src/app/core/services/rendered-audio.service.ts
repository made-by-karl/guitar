import { Injectable, OnDestroy } from '@angular/core';
import * as Tone from 'tone';
import { getNoteMidi, noteNameToNote } from '@/app/core/music/semitones';
import { PitchSlideVoice } from '@/app/core/services/audio.service';
import { MidiInstruction } from '@/app/core/services/midi.model';
import { MIDI_PLAYBACK_CONFIG, MIDI_SAMPLE_SET_VERSION, MidiSamplerSet, scheduleMidiInstruction } from '@/app/core/services/midi-renderer';
import { WavEncoderService } from '@/app/core/services/wav-encoder.service';
import { closestGuitarAnchor, GUITAR_ARTICULATIONS, GuitarArticulation, renderGuitarArticulation } from '@/app/core/services/guitar-articulation';

export interface RenderedAudio { blob: Blob; durationSeconds: number; }
export const RENDER_CACHE_BYTES = 32 * 1024 * 1024;
export const MAX_PENDING_RENDERS = 8;
export const RENDER_SAMPLE_RATE = 44100;
export const GUITAR_ANCHORS = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4', 'E5'] as const;
export const guitarUrls = (): Record<string, string> => Object.fromEntries(
  GUITAR_ANCHORS.map(pitch => [pitch, `/samples/notes/guitar_${pitch}.mp3`])
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
    const end = Math.max(duration, ...instructions.map(i => {
      const profile = i.technique === 'palm-muted' || i.technique === 'dead-note' ? GUITAR_ARTICULATIONS[i.technique] : undefined;
      const hold = profile ? Math.min(i.playbackDuration, profile.decay + 0.02) : i.playbackDuration;
      const spread = i.playNotes && i.playNotes !== 'parallel'
        ? i.technique === 'dead-note' ? Math.max(0, (i.notes?.length ?? 1) - 1) * 0.012 : 0.22 : 0;
      return Math.min(i.chokeAt ?? Infinity, i.time + hold + spread + (profile ? 0 : i.percussion ? 0.5 : i.technique === 'slide' ? 0.04 : 3));
    }));
    return this.render(identity, end, async (context, resources, check) => {
      const instruments: MidiSamplerSet = {};
      if (instructions.some(i => !i.percussion && i.technique !== 'palm-muted' && i.technique !== 'dead-note' && i.chokeAt === undefined)) {
        instruments.guitar = await this.sampler(context, resources, guitarUrls(), MIDI_PLAYBACK_CONFIG.samplers.guitar.releaseSeconds, MIDI_PLAYBACK_CONFIG.samplers.guitar.attackSeconds);
        check();
      }
      if (instructions.some(i => i.percussion)) {
        instruments.percussion = await this.sampler(context, resources, {
          C3: '/samples/percussion/guitar_body_knock.mp3', 'C#3': '/samples/percussion/guitar_string_slap.mp3'
        }, MIDI_PLAYBACK_CONFIG.samplers.percussion.releaseSeconds, MIDI_PLAYBACK_CONFIG.samplers.percussion.attackSeconds, MIDI_PLAYBACK_CONFIG.samplers.percussion.volumeDb);
        check();
      }
      const buffers = new Map<number, Tone.ToneAudioBuffer>();
      const articulated = new Map<string, AudioBuffer>();
      if (instructions.some(i => i.technique === 'palm-muted' || i.technique === 'dead-note' || i.chokeAt !== undefined
        || (i.technique === 'slide' && (i.legato?.source || i.legatos?.some(l => l.source))))) {
        for (const pitch of GUITAR_ANCHORS) {
          const buffer = await this.loadGuitarBuffer(guitarUrls()[pitch]);
          resources.push(buffer);
          check();
          buffers.set(getNoteMidi(noteNameToNote(pitch)), buffer);
        }
      }
      for (const instruction of instructions) {
        const technique = instruction.technique;
        if (technique === 'palm-muted' || technique === 'dead-note') {
          for (const note of instruction.notes ?? []) {
            const name = `${note.note.semitone}${note.note.octave}`;
            const key = `${technique}:${name}`;
            if (!articulated.has(key)) {
              const anchor = closestGuitarAnchor(buffers.keys(), getNoteMidi(note.note));
              const original = buffers.get(anchor)!.get();
              if (!original) throw new Error('Guitar samples are not ready. Retry playback.');
              articulated.set(key, await renderGuitarArticulation(original, anchor, name, technique));
              check();
            }
          }
        }
        const instrument = (articulation?: GuitarArticulation) => ({
          triggerAttackRelease: (name: string, duration: number | string, time = 0, velocity = 1) => {
            if (typeof duration !== 'number') throw new Error('Expected a guitar note duration in seconds.');
            const boundary = Math.min(instruction.chokeAt ?? Infinity, articulation ? instruction.time + instruction.playbackDuration : Infinity);
            if (time >= boundary) return;
            const anchor = closestGuitarAnchor(buffers.keys(), getNoteMidi(noteNameToNote(name)));
            const buffer = articulation ? articulated.get(`${articulation}:${name}`)! : buffers.get(anchor)!;
            const rate = articulation ? 1 : 2 ** ((getNoteMidi(noteNameToNote(name)) - anchor) / 12);
            const life = articulation ? Math.min(buffer.duration, duration, boundary - time) : Math.min(duration + 3, boundary - time);
            if (life <= 0) return;
            const fadeOut = articulation ? Math.min(0.008, life / 4) : 3;
            const source = new Tone.ToneBufferSource({ context, url: buffer, playbackRate: rate,
              fadeIn: articulation ? 0 : 0.005, fadeOut, curve: articulation ? 'linear' : 'exponential' });
            resources.push(source);
            if (!articulation) {
              // Keep the ordinary release unchanged until the dead strum actually mutes it.
              const gate = new Tone.Gain({ context, gain: 1 }).toDestination();
              resources.push(gate);
              gate.gain.setValueAtTime(1, Math.max(time, boundary - 0.005));
              gate.gain.linearRampToValueAtTime(0, boundary);
              source.connect(gate);
            } else source.toDestination();
            source.start(time, 0, undefined, articulation ? velocity / 0.65 : velocity);
            source.stop(articulation ? time + life - fadeOut : time + duration);
          }
        });
        scheduleMidiInstruction({ ...instruments,
          guitar: instruction.chokeAt !== undefined ? instrument() : instruments.guitar,
          palmMuted: technique === 'palm-muted' ? instrument('palm-muted') : undefined,
          deadNote: technique === 'dead-note' ? instrument('dead-note') : undefined,
          slide: voice => this.slide(context, resources, buffers, voice, instruction.chokeAt)
        }, instruction, instruction.time);
      }
    }, signal, 0, instructions.some(i => i.technique === 'palm-muted' || i.technique === 'dead-note') ? 0.95 : 1);
  }

  render(
    identity: string, duration: number,
    schedule: (context: Tone.OfflineContext, resources: { dispose(): unknown }[], assertActive: () => void) => Promise<void>,
    signal?: AbortSignal, trimStart = 0, peakCeiling = 1
  ): Promise<RenderedAudio> {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 603) {
      return Promise.reject(new Error('Audio is too long to prepare. Play a section of up to ten minutes.'));
    }
    if (this.destroyed || signal?.aborted) return Promise.reject(new DOMException('Playback canceled', 'AbortError'));
    const key = JSON.stringify({ revision: MIDI_SAMPLE_SET_VERSION, identity, duration, trimStart, peakCeiling, sampleRate: RENDER_SAMPLE_RATE });
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
          // Preserve dynamics while keeping mixed articulated chords below digital clipping.
          let peak = 0;
          if (peakCeiling < 1) for (let channel = 0; channel < audio.numberOfChannels; channel++) {
            for (const sample of audio.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
          }
          if (peak > peakCeiling) {
            for (let channel = 0; channel < audio.numberOfChannels; channel++) {
              const samples = audio.getChannelData(channel);
              for (let index = 0; index < samples.length; index++) samples[index] *= peakCeiling / peak;
            }
          }
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

  private async loadGuitarBuffer(url: string): Promise<Tone.ToneAudioBuffer> {
    let expired = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => { expired = true; reject(new Error('Guitar samples could not be loaded. Check your connection and retry.')); }, 20000);
    });
    const loading = Tone.ToneAudioBuffer.fromUrl(url).then(buffer => {
      if (expired) { buffer.dispose(); throw new Error('Guitar sample loading expired.'); }
      return buffer;
    });
    try { return await Promise.race([loading, deadline]); }
    finally { clearTimeout(timeout); }
  }

  private slide(context: Tone.OfflineContext, resources: { dispose(): unknown }[], buffers: Map<number, Tone.ToneAudioBuffer>, voice: PitchSlideVoice, chokeAt = Infinity): void {
    if (voice.startTime >= chokeAt) return;
    const high = Math.max(getNoteMidi(voice.source), getNoteMidi(voice.target));
    const anchor = [...buffers.keys()].reduce((best, pitch) => Math.abs(pitch - high) < Math.abs(best - high) ? pitch : best);
    const buffer = buffers.get(anchor)!;
    const rate = 2 ** ((getNoteMidi(voice.source) - anchor) / 12);
    const targetRate = 2 ** ((getNoteMidi(voice.target) - anchor) / 12);
    const fadeOut = voice.startTime + voice.duration > chokeAt ? 0.005 : 0.04;
    const source = new Tone.ToneBufferSource({ context, url: buffer, playbackRate: rate, fadeIn: 0.01, fadeOut }).toDestination();
    resources.push(source);
    source.playbackRate.setValueAtTime(rate, voice.startTime);
    source.playbackRate.exponentialRampToValueAtTime(targetRate, voice.startTime + voice.glideDuration);
    source.start(voice.startTime, Math.min(0.03, buffer.duration / 10), undefined, Math.min(1, voice.velocity));
    source.stop(Math.min(voice.startTime + voice.duration, chokeAt - fadeOut));
  }

  ngOnDestroy(): void { this.destroyed = true; this.cache.clear(); this.bytes = 0; }
}
