import { Injectable, OnDestroy } from '@angular/core';
import * as Tone from 'tone';
import { getNoteMidi, noteNameToNote } from '@/app/core/music/semitones';
import { PitchSlideVoice } from '@/app/core/services/audio.service';
import { MidiInstruction } from '@/app/core/services/midi.model';
import { MIDI_PLAYBACK_CONFIG, MIDI_SAMPLE_SET_VERSION, MidiSamplerSet, scheduleMidiInstruction } from '@/app/core/services/midi-renderer';
import { WavEncoderService } from '@/app/core/services/wav-encoder.service';
import { closestGuitarAnchor, GUITAR_ARTICULATIONS, GuitarArticulation, renderGuitarArticulation } from '@/app/core/services/guitar-articulation';

export interface RenderedAudio { blob: Blob; durationSeconds: number; pcm?: AudioBuffer; }
export interface RenderedWindow { pcm: AudioBuffer; startFrame: number; endFrame: number; final: boolean; }
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
  private readonly jobs: { priority: number; sequence: number; run(): Promise<void> }[] = [];
  private running = false;
  private sequence = 0;
  private readonly assets = new Map<string, AudioBuffer>();
  private assetBytes = 0;
  private readonly peaks = new WeakMap<AudioBuffer, number>();
  private bytes = 0;
  private destroyed = false;

  constructor(private readonly encoder: WavEncoderService) {}

  renderInstructions(instructions: MidiInstruction[], duration: number, signal?: AbortSignal): Promise<RenderedAudio> {
    // A queued render must use the same plain-data snapshot as its cache identity,
    // even if its caller edits or reuses the original plan while samples load.
    const identity = JSON.stringify(instructions);
    instructions = JSON.parse(identity) as MidiInstruction[];
    // Include the final strum spread and release, even if a plan ends at its last action.
    const end = Math.max(duration, ...instructions.map(i => this.instructionEnd(i)));
    return this.render(identity, end, async (context, resources, check) => {
      await this.scheduleInstructions(context, resources, check, instructions);
    }, signal, 0, instructions.some(i => i.technique === 'palm-muted' || i.technique === 'dead-note') ? 0.95 : 1, duration);
  }

  private async scheduleInstructions(
    context: Tone.OfflineContext, resources: { dispose(): unknown }[], check: () => void,
    instructions: MidiInstruction[], shared = false
  ): Promise<void> {
    const bank = (urls: Record<string, string>, release: number, attack: number, volume = 0) => shared
      ? this.sharedSampler(context, resources, check, urls, release, attack, volume)
      : this.sampler(context, resources, urls, release, attack, volume);
    const instruments: MidiSamplerSet = {};
    if (instructions.some(i => !i.percussion && i.technique !== 'palm-muted' && i.technique !== 'dead-note' && i.chokeAt === undefined)) {
      instruments.guitar = await bank(guitarUrls(), MIDI_PLAYBACK_CONFIG.samplers.guitar.releaseSeconds, MIDI_PLAYBACK_CONFIG.samplers.guitar.attackSeconds);
      check();
    }
    if (instructions.some(i => i.percussion)) {
      instruments.percussion = await bank({
        C3: '/samples/percussion/guitar_body_knock.mp3', 'C#3': '/samples/percussion/guitar_string_slap.mp3'
      }, MIDI_PLAYBACK_CONFIG.samplers.percussion.releaseSeconds, MIDI_PLAYBACK_CONFIG.samplers.percussion.attackSeconds, MIDI_PLAYBACK_CONFIG.samplers.percussion.volumeDb);
      check();
    }
    const buffers = new Map<number, Tone.ToneAudioBuffer>();
    const articulated = new Map<string, AudioBuffer>();
    if (instructions.some(i => i.technique === 'palm-muted' || i.technique === 'dead-note' || i.chokeAt !== undefined
      || (i.technique === 'slide' && (i.legato?.source || i.legatos?.some(l => l.source))))) {
      for (const pitch of GUITAR_ANCHORS) {
        const buffer = shared ? new Tone.ToneAudioBuffer(await this.sharedBuffer(guitarUrls()[pitch])) : await this.loadGuitarBuffer(guitarUrls()[pitch]);
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
            const assetKey = `${MIDI_SAMPLE_SET_VERSION}:${key}`;
            articulated.set(key, shared ? this.cachedAsset(assetKey) ?? this.rememberAsset(assetKey, await renderGuitarArticulation(original, anchor, name, technique))
              : await renderGuitarArticulation(original, anchor, name, technique));
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
  }

  /** Render only the voices which can contribute to this exact sample interval. */
  async renderWindow(instructions: MidiInstruction[], scoreDuration: number, startFrame: number, endFrame: number,
    signal: AbortSignal, gain = 1, priority = 2, final = false): Promise<RenderedWindow> {
    if (startFrame < 0 || endFrame <= startFrame || !Number.isInteger(startFrame) || !Number.isInteger(endFrame)) {
      throw new Error('Invalid streaming audio window.');
    }
    const start = startFrame / RENDER_SAMPLE_RATE, end = endFrame / RENDER_SAMPLE_RATE;
    const contributing = instructions.filter(i => i.time < end && this.instructionEnd(i) > start);
    // Keep the original attack and all subsequent rate/envelope automation. Align
    // the context origin to the full render's 128-frame processing quantum.
    const originFrame = Math.max(0, Math.floor(Math.min(start, ...contributing.map(i => i.time)) * RENDER_SAMPLE_RATE / 128) * 128);
    const origin = originFrame / RENDER_SAMPLE_RATE;
    if (end - origin > 30) throw new Error('This sustained note needs complete-file playback. Retry playback.');
    const shifted = contributing.map(i => ({ ...i, time: i.time - origin,
      ...(i.chokeAt === undefined ? {} : { chokeAt: i.chokeAt - origin }) }));
    const result = await this.render(JSON.stringify({ instructions, startFrame, endFrame, gain }), (endFrame - originFrame) / RENDER_SAMPLE_RATE,
      (context, resources, check) => this.scheduleInstructions(context, resources, check, shifted, true),
      signal, (startFrame - originFrame) / RENDER_SAMPLE_RATE, 1, final ? Math.max(0, scoreDuration - origin) : undefined, 'pcm', gain, priority);
    if (!result.pcm) throw new Error('No streaming audio was rendered.');
    if (!final && result.pcm.length !== endFrame - startFrame) throw new Error('Streaming audio frame count did not match its window. Retry complete-file playback.');
    return { pcm: result.pcm, startFrame, endFrame: startFrame + result.pcm.length, final };
  }

  instructionEnd(i: MidiInstruction): number {
    const profile = i.technique === 'palm-muted' || i.technique === 'dead-note' ? GUITAR_ARTICULATIONS[i.technique] : undefined;
    const hold = profile ? Math.min(i.playbackDuration, profile.decay + 0.02)
      : i.percussion ? MIDI_PLAYBACK_CONFIG.samplers.percussion.instructionHitDurationSeconds
      : i.legato || i.legatos?.length ? Math.max(MIDI_PLAYBACK_CONFIG.legato.minimumTotalDurationSeconds, i.playbackDuration)
      : i.technique === 'muted' ? MIDI_PLAYBACK_CONFIG.techniques.muted.durationSeconds
      : i.technique === 'percussive' ? MIDI_PLAYBACK_CONFIG.techniques.percussive.durationSeconds : i.playbackDuration;
    const spread = i.playNotes && i.playNotes !== 'parallel'
      ? i.technique === 'dead-note' ? Math.max(0, (i.notes?.length ?? 1) - 1) * 0.012 : 0.22 : 0;
    return Math.min(i.chokeAt ?? Infinity, i.time + hold + spread + (profile ? 0 : i.percussion ? 0.5 : i.technique === 'slide' ? 0.04 : 3));
  }

  /** A single conservative gain for the immutable articulated mix, never per window. */
  async streamingGain(instructions: MidiInstruction[], signal: AbortSignal): Promise<number> {
    if (!instructions.some(i => i.technique === 'palm-muted' || i.technique === 'dead-note')) return 1;
    return this.enqueue(async () => {
      const events: { time: number; delta: number }[] = [];
      const peak = (buffer: AudioBuffer) => {
        const cached = this.peaks.get(buffer);
        if (cached !== undefined) return cached;
        let value = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          for (const sample of buffer.getChannelData(channel)) value = Math.max(value, Math.abs(sample));
        }
        this.peaks.set(buffer, value); return value;
      };
      for (const instruction of instructions) {
        if (signal.aborted || this.destroyed) throw new DOMException('Playback canceled', 'AbortError');
        const voices: { name: string; duration: number; time: number; velocity: number; slide?: boolean; anchorMidi?: number }[] = [];
        const instrument = { triggerAttackRelease: (name: string, duration: number | string, time = 0, velocity = 1) => {
          if (typeof duration === 'number') voices.push({ name, duration, time, velocity });
        } };
        scheduleMidiInstruction({ guitar: instrument, palmMuted: instrument, deadNote: instrument, percussion: instrument,
          slide: voice => voices.push({ name: `${voice.source.semitone}${voice.source.octave}`, duration: voice.duration, time: voice.startTime, velocity: voice.velocity, slide: true, anchorMidi: Math.max(getNoteMidi(voice.source), getNoteMidi(voice.target)) }) }, instruction, instruction.time);
        for (const voice of voices) {
          const midi = getNoteMidi(noteNameToNote(voice.name));
          const anchor = closestGuitarAnchor(GUITAR_ANCHORS.map(name => getNoteMidi(noteNameToNote(name))), voice.anchorMidi ?? midi);
          const pitch = GUITAR_ANCHORS.find(name => getNoteMidi(noteNameToNote(name)) === anchor)!;
          const articulated = instruction.technique === 'palm-muted' || instruction.technique === 'dead-note';
          let buffer = await this.sharedBuffer(instruction.percussion
            ? `/samples/percussion/guitar_${instruction.percussion.technique === 'body-knock' ? 'body_knock' : 'string_slap'}.mp3`
            : guitarUrls()[pitch]);
          if (articulated) {
            const key = `${MIDI_SAMPLE_SET_VERSION}:${instruction.technique}:${voice.name}`;
            buffer = this.cachedAsset(key) ?? this.rememberAsset(key, await renderGuitarArticulation(buffer, anchor, voice.name, instruction.technique as GuitarArticulation));
          }
          const amplitude = peak(buffer) * voice.velocity * (articulated ? 1 / 0.65 : instruction.percussion ? 10 ** (1 / 20) : 1);
          const end = Math.min(instruction.chokeAt ?? Infinity,
            voice.time + (articulated ? Math.min(buffer.duration, voice.duration) : voice.duration + (voice.slide ? 0.04 : instruction.percussion ? 0.5 : 3)));
          if (end > voice.time) events.push({ time: voice.time, delta: amplitude }, { time: end, delta: -amplitude });
        }
      }
      let active = 0, maximum = 0;
      for (const event of events.sort((a, b) => a.time - b.time || a.delta - b.delta)) {
        active += event.delta; maximum = Math.max(maximum, active);
      }
      return maximum > 0.95 ? 0.95 / maximum : 1;
    }, 1);
  }

  private enqueue<T>(run: () => Promise<T>, priority: number): Promise<T> {
    if (this.destroyed) return Promise.reject(new DOMException('Playback canceled', 'AbortError'));
    if (this.jobs.length >= MAX_PENDING_RENDERS) return Promise.reject(new Error('Audio preparation is busy. Retry playback.'));
    return new Promise<T>((resolve, reject) => {
      this.jobs.push({ priority, sequence: this.sequence++, run: async () => { try { resolve(await run()); } catch (error) { reject(error); } } });
      this.jobs.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
      void Promise.resolve().then(() => this.drain());
    });
  }
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try { while (this.jobs.length) await this.jobs.shift()!.run(); }
    finally { this.running = false; }
  }

  private rememberAsset(key: string, buffer: AudioBuffer): AudioBuffer {
    if (this.destroyed) return buffer;
    const bytes = buffer.length * buffer.numberOfChannels * 4;
    if (bytes <= 16 * 1024 * 1024) {
      while (this.assetBytes + bytes > 16 * 1024 * 1024) {
        const oldest = this.assets.entries().next().value;
        if (!oldest) break;
        this.assets.delete(oldest[0]); this.assetBytes -= oldest[1].length * oldest[1].numberOfChannels * 4;
      }
      this.assets.set(key, buffer); this.assetBytes += bytes;
    }
    return buffer;
  }
  private cachedAsset(key: string): AudioBuffer | undefined {
    const buffer = this.assets.get(key);
    if (buffer) { this.assets.delete(key); this.assets.set(key, buffer); }
    return buffer;
  }
  private async sharedBuffer(url: string): Promise<AudioBuffer> {
    const key = `${MIDI_SAMPLE_SET_VERSION}:${url}`;
    const cached = this.cachedAsset(key);
    if (cached) return cached;
    const buffer = await this.loadGuitarBuffer(url);
    try {
      const audio = buffer.get();
      if (!audio) throw new Error('Samples are not ready. Retry playback.');
      return this.rememberAsset(key, audio);
    } finally { buffer.dispose(); }
  }
  private async sharedSampler(context: Tone.OfflineContext, resources: { dispose(): unknown }[], check: () => void,
    urls: Record<string, string>, release: number, attack: number, volume = 0): Promise<Tone.Sampler> {
    const buffers: Record<string, AudioBuffer> = {};
    for (const [name, url] of Object.entries(urls)) { buffers[name] = await this.sharedBuffer(url); check(); }
    const sampler = new Tone.Sampler({ context, urls: buffers, release, attack, volume }).toDestination();
    resources.push(sampler); return sampler;
  }

  render(
    identity: string, duration: number,
    schedule: (context: Tone.OfflineContext, resources: { dispose(): unknown }[], assertActive: () => void) => Promise<void>,
    signal?: AbortSignal, trimStart = 0, peakCeiling = 1, minimumDuration?: number,
    output: 'wav' | 'pcm' = 'wav', fixedGain?: number, priority = 0
  ): Promise<RenderedAudio> {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 603) {
      return Promise.reject(new Error('Audio is too long to prepare. Play a section of up to ten minutes.'));
    }
    if (this.destroyed || signal?.aborted) return Promise.reject(new DOMException('Playback canceled', 'AbortError'));
    const key = JSON.stringify({ revision: MIDI_SAMPLE_SET_VERSION, identity, duration, trimStart, peakCeiling, minimumDuration, sampleRate: RENDER_SAMPLE_RATE, output, fixedGain });
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
      const promise = this.enqueue(async () => {
        check();
        // Tone converts seconds back to an integer native frame count. Keep the
        // requested PCM frame count above that integer by a small fraction of a
        // sample, so floating-point subtraction cannot truncate a window by one.
        const contextDuration = output === 'pcm' ? (Math.round(duration * RENDER_SAMPLE_RATE) + 0.125) / RENDER_SAMPLE_RATE : duration;
        const context = new Tone.OfflineContext(1, contextDuration, RENDER_SAMPLE_RATE);
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
          if (fixedGain === undefined && peakCeiling < 1) for (let channel = 0; channel < audio.numberOfChannels; channel++) {
            for (const sample of audio.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
          }
          if (peak > peakCeiling) {
            for (let channel = 0; channel < audio.numberOfChannels; channel++) {
              const samples = audio.getChannelData(channel);
              for (let index = 0; index < samples.length; index++) samples[index] *= peakCeiling / peak;
            }
          }
          if (fixedGain !== undefined && fixedGain !== 1) {
            for (let channel = 0; channel < audio.numberOfChannels; channel++) {
              const samples = audio.getChannelData(channel);
              for (let index = 0; index < samples.length; index++) samples[index] *= fixedGain;
            }
          }
          const offset = Math.round(trimStart * audio.sampleRate);
          let end = audio.length;
          if (minimumDuration !== undefined) {
            // Only remove unused release allowance. Preserve score rests and every
            // channel's decay down to the PCM noise floor, plus 20 ms of padding.
            const floor = Math.min(end, Math.ceil(minimumDuration * audio.sampleRate));
            const padding = Math.round(0.02 * audio.sampleRate);
            let last = Math.max(0, floor - padding) - 1;
            for (let channel = 0; channel < audio.numberOfChannels; channel++) {
              const samples = audio.getChannelData(channel);
              for (let index = end - 1; index > last; index--) {
                if (Math.abs(samples[index]) >= 0.5 / 0x8000) { last = index; break; }
              }
            }
            end = Math.min(end, Math.max(floor, last + 1 + padding));
          }
          if (output === 'pcm' && end <= offset) end = Math.min(audio.length, offset + 1);
          if (offset > 0 || end < audio.length) {
            const cropped = context.createBuffer(audio.numberOfChannels, end - offset, audio.sampleRate);
            for (let channel = 0; channel < audio.numberOfChannels; channel++) cropped.copyToChannel(audio.getChannelData(channel).subarray(offset, end), channel);
            audio = cropped;
          }
          const result: RenderedAudio = output === 'pcm' ? { blob: new Blob(), pcm: audio, durationSeconds: audio.duration }
            : { blob: this.encoder.encode(audio), durationSeconds: audio.duration };
          if (output === 'wav' && result.blob.size <= RENDER_CACHE_BYTES) {
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
      }, priority).finally(() => this.pending.delete(key));
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

  ngOnDestroy(): void { this.destroyed = true; this.cache.clear(); this.assets.clear(); this.assetBytes = 0; this.bytes = 0; }
}
