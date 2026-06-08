import { MidiInstruction, MidiTechnique } from '@/app/core/services/midi.model';
import { getIntervalSemitones, Note, transpose } from '@/app/core/music/semitones';

type PlaybackOptions = {
  velocity: number;
  duration?: number;
};

export interface TriggerableSampler {
  triggerAttackRelease(note: string, duration: number | string, time?: number, velocity?: number): void;
}

export interface MidiSamplerSet {
  guitar: TriggerableSampler;
  percussion: TriggerableSampler;
}

export const SAMPLER_KEYS = {
  guitar: 'guitar',
  percussion: 'percussion'
} as const;

export const PERCUSSION_NOTES = {
  'body-knock': 'C3',
  'string-slap': 'C#3'
} as const;

export const PERCUSSION_TECHNIQUE_ALIASES = {
  body_knock: 'body-knock',
  string_slap: 'string-slap'
} as const;

export const MIDI_SAMPLE_SET_VERSION = 'guitar-samples-v1';

export const MIDI_PLAYBACK_CONFIG = {
  dynamics: {
    maxVelocity: 1
  },
  scheduling: {
    triggerLeadTimeSeconds: 0.001,
    sequenceTailBufferSeconds: 0.5
  },
  samplers: {
    guitar: {
      releaseSeconds: 3,
      attackSeconds: 0.005,
      volumeDb: 0
    },
    percussion: {
      releaseSeconds: 0.5,
      attackSeconds: 0.001,
      volumeDb: 1,
      instructionHitDurationSeconds: 0.5,
      manualHitDurationSeconds: 0.5
    }
  },
  techniques: {
    muted: {
      durationSeconds: 0.3,
      velocityScale: 0.6
    },
    palmMuted: {
      durationSeconds: 0.8,
      velocityScale: 0.7
    },
    percussive: {
      durationSeconds: 0.015,
      velocityScale: 0.8
    },
    accented: {
      velocityScale: 1.6
    }
  },
  sequentialStrum: {
    shortActionThresholdSeconds: 0.14,
    tightSpacingSeconds: 0.025,
    defaultSpacingSeconds: 0.03,
    maxSpreadSeconds: 0.22
  },
  legato: {
    minimumTotalDurationSeconds: 0.12,
    minimumAudibleDurationSeconds: 0.08,
    minimumTargetVelocity: 0.2,
    targetVelocityScale: {
      default: 0.78,
      pullOff: 0.72,
      hammerOnWithoutSource: 0.62
    }
  },
  slide: {
    minTransitionWindowSeconds: 0.09,
    maxTransitionWindowSeconds: 0.22,
    transitionWindowShare: 0.55,
    minStepDurationSeconds: 0.05,
    maxStepDurationShare: 0.5,
    stepDurationOverlapFactor: 1.3,
    targetVelocityScale: 0.95,
    intermediateVelocityScale: 0.65,
    minimumIntermediateVelocity: 0.18
  }
} as const;

export function scheduleMidiInstruction(
  samplers: MidiSamplerSet,
  instruction: MidiInstruction,
  scheduleTime: number
): void {
  if (instruction.percussion) {
    samplers.percussion.triggerAttackRelease(
      getPercussionNote(instruction.percussion.technique),
      MIDI_PLAYBACK_CONFIG.samplers.percussion.instructionHitDurationSeconds,
      scheduleTime,
      instruction.velocity
    );
    return;
  }

  if (!instruction.notes || instruction.notes.length === 0) {
    return;
  }

  const options = getPlaybackOptions(instruction.technique, instruction.velocity);
  const playMode = instruction.playNotes || 'parallel';

  if (instruction.legato) {
    scheduleLegatoTechnique(samplers.guitar, instruction, scheduleTime, options);
    return;
  }

  if (instruction.notes.length > 1 && playMode !== 'parallel') {
    scheduleSequentialNotes(samplers.guitar, instruction, scheduleTime, options);
    return;
  }

  for (const note of instruction.notes) {
    samplers.guitar.triggerAttackRelease(
      noteToToneName(note.note),
      options.duration ?? instruction.playbackDuration,
      scheduleTime,
      options.velocity
    );
  }
}

export function getPercussionNote(technique: 'body-knock' | 'string-slap'): string {
  return PERCUSSION_NOTES[technique];
}

export function normalizePercussionTechnique(technique: string): 'body-knock' | 'string-slap' | undefined {
  return PERCUSSION_TECHNIQUE_ALIASES[technique as keyof typeof PERCUSSION_TECHNIQUE_ALIASES];
}

function noteToToneName(note: Note): string {
  return `${note.semitone}${note.octave}`;
}

function getPlaybackOptions(technique: MidiTechnique, velocity: number): PlaybackOptions {
  const baseOptions = {
    velocity,
    duration: undefined
  };

  switch (technique) {
    case 'muted':
      return {
        ...baseOptions,
        duration: MIDI_PLAYBACK_CONFIG.techniques.muted.durationSeconds,
        velocity: velocity * MIDI_PLAYBACK_CONFIG.techniques.muted.velocityScale
      };
    case 'palm-muted':
      return {
        ...baseOptions,
        duration: MIDI_PLAYBACK_CONFIG.techniques.palmMuted.durationSeconds,
        velocity: velocity * MIDI_PLAYBACK_CONFIG.techniques.palmMuted.velocityScale
      };
    case 'percussive':
      return {
        ...baseOptions,
        duration: MIDI_PLAYBACK_CONFIG.techniques.percussive.durationSeconds,
        velocity: velocity * MIDI_PLAYBACK_CONFIG.techniques.percussive.velocityScale
      };
    case 'accented':
      return {
        ...baseOptions,
        velocity: Math.min(
          MIDI_PLAYBACK_CONFIG.dynamics.maxVelocity,
          velocity * MIDI_PLAYBACK_CONFIG.techniques.accented.velocityScale
        )
      };
    default:
      return baseOptions;
  }
}

function scheduleSequentialNotes(
  sampler: TriggerableSampler,
  instruction: MidiInstruction,
  startTime: number,
  options: PlaybackOptions
): void {
  const notes = instruction.notes;
  if (!notes || notes.length === 0) return;

  const noteSpacing = getSequentialNoteSpacing(instruction.actionDuration, notes.length);
  const playMode = instruction.playNotes || 'parallel';
  const sortedNotes = playMode === 'reversed' ? [...notes].reverse() : [...notes];

  for (let i = 0; i < sortedNotes.length; i++) {
    sampler.triggerAttackRelease(
      noteToToneName(sortedNotes[i].note),
      options.duration ?? instruction.playbackDuration,
      startTime + (i * noteSpacing),
      options.velocity
    );
  }
}

function getSequentialNoteSpacing(actionDuration: number, noteCount: number): number {
  const {
    tightSpacingSeconds,
    shortActionThresholdSeconds,
    defaultSpacingSeconds,
    maxSpreadSeconds
  } = MIDI_PLAYBACK_CONFIG.sequentialStrum;

  if (noteCount <= 1 || actionDuration <= shortActionThresholdSeconds) {
    return tightSpacingSeconds;
  }

  return Math.max(
    tightSpacingSeconds,
    Math.min(defaultSpacingSeconds, maxSpreadSeconds / (noteCount - 1))
  );
}

function scheduleLegatoTechnique(
  sampler: TriggerableSampler,
  instruction: MidiInstruction,
  startTime: number,
  options: PlaybackOptions
): void {
  if (!instruction.legato) return;
  const totalDuration = Math.max(
    MIDI_PLAYBACK_CONFIG.legato.minimumTotalDurationSeconds,
    instruction.playbackDuration
  );

  if (instruction.technique === 'slide') {
    scheduleSlideTechnique(sampler, instruction, startTime, options, totalDuration);
    return;
  }

  let targetVelocityScale: number = MIDI_PLAYBACK_CONFIG.legato.targetVelocityScale.default;
  if (instruction.technique === 'pull-off') {
    targetVelocityScale = MIDI_PLAYBACK_CONFIG.legato.targetVelocityScale.pullOff;
  } else if (instruction.technique === 'hammer-on' && !instruction.legato.source) {
    targetVelocityScale = MIDI_PLAYBACK_CONFIG.legato.targetVelocityScale.hammerOnWithoutSource;
  }

  sampler.triggerAttackRelease(
    noteToToneName(instruction.legato.target.note),
    Math.max(MIDI_PLAYBACK_CONFIG.legato.minimumAudibleDurationSeconds, totalDuration),
    startTime,
    Math.max(MIDI_PLAYBACK_CONFIG.legato.minimumTargetVelocity, options.velocity * targetVelocityScale)
  );
}

function scheduleSlideTechnique(
  sampler: TriggerableSampler,
  instruction: MidiInstruction,
  startTime: number,
  options: PlaybackOptions,
  totalDuration: number
): void {
  if (!instruction.legato) return;

  if (!instruction.legato.source) {
    sampler.triggerAttackRelease(
      noteToToneName(instruction.legato.target.note),
      totalDuration,
      startTime,
      options.velocity
    );
    return;
  }

  const interval = getIntervalSemitones(
    instruction.legato.source.note,
    instruction.legato.target.note
  );
  const direction = Math.sign(interval);
  const distance = Math.abs(interval);

  if (direction === 0 || distance === 0) {
    sampler.triggerAttackRelease(
      noteToToneName(instruction.legato.target.note),
      totalDuration,
      startTime,
      options.velocity
    );
    return;
  }

  const notes: Note[] = [];
  for (let step = 1; step <= distance; step++) {
    notes.push(transpose(instruction.legato.source.note, step * direction));
  }

  const transitionWindow = Math.min(
    MIDI_PLAYBACK_CONFIG.slide.maxTransitionWindowSeconds,
    Math.max(
      MIDI_PLAYBACK_CONFIG.slide.minTransitionWindowSeconds,
      totalDuration * MIDI_PLAYBACK_CONFIG.slide.transitionWindowShare
    )
  );
  const stepSpacing = notes.length > 1 ? transitionWindow / (notes.length - 1) : transitionWindow;
  const perStepDuration = Math.max(
    MIDI_PLAYBACK_CONFIG.slide.minStepDurationSeconds,
    Math.min(
      totalDuration * MIDI_PLAYBACK_CONFIG.slide.maxStepDurationShare,
      stepSpacing * MIDI_PLAYBACK_CONFIG.slide.stepDurationOverlapFactor
    )
  );

  for (let index = 0; index < notes.length; index++) {
    const noteTime = startTime + (index * stepSpacing);
    const isTarget = index === notes.length - 1;
    const noteDuration = isTarget
      ? Math.max(
        MIDI_PLAYBACK_CONFIG.legato.minimumAudibleDurationSeconds,
        totalDuration - (index * stepSpacing)
      )
      : perStepDuration;
    const noteVelocity = isTarget
      ? Math.min(
        MIDI_PLAYBACK_CONFIG.dynamics.maxVelocity,
        options.velocity * MIDI_PLAYBACK_CONFIG.slide.targetVelocityScale
      )
      : Math.max(
        MIDI_PLAYBACK_CONFIG.slide.minimumIntermediateVelocity,
        options.velocity * MIDI_PLAYBACK_CONFIG.slide.intermediateVelocityScale
      );

    sampler.triggerAttackRelease(
      noteToToneName(notes[index]),
      noteDuration,
      noteTime,
      noteVelocity
    );
  }
}
