import { Injectable, OnDestroy } from '@angular/core';
import { MidiInstruction, MidiTechnique } from '@/app/core/services/midi.model';
import { getIntervalSemitones, Note, transpose } from '@/app/core/music/semitones';
import { AudioService } from '@/app/core/services/audio.service';

type PlaybackOptions = {
  velocity: number;
  duration?: number;
};

const SAMPLER_KEYS = {
  guitar: 'guitar',
  percussion: 'percussion'
} as const;

const PERCUSSION_NOTES = {
  'body-knock': 'C3',
  'string-slap': 'C#3'
} as const;

const PERCUSSION_TECHNIQUE_ALIASES = {
  body_knock: 'body-knock',
  string_slap: 'string-slap'
} as const;

const MILLISECONDS_PER_SECOND = 1000;

/**
 * Central tuning values for MIDI playback feel.
 * Keep timing, envelope, and velocity knobs here so the service behavior can
 * be adjusted without hunting through the implementation.
 */
const MIDI_PLAYBACK_CONFIG = {
  dynamics: {
    maxVelocity: 1
  },
  scheduling: {
    // Small lead time gives Tone.js room to schedule notes sample-accurately.
    triggerLeadTimeSeconds: 0.001,
    // Extra wait time keeps long releases from being cut off at sequence end.
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
      manualHitDuration: '8n' as const
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
    // Sixteenth-note-like motions stay very tight to avoid sounding arpeggiated.
    shortActionThresholdSeconds: 0.14,
    tightSpacingSeconds: 0.025,
    // Eighth-note-like strums get a slightly wider rake for a natural sweep.
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

@Injectable({
  providedIn: 'root'
})
export class MidiService implements OnDestroy {
  constructor(private audioService: AudioService) {}

  /**
   * Ensures Tone is started and the required samplers exist.
   */
  private async ensureInitialized(): Promise<void> {
    await this.audioService.ensureStarted();

    await this.audioService.ensureSamplerInitialized(SAMPLER_KEYS.guitar, {
      urls: {
        // Octave 2
        'E2': '/samples/notes/guitar_E2.mp3',
        'F2': '/samples/notes/guitar_F2.mp3',
        'F#2': '/samples/notes/guitar_Fs2.mp3',
        'G2': '/samples/notes/guitar_G2.mp3',
        'G#2': '/samples/notes/guitar_Gs2.mp3',
        'A2': '/samples/notes/guitar_A2.mp3',
        'A#2': '/samples/notes/guitar_As2.mp3',
        'B2': '/samples/notes/guitar_B2.mp3',

        // Octave 3
        'C3': '/samples/notes/guitar_C3.mp3',
        'C#3': '/samples/notes/guitar_Cs3.mp3',
        'D3': '/samples/notes/guitar_D3.mp3',
        'D#3': '/samples/notes/guitar_Ds3.mp3',
        'E3': '/samples/notes/guitar_E3.mp3',
        'F3': '/samples/notes/guitar_F3.mp3',
        'F#3': '/samples/notes/guitar_Fs3.mp3',
        'G3': '/samples/notes/guitar_G3.mp3',
        'G#3': '/samples/notes/guitar_Gs3.mp3',
        'A3': '/samples/notes/guitar_A3.mp3',
        'A#3': '/samples/notes/guitar_As3.mp3',
        'B3': '/samples/notes/guitar_B3.mp3',

        // Octave 4
        'C4': '/samples/notes/guitar_C4.mp3',
        'C#4': '/samples/notes/guitar_Cs4.mp3',
        'D4': '/samples/notes/guitar_D4.mp3',
        'D#4': '/samples/notes/guitar_Ds4.mp3',
        'E4': '/samples/notes/guitar_E4.mp3',
        'F4': '/samples/notes/guitar_F4.mp3',
        'F#4': '/samples/notes/guitar_Fs4.mp3',
        'G4': '/samples/notes/guitar_G4.mp3',
        'G#4': '/samples/notes/guitar_Gs4.mp3',
        'A4': '/samples/notes/guitar_A4.mp3',
        'A#4': '/samples/notes/guitar_As4.mp3',
        'B4': '/samples/notes/guitar_B4.mp3',

        // Octave 5
        'D5': '/samples/notes/guitar_D5.mp3',
        'D#5': '/samples/notes/guitar_Ds5.mp3',
        'E5': '/samples/notes/guitar_E5.mp3',
        'G5': '/samples/notes/guitar_G5.mp3',
        'G#5': '/samples/notes/guitar_Gs5.mp3'
      },
      release: MIDI_PLAYBACK_CONFIG.samplers.guitar.releaseSeconds,
      attack: MIDI_PLAYBACK_CONFIG.samplers.guitar.attackSeconds,
      volume: MIDI_PLAYBACK_CONFIG.samplers.guitar.volumeDb
    });

    await this.audioService.ensureSamplerInitialized(SAMPLER_KEYS.percussion, {
      urls: {
        // Guitar percussion techniques mapped to notes
        'C3': '/samples/percussion/guitar_body_knock.mp3', // Body knocking
        'C#3': '/samples/percussion/guitar_string_slap.mp3' // String slapping
      },
      release: MIDI_PLAYBACK_CONFIG.samplers.percussion.releaseSeconds,
      attack: MIDI_PLAYBACK_CONFIG.samplers.percussion.attackSeconds,
      volume: MIDI_PLAYBACK_CONFIG.samplers.percussion.volumeDb
    });
  }

  /**
   * Converts Note to Tone.js note name
   */
  private noteToToneName(note: Note): string {
    return `${note.semitone}${note.octave}`;
  }

  /**
   * Applies technique-specific modifications to playback
   */
  private getPlaybackOptions(technique: MidiTechnique, velocity: number): PlaybackOptions {
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

      default: // normal
        return baseOptions;
    }
  }

  /**
   * Play a sequence of MIDI instructions
   */
  async playSequence(instructions: MidiInstruction[]): Promise<void> {
    await this.ensureReady();

    const startTime = this.audioService.now();

    // Schedule all instructions
    for (const instruction of instructions) {
      const scheduleTime = startTime + instruction.time;
      this.triggerInstruction(instruction, scheduleTime);
    }

    // Calculate total duration and wait
    const totalDuration = Math.max(...instructions.map(i => i.time + i.playbackDuration));
    await new Promise(resolve => setTimeout(
      resolve,
      (totalDuration + MIDI_PLAYBACK_CONFIG.scheduling.sequenceTailBufferSeconds) * MILLISECONDS_PER_SECOND
    ));
  }

  async ensureReady(): Promise<void> {
    await this.ensureInitialized();
  }

  triggerInstruction(
    instruction: MidiInstruction,
    scheduleTime: number = this.audioService.now() + MIDI_PLAYBACK_CONFIG.scheduling.triggerLeadTimeSeconds
  ): void {
    const guitarSampler = this.audioService.getSampler(SAMPLER_KEYS.guitar);
    if (!guitarSampler) throw new Error('Guitar sampler not initialized');

    const percussionSampler = this.audioService.getSampler(SAMPLER_KEYS.percussion);
    if (!percussionSampler) throw new Error('Percussion sampler not initialized');

    if (instruction.percussion) {
      const percussionNote = this.getPercussionNote(instruction.percussion.technique);
      percussionSampler.triggerAttackRelease(
        percussionNote,
        MIDI_PLAYBACK_CONFIG.samplers.percussion.instructionHitDurationSeconds,
        scheduleTime,
        instruction.velocity
      );
      return;
    }

    if (!instruction.notes || instruction.notes.length === 0) {
      return;
    }

    const options = this.getPlaybackOptions(instruction.technique, instruction.velocity);
    const playMode = instruction.playNotes || 'parallel';

    if (instruction.legato) {
      this.playLegatoTechnique(instruction, scheduleTime, options);
      return;
    }

    if (instruction.notes.length > 1 && playMode !== 'parallel') {
      this.playSequentialNotes(instruction, scheduleTime, options);
      return;
    }

    for (const note of instruction.notes) {
      const noteName = this.noteToToneName(note.note);

      guitarSampler.triggerAttackRelease(
        noteName,
        options.duration ?? instruction.playbackDuration,
        scheduleTime,
        options.velocity
      );
    }
  }

  /**
   * Map percussion technique to the note name in the percussion sampler
   */
  private getPercussionNote(technique: 'body-knock' | 'string-slap'): string {
    return PERCUSSION_NOTES[technique];
  }

  /**
   * Play notes sequentially or in reverse order
   */
  private playSequentialNotes(
    instruction: MidiInstruction,
    startTime: number,
    options: PlaybackOptions
  ): void {
    const sampler = this.audioService.getSampler(SAMPLER_KEYS.guitar);
    if (!sampler || !instruction.notes) return;

    const notes = instruction.notes;
    if (notes.length === 0) return;

    const noteSpacing = this.getSequentialNoteSpacing(instruction.actionDuration, notes.length);
    const playMode = instruction.playNotes || 'parallel';

    let sortedNotes = [...notes];

    if (playMode === 'reversed') {
      sortedNotes = sortedNotes.reverse();
    }

    // Play each note with slight timing offset
    for (let i = 0; i < sortedNotes.length; i++) {
      const note = sortedNotes[i];
      const noteTime = startTime + (i * noteSpacing);
      const noteName = this.noteToToneName(note.note);

      sampler.triggerAttackRelease(
        noteName,
        options.duration ?? instruction.playbackDuration,
        noteTime,
        options.velocity
      );
    }
  }

  private getSequentialNoteSpacing(actionDuration: number, noteCount: number): number {
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

  private playLegatoTechnique(
    instruction: MidiInstruction,
    startTime: number,
    options: PlaybackOptions
  ): void {
    const sampler = this.audioService.getSampler(SAMPLER_KEYS.guitar);
    if (!sampler || !instruction.legato) return;
    const totalDuration = Math.max(
      MIDI_PLAYBACK_CONFIG.legato.minimumTotalDurationSeconds,
      instruction.playbackDuration
    );

    if (instruction.technique === 'slide') {
      this.playSlideTechnique(sampler, instruction, startTime, options, totalDuration);
      return;
    }

    const targetNoteName = this.noteToToneName(instruction.legato.target.note);

    let targetVelocityScale: number = MIDI_PLAYBACK_CONFIG.legato.targetVelocityScale.default;

    if (instruction.technique === 'pull-off') {
      targetVelocityScale = MIDI_PLAYBACK_CONFIG.legato.targetVelocityScale.pullOff;
    } else if (instruction.technique === 'hammer-on' && !instruction.legato.source) {
      targetVelocityScale = MIDI_PLAYBACK_CONFIG.legato.targetVelocityScale.hammerOnWithoutSource;
    }

    sampler.triggerAttackRelease(
      targetNoteName,
      Math.max(MIDI_PLAYBACK_CONFIG.legato.minimumAudibleDurationSeconds, totalDuration),
      startTime,
      Math.max(MIDI_PLAYBACK_CONFIG.legato.minimumTargetVelocity, options.velocity * targetVelocityScale)
    );
  }

  private playSlideTechnique(
    sampler: { triggerAttackRelease: (note: string, duration: number, time: number, velocity: number) => void },
    instruction: MidiInstruction,
    startTime: number,
    options: PlaybackOptions,
    totalDuration: number
  ): void {
    if (!instruction.legato) return;

    if (!instruction.legato.source) {
      sampler.triggerAttackRelease(
        this.noteToToneName(instruction.legato.target.note),
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
        this.noteToToneName(instruction.legato.target.note),
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
        this.noteToToneName(notes[index]),
        noteDuration,
        noteTime,
        noteVelocity
      );
    }
  }

  /**
   * Play a guitar percussion technique
   */
  async playPercussionTechnique(technique: string): Promise<void> {
    await this.ensureInitialized();

    const percussionSampler = this.audioService.getSampler(SAMPLER_KEYS.percussion);
    if (!percussionSampler) throw new Error('Percussion sampler not initialized');

    const normalizedTechnique =
      PERCUSSION_TECHNIQUE_ALIASES[technique as keyof typeof PERCUSSION_TECHNIQUE_ALIASES];
    const note = normalizedTechnique ? PERCUSSION_NOTES[normalizedTechnique] : undefined;
    if (note) {
      percussionSampler.triggerAttackRelease(
        note,
        MIDI_PLAYBACK_CONFIG.samplers.percussion.manualHitDuration
      );
    } else {
      console.warn(`Unknown percussion technique: ${technique}`);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.audioService.disposeSampler(SAMPLER_KEYS.guitar);
    this.audioService.disposeSampler(SAMPLER_KEYS.percussion);
  }

  ngOnDestroy(): void {
    this.dispose();
  }
}
