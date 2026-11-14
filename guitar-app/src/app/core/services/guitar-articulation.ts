import { getNoteMidi, noteNameToNote } from '@/app/core/music/semitones';

// Selected in the listening comparison: A for palm mute, final C for dead strums.
export const GUITAR_ARTICULATIONS = {
  'palm-muted': { decay: 0.32, cutoff: 2400, gainDb: 0 },
  'dead-note': { decay: 0.085, cutoff: 900, gainDb: 3 }
} as const;
export type GuitarArticulation = keyof typeof GUITAR_ARTICULATIONS;

export function closestGuitarAnchor(anchors: Iterable<number>, pitch: number): number {
  return [...anchors].reduce((best, entry) => Math.abs(entry - pitch) < Math.abs(best - pitch) ? entry : best);
}

/** Prepare one pitched voice; transposition precedes damping so the decay stays constant. */
export async function renderGuitarArticulation(
  original: AudioBuffer, anchor: number, noteName: string, articulation: GuitarArticulation
): Promise<AudioBuffer> {
  const profile = GUITAR_ARTICULATIONS[articulation];
  const duration = profile.decay + 0.02;
  const context = new OfflineAudioContext(1, Math.ceil(duration * 44100), 44100);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  const pitch = getNoteMidi(noteNameToNote(noteName));
  source.buffer = original;
  source.playbackRate.value = 2 ** ((pitch - anchor) / 12);
  const fundamental = 440 * 2 ** ((pitch - 69) / 12);
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  filter.frequency.setValueAtTime(Math.min(16000, Math.max(6500, fundamental * 8)), 0);
  filter.frequency.exponentialRampToValueAtTime(Math.min(22000, Math.max(profile.cutoff, fundamental * 2.2)), 0.065);
  envelope.gain.setValueAtTime(0, 0);
  envelope.gain.linearRampToValueAtTime(0.65, 0.003);
  const tau = profile.decay / Math.log(1000);
  envelope.gain.setTargetAtTime(0, 0.006, tau);
  envelope.gain.setValueAtTime(0.65 * Math.exp(-(duration - 0.008 - 0.006) / tau), duration - 0.008);
  envelope.gain.linearRampToValueAtTime(0, duration);
  source.connect(filter).connect(envelope).connect(context.destination);
  source.start(0); source.stop(duration);
  try {
    const buffer = await context.startRendering();
    const data = buffer.getChannelData(0);
    let energy = 0, count = 0, peak = 0;
    for (let index = 0; index < data.length; index++) {
      peak = Math.max(peak, Math.abs(data[index]));
      if (index >= Math.round(0.003 * 44100) && index < Math.round(0.043 * 44100)) {
        energy += data[index] ** 2; count++;
      }
    }
    if (!energy) throw new Error('Guitar articulation produced no sound. Retry playback.');
    const gain = Math.min((0.1 * 10 ** (profile.gainDb / 20)) / Math.sqrt(energy / count), 0.85 / peak);
    for (let index = 0; index < data.length; index++) data[index] *= gain;
    return buffer;
  } finally { source.disconnect(); filter.disconnect(); envelope.disconnect(); }
}
