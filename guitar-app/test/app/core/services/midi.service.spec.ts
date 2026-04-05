import { MidiService } from '@/app/core/services/midi.service';
import { note } from '@/app/core/music/semitones';

describe('MidiService', () => {
  const createSampler = () => ({
    triggerAttackRelease: jest.fn()
  });

  const createService = () => {
    const guitarSampler = createSampler();
    const percussionSampler = createSampler();
    const audioService = {
      getSampler: jest.fn((key: string) => key === 'guitar' ? guitarSampler : percussionSampler),
      now: jest.fn(() => 0)
    };

    return {
      service: new MidiService(audioService as any),
      guitarSampler,
      percussionSampler
    };
  };

  it('renders hammer-ons as a two-stage legato gesture', () => {
    const { service, guitarSampler } = createService();

    service.triggerInstruction({
      time: 0,
      duration: 0.6,
      velocity: 0.75,
      technique: 'hammer-on',
      notes: [
        { note: note('E', 2) },
        { note: note('F#', 2) }
      ],
      legato: {
        string: 0,
        source: { note: note('E', 2) },
        target: { note: note('F#', 2) }
      }
    });

    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'E2', expect.any(Number), 0.001, expect.any(Number));
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'F#2', expect.any(Number), 0.07100000000000001, expect.any(Number));
  });

  it('renders slides with a longer transition before the target note', () => {
    const { service, guitarSampler } = createService();

    service.triggerInstruction({
      time: 0,
      duration: 0.8,
      velocity: 0.75,
      technique: 'slide',
      notes: [
        { note: note('G', 3) },
        { note: note('A', 3) }
      ],
      legato: {
        string: 3,
        source: { note: note('G', 3) },
        target: { note: note('A', 3) }
      }
    });

    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'G3', expect.any(Number), 0.001, expect.any(Number));
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'G#3', expect.any(Number), expect.any(Number), expect.any(Number));
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(3, 'A3', expect.any(Number), expect.any(Number), expect.any(Number));
  });
});
