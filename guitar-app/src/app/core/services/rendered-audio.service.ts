import { Injectable, OnDestroy } from '@angular/core';
import * as Tone from 'tone';
import { MidiInstruction } from '@/app/core/services/midi.model';
import { WavEncoderService } from '@/app/core/services/wav-encoder.service';
import {
  MIDI_PLAYBACK_CONFIG,
  MIDI_SAMPLE_SET_VERSION,
  SAMPLER_KEYS,
  scheduleMidiInstruction
} from '@/app/core/services/midi-renderer';

export interface RenderedAudio {
  url: string;
  blob: Blob;
  durationSeconds: number;
}

interface CacheEntry {
  key: string;
  value: RenderedAudio;
}

const RENDER_CACHE_LIMIT = 10;

@Injectable({
  providedIn: 'root'
})
export class RenderedAudioService implements OnDestroy {
  private readonly cache: CacheEntry[] = [];

  constructor(private wavEncoder: WavEncoderService) {}

  async renderInstructions(
    instructions: MidiInstruction[],
    durationSeconds: number,
    cacheKey?: string
  ): Promise<RenderedAudio> {
    const safeDurationSeconds = Math.max(0.01, durationSeconds);
    const key = cacheKey ?? this.buildCacheKey(instructions, safeDurationSeconds);
    const cached = this.getCached(key);
    if (cached) {
      return cached;
    }

    const toneBuffer = await Tone.Offline(async () => {
      const guitarSampler = await this.createSampler({
        urls: {
          E2: '/samples/notes/guitar_E2.mp3',
          A2: '/samples/notes/guitar_A2.mp3',
          D3: '/samples/notes/guitar_D3.mp3',
          G3: '/samples/notes/guitar_G3.mp3',
          B3: '/samples/notes/guitar_B3.mp3',
          E4: '/samples/notes/guitar_E4.mp3',
          E5: '/samples/notes/guitar_E5.mp3'
        },
        release: MIDI_PLAYBACK_CONFIG.samplers.guitar.releaseSeconds,
        attack: MIDI_PLAYBACK_CONFIG.samplers.guitar.attackSeconds,
        volume: MIDI_PLAYBACK_CONFIG.samplers.guitar.volumeDb
      });

      const percussionSampler = await this.createSampler({
        urls: {
          C3: '/samples/percussion/guitar_body_knock.mp3',
          'C#3': '/samples/percussion/guitar_string_slap.mp3'
        },
        release: MIDI_PLAYBACK_CONFIG.samplers.percussion.releaseSeconds,
        attack: MIDI_PLAYBACK_CONFIG.samplers.percussion.attackSeconds,
        volume: MIDI_PLAYBACK_CONFIG.samplers.percussion.volumeDb
      });

      for (const instruction of instructions) {
        scheduleMidiInstruction(
          { guitar: guitarSampler, percussion: percussionSampler },
          instruction,
          instruction.time
        );
      }
    }, safeDurationSeconds);

    const audioBuffer = toneBuffer.get();
    if (!audioBuffer) {
      throw new Error('Tone offline rendering did not produce an AudioBuffer');
    }

    const blob = this.wavEncoder.encode(audioBuffer);
    const rendered = {
      blob,
      url: URL.createObjectURL(blob),
      durationSeconds: safeDurationSeconds
    };
    this.setCached(key, rendered);
    return rendered;
  }

  ngOnDestroy(): void {
    for (const entry of this.cache) {
      URL.revokeObjectURL(entry.value.url);
    }
    this.cache.length = 0;
  }

  private async createSampler(options: Partial<Tone.SamplerOptions> & { urls: Record<string, string> }): Promise<Tone.Sampler> {
    let settled = false;
    let resolveReady!: () => void;
    let rejectReady!: (error: any) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const sampler = new Tone.Sampler({
      ...options,
      onload: () => {
        if (!settled) {
          settled = true;
          resolveReady();
        }
      },
      onerror: (error: any) => {
        if (!settled) {
          settled = true;
          rejectReady(error);
        }
      }
    }).toDestination();

    await ready;
    return sampler;
  }

  private getCached(key: string): RenderedAudio | undefined {
    const index = this.cache.findIndex(entry => entry.key === key);
    if (index < 0) {
      return undefined;
    }

    const [entry] = this.cache.splice(index, 1);
    this.cache.push(entry);
    return entry.value;
  }

  private setCached(key: string, value: RenderedAudio): void {
    this.cache.push({ key, value });
    while (this.cache.length > RENDER_CACHE_LIMIT) {
      const evicted = this.cache.shift();
      if (evicted) {
        URL.revokeObjectURL(evicted.value.url);
      }
    }
  }

  private buildCacheKey(instructions: MidiInstruction[], durationSeconds: number): string {
    return JSON.stringify({
      type: SAMPLER_KEYS.guitar,
      sampleSet: MIDI_SAMPLE_SET_VERSION,
      durationSeconds,
      instructions
    });
  }
}
