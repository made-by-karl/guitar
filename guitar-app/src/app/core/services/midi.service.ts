import { Injectable, OnDestroy } from '@angular/core';
import { MidiInstruction, MidiTechnique } from '@/app/core/services/midi.model';
import { Note } from '@/app/core/music/semitones';
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
    const totalDuration = Math.max(...instructions.map(i => i.time + i.duration));
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

    if (instruction.notes.length > 1 && playMode !== 'parallel') {
      this.playSequentialNotes(instruction, scheduleTime, options);
      return;
    }

    for (const note of instruction.notes) {
      const noteName = this.noteToToneName(note.note);

      guitarSampler.triggerAttackRelease(
        noteName,
        options.duration ?? instruction.duration,
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

    // Time between each note (in seconds)
    const noteSpacing = 0.025; // 25ms between notes - adjust for feel
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
        options.duration ?? instruction.duration,
        noteTime,
        options.velocity
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
