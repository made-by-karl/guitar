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
      playbackDuration: 0.6,
      actionDuration: 0.125,
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

    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'E2', 0.3, 0.001, expect.any(Number));
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'F#2', 0.3, 0.301, expect.any(Number));
  });

  it('switches to the target note halfway through a short hammer-on', () => {
    const { service, guitarSampler } = createService();

    service.triggerInstruction({
      time: 0,
      playbackDuration: 0.125,
      actionDuration: 0.125,
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

    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'E2', 0.0625, 0.001, expect.any(Number));
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'F#2', 0.08, 0.0635, expect.any(Number));
  });

  it('renders slides with a longer transition before the target note', () => {
    const { service, guitarSampler } = createService();

    service.triggerInstruction({
      time: 0,
      playbackDuration: 0.8,
      actionDuration: 0.125,
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

  it('keeps sequential strums tight for sixteenth-like durations', () => {
    const { service, guitarSampler } = createService();

    service.triggerInstruction({
      time: 0,
      playbackDuration: 0.8,
      actionDuration: 0.125,
      velocity: 0.7,
      technique: 'normal',
      playNotes: 'sequential',
      notes: [
        { note: note('E', 2) },
        { note: note('A', 2) },
        { note: note('D', 3) }
      ]
    });

    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'E2', 0.8, 0.001, 0.7);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'A2', 0.8, 0.026000000000000002, 0.7);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(3, 'D3', 0.8, 0.051000000000000004, 0.7);
  });

  it('uses normal sequential strum spacing for eighth-like action durations', () => {
    const { service, guitarSampler } = createService();

    service.triggerInstruction({
      time: 0,
      playbackDuration: 0.5,
      actionDuration: 0.25,
      velocity: 0.7,
      technique: 'normal',
      playNotes: 'sequential',
      notes: [
        { note: note('E', 2) },
        { note: note('A', 2) },
        { note: note('D', 3) },
        { note: note('G', 3) },
        { note: note('B', 3) }
      ]
    });

    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'E2', 0.5, 0.001, 0.7);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'A2', 0.5, 0.041, 0.7);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(5, 'B3', 0.5, 0.161, 0.7);
  });

  it('uses the same normal strum spacing for quarter-like action durations', () => {
    const { service, guitarSampler } = createService();

    service.triggerInstruction({
      time: 0,
      playbackDuration: 0.5,
      actionDuration: 0.5,
      velocity: 0.7,
      technique: 'normal',
      playNotes: 'sequential',
      notes: [
        { note: note('E', 2) },
        { note: note('A', 2) },
        { note: note('D', 3) },
        { note: note('G', 3) },
        { note: note('B', 3) }
      ]
    });

    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'E2', 0.5, 0.001, 0.7);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'A2', 0.5, 0.041, 0.7);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(5, 'B3', 0.5, 0.161, 0.7);
  });

  it('keeps reversed strum order while widening longer strums', () => {
    const { service, guitarSampler } = createService();

    service.triggerInstruction({
      time: 0,
      playbackDuration: 0.5,
      actionDuration: 0.25,
      velocity: 0.7,
      technique: 'normal',
      playNotes: 'reversed',
      notes: [
        { note: note('E', 2) },
        { note: note('A', 2) },
        { note: note('D', 3) },
        { note: note('G', 3) },
        { note: note('B', 3) }
      ]
    });

    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'B3', 0.5, 0.001, 0.7);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'G3', 0.5, 0.041, 0.7);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(5, 'E2', 0.5, 0.161, 0.7);
  });
});
