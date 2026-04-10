import { Injectable, OnDestroy } from '@angular/core';
import { MidiInstruction, MidiTechnique } from '@/app/core/services/midi.model';
import { getIntervalSemitones, Note, transpose } from '@/app/core/music/semitones';
import { AudioService } from '@/app/core/services/audio.service';

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

    await this.audioService.ensureSamplerInitialized('guitar', {
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
      release: 3,
      attack: 0.005,
      volume: 0
    });

    await this.audioService.ensureSamplerInitialized('percussion', {
      urls: {
        // Guitar percussion techniques mapped to notes
        'C3': '/samples/percussion/guitar_body_knock.mp3', // Body knocking
        'C#3': '/samples/percussion/guitar_string_slap.mp3' // String slapping
      },
      release: 0.5,
      attack: 0.001,
      volume: 1
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
  private getPlaybackOptions(technique: MidiTechnique, velocity: number) {
    const baseOptions = {
      velocity: velocity,
      duration: undefined
    };

    switch (technique) {
      case 'muted':
        return {
          ...baseOptions,
          duration: 0.3, // Still short but less abrupt
          velocity: velocity * 0.6
        };
      
      case 'palm-muted':
        return {
          ...baseOptions,
          duration: 0.8, // Longer than muted but shorter than open
          velocity: velocity * 0.7
        };
      
      case 'percussive':
        return {
          ...baseOptions,
          duration: 0.015, // Very short for percussive effect
          velocity: velocity * 0.8
        };
      
      case 'accented':
        return {
          ...baseOptions,
          velocity: Math.min(1.0, velocity * 1.6)
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
    await new Promise(resolve => setTimeout(resolve, (totalDuration + 0.5) * 1000));
  }

  async ensureReady(): Promise<void> {
    await this.ensureInitialized();
  }

  triggerInstruction(instruction: MidiInstruction, scheduleTime: number = this.audioService.now() + 0.001): void {
    const guitarSampler = this.audioService.getSampler('guitar');
    if (!guitarSampler) throw new Error('Guitar sampler not initialized');

    const percussionSampler = this.audioService.getSampler('percussion');
    if (!percussionSampler) throw new Error('Percussion sampler not initialized');

    if (instruction.percussion) {
      const percussionNote = this.getPercussionNote(instruction.percussion.technique);
      percussionSampler.triggerAttackRelease(
        percussionNote,
        0.5,
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
    switch (technique) {
      case 'body-knock':
        return 'C3';
      case 'string-slap':
        return 'C#3';
    }
  }

  /**
   * Play notes sequentially or in reverse order
   */
  private playSequentialNotes(
    instruction: MidiInstruction, 
    startTime: number, 
    options: any
  ): void {
    const sampler = this.audioService.getSampler('guitar');
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
    const tightStrumSpacing = 0.025;

    if (noteCount <= 1 || actionDuration <= 0.14) {
      return tightStrumSpacing;
    }

    const normalStrumSpacing = 0.04;
    const maxTotalSpread = 0.22;
    return Math.max(tightStrumSpacing, Math.min(normalStrumSpacing, maxTotalSpread / (noteCount - 1)));
  }

  private playLegatoTechnique(
    instruction: MidiInstruction,
    startTime: number,
    options: { velocity: number; duration?: number }
  ): void {
    const sampler = this.audioService.getSampler('guitar');
    if (!sampler || !instruction.legato) return;
    const totalDuration = Math.max(0.12, instruction.playbackDuration);

    if (instruction.technique === 'slide') {
      this.playSlideTechnique(sampler, instruction, startTime, options, totalDuration);
      return;
    }

    const sourceNoteName = this.noteToToneName(instruction.legato.source.note);
    const targetNoteName = this.noteToToneName(instruction.legato.target.note);

    let transitionDelay = totalDuration / 2;
    let targetVelocityScale = 0.78;

    if (instruction.technique === 'pull-off') {
      targetVelocityScale = 0.72;
    }

    const sourceDuration = Math.max(0.03, transitionDelay);
    const targetDuration = Math.max(0.08, totalDuration - transitionDelay);

    sampler.triggerAttackRelease(
      sourceNoteName,
      sourceDuration,
      startTime,
      Math.max(0.2, options.velocity * 0.85)
    );

    sampler.triggerAttackRelease(
      targetNoteName,
      targetDuration,
      startTime + transitionDelay,
      Math.max(0.2, options.velocity * targetVelocityScale)
    );
  }

  private playSlideTechnique(
    sampler: { triggerAttackRelease: (note: string, duration: number, time: number, velocity: number) => void },
    instruction: MidiInstruction,
    startTime: number,
    options: { velocity: number; duration?: number },
    totalDuration: number
  ): void {
    if (!instruction.legato) return;

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
    for (let step = 0; step <= distance; step++) {
      notes.push(transpose(instruction.legato.source.note, step * direction));
    }

    const transitionWindow = Math.min(0.22, Math.max(0.09, totalDuration * 0.55));
    const stepSpacing = notes.length > 1 ? transitionWindow / (notes.length - 1) : transitionWindow;
    const perStepDuration = Math.max(0.05, Math.min(totalDuration * 0.5, stepSpacing * 1.3));

    for (let index = 0; index < notes.length; index++) {
      const noteTime = startTime + (index * stepSpacing);
      const isTarget = index === notes.length - 1;
      const noteDuration = isTarget ? Math.max(0.08, totalDuration - (index * stepSpacing)) : perStepDuration;
      const noteVelocity = isTarget ? Math.min(1, options.velocity * 0.95) : Math.max(0.18, options.velocity * 0.65);

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

    const percussionSampler = this.audioService.getSampler('percussion');
    if (!percussionSampler) throw new Error('Percussion sampler not initialized');

    const techniqueMapping: { [key: string]: string } = {
      'body_knock': 'C3', 
      'string_slap': 'C#3'
    };

    const note = techniqueMapping[technique];
    if (note) {
      percussionSampler.triggerAttackRelease(note, '8n');
      console.log(`Playing percussion technique: ${technique}`);
    } else {
      console.warn(`Unknown percussion technique: ${technique}`);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.audioService.disposeSampler('guitar');
    this.audioService.disposeSampler('percussion');
  }

  ngOnDestroy(): void {
    this.dispose();
  }
}
