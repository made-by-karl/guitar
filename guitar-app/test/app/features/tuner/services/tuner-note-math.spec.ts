import { buildVisibleSemitoneMarkers } from '@/app/features/tuner/services/tuner-display';
import {
  formatNoteLabel,
  frequencyToMidiFloat,
  getCentsOffset,
  getNearestMidi,
  midiToFrequency,
  midiToNote
} from '@/app/features/tuner/services/tuner-note-math';

describe('tuner note math and display helpers', () => {
  it('converts A4 cleanly between midi and frequency', () => {
    expect(frequencyToMidiFloat(440)).toBeCloseTo(69, 6);
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(formatNoteLabel(midiToNote(69))).toBe('A4');
  });

  it('computes the nearest note and cents offset for detuned notes', () => {
    const frequency = 446;

    expect(getNearestMidi(frequency)).toBe(69);
    expect(getCentsOffset(frequency)).toBeGreaterThan(0);
    expect(getCentsOffset(frequency)).toBeLessThan(25);
  });

  it('builds a visible marker window around the current midi position', () => {
    const markers = buildVisibleSemitoneMarkers(69.2);

    expect(markers.some(marker => marker.label === 'A4')).toBe(true);
    expect(markers.some(marker => marker.label === 'G#4')).toBe(true);
    expect(markers.some(marker => marker.label === 'A#4')).toBe(true);
  });
});
