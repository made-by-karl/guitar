import { scheduleMidiInstruction } from '@/app/core/services/midi-renderer';
import { MidiInstruction } from '@/app/core/services/midi.model';
import { note } from '@/app/core/music/semitones';

describe('MIDI rendering', () => {
  it.each(['parallel', 'sequential', 'reversed'] as const)('routes every palm-muted %s note to the dedicated bank at its planned pitch', playNotes => {
    const guitar = { triggerAttackRelease: jest.fn() }, palmMuted = { triggerAttackRelease: jest.fn() };
    scheduleMidiInstruction({ guitar, palmMuted }, {
      time: 0, playbackDuration: 0.4, actionDuration: 0.25, velocity: 0.9, technique: 'palm-muted', playNotes,
      notes: [{ note: note('C', 1) }, { note: note('F#', 7) }]
    }, 1);
    expect(guitar.triggerAttackRelease).not.toHaveBeenCalled();
    const calls = palmMuted.triggerAttackRelease.mock.calls;
    expect(calls.map(call => call[0])).toEqual(playNotes === 'reversed' ? ['F#7', 'C1'] : ['C1', 'F#7']);
    expect(calls.map(call => call[1])).toEqual([0.4, 0.4]);
    expect(calls.map(call => call[3])).toEqual([0.9, 0.9]);
    expect(calls[1][2]).toBeCloseTo(playNotes === 'parallel' ? 1 : 1.03);
  });

  it('fails a missing palm-muted bank instead of substituting clean notes', () => {
    const guitar = { triggerAttackRelease: jest.fn() };
    expect(() => scheduleMidiInstruction({ guitar }, {
      time: 0, playbackDuration: 1, actionDuration: 1, velocity: 0.7, technique: 'palm-muted', notes: [{ note: note('E', 2) }]
    }, 0)).toThrow('Required guitar samples');
    expect(guitar.triggerAttackRelease).not.toHaveBeenCalled();
  });
  const createSampler = () => ({
    triggerAttackRelease: jest.fn()
  });

  const createService = () => {
    const guitarSampler = createSampler();
    const percussionSampler = createSampler();
    const audioService = {
      getSampler: jest.fn((key: string) => key === 'guitar' ? guitarSampler : percussionSampler),
      now: jest.fn(() => 0),
      playPitchSlide: jest.fn()
    };

    return {
      service: { schedule: (instruction: MidiInstruction) => scheduleMidiInstruction({ guitar: guitarSampler, percussion: percussionSampler, slide: audioService.playPitchSlide }, instruction, 0.001) },
      guitarSampler,
      percussionSampler,
      audioService
    };
  };

  it('renders hammer-ons as target-only legato gestures', () => {
    const { service, guitarSampler } = createService();

    service.schedule({
      time: 0,
      playbackDuration: 0.6,
      actionDuration: 0.125,
      velocity: 0.75,
      technique: 'hammer-on',
      notes: [
        { note: note('F#', 2) }
      ],
      legato: {
        string: 0,
        source: { note: note('E', 2) },
        target: { note: note('F#', 2) }
      }
    });

    expect(guitarSampler.triggerAttackRelease).toHaveBeenCalledTimes(1);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'F#2', 0.6, 0.001, expect.any(Number));
  });

  it('plays orphan hammer-ons with a quieter target attack', () => {
    const { service, guitarSampler } = createService();

    service.schedule({
      time: 0,
      playbackDuration: 0.125,
      actionDuration: 0.125,
      velocity: 0.75,
      technique: 'hammer-on',
      notes: [
        { note: note('F#', 2) }
      ],
      legato: {
        string: 0,
        target: { note: note('F#', 2) }
      }
    });

    expect(guitarSampler.triggerAttackRelease).toHaveBeenCalledTimes(1);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(1, 'F#2', 0.125, 0.001, expect.any(Number));
    expect(guitarSampler.triggerAttackRelease.mock.calls[0][3]).toBeCloseTo(0.465);
  });

  it('renders slides as one continuous pitch voice', () => {
    const { service, guitarSampler, audioService } = createService();

    service.schedule({
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

    expect(guitarSampler.triggerAttackRelease).not.toHaveBeenCalled();
    expect(audioService.playPitchSlide).toHaveBeenCalledTimes(1);
    expect(audioService.playPitchSlide).toHaveBeenCalledWith(expect.objectContaining({
      source: note('G', 3), target: note('A', 3), string: 3, startTime: 0.001, duration: 0.8, glideDuration: 0.22
    }));
  });

  it('renders each voice of a simultaneous multi-string slide', () => {
    const { service, guitarSampler, audioService } = createService();
    service.schedule({
      time: 0, playbackDuration: 0.8, actionDuration: 0.125, velocity: 0.7, technique: 'slide',
      notes: [{ note: note('F#', 2) }, { note: note('B', 2) }],
      legatos: [
        { string: 0, source: { note: note('E', 2) }, target: { note: note('F#', 2) } },
        { string: 1, source: { note: note('A', 2) }, target: { note: note('B', 2) } }
      ]
    });
    expect(guitarSampler.triggerAttackRelease).not.toHaveBeenCalled();
    expect(audioService.playPitchSlide).toHaveBeenCalledTimes(2);
    expect(audioService.playPitchSlide).toHaveBeenCalledWith(expect.objectContaining({ string: 0, target: note('F#', 2), startTime: 0.001 }));
    expect(audioService.playPitchSlide).toHaveBeenCalledWith(expect.objectContaining({ string: 1, target: note('B', 2), startTime: 0.001 }));
  });

  it('keeps sequential strums tight for sixteenth-like durations', () => {
    const { service, guitarSampler } = createService();

    service.schedule({
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

    service.schedule({
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
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'A2', 0.5, 0.031, 0.7);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(5, 'B3', 0.5, 0.121, 0.7);
  });

  it('uses the same normal strum spacing for quarter-like action durations', () => {
    const { service, guitarSampler } = createService();

    service.schedule({
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
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'A2', 0.5, 0.031, 0.7);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(5, 'B3', 0.5, 0.121, 0.7);
  });

  it('keeps reversed strum order while widening longer strums', () => {
    const { service, guitarSampler } = createService();

    service.schedule({
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
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(2, 'G3', 0.5, 0.031, 0.7);
    expect(guitarSampler.triggerAttackRelease).toHaveBeenNthCalledWith(5, 'E2', 0.5, 0.121, 0.7);
  });
});
