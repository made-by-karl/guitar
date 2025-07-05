import { Injectable } from '@angular/core';
import * as Tone from 'tone';
import { MidiInstruction, MidiTechnique } from './midi.model';
import { Note } from 'app/common/semitones';

@Injectable({
  providedIn: 'root'
})
export class MidiService {
  private sampler: Tone.Sampler | null = null;
  private context: Tone.BaseContext | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
  }

  private async initializeAudio(): Promise<void> {
    // Skip if already initialized
    if (this.context) {
      return;
    }
    
    try {
      // Start Tone.js context (this requires user gesture)
      await Tone.start();
      this.context = Tone.getContext();
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      throw error;
    }
  }

  /**
   * Ensures audio is initialized before playing
   */
  private async ensureInitialized(): Promise<void> {
    // If already initialized, return immediately
    if (this.context && this.sampler) {
      return;
    }
    
    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    // Start initialization and store the promise
    this.initializationPromise = this.performInitialization();
    
    try {
      await this.initializationPromise;
    } finally {
      // Clear the promise once initialization is complete (success or failure)
      this.initializationPromise = null;
    }
  }

  /**
   * Performs the actual initialization work
   */
  private async performInitialization(): Promise<void> {
    // Initialize audio context first
    await this.initializeAudio();
    
    // Then create the sampler
    if (!this.sampler) {
      await this.createSampler();
    }
  }

  /**
   * Creates a Tone.js sampler with multiple samples for different techniques
   */
  private async createSampler(): Promise<void> {
    // Skip if sampler already exists
    if (this.sampler) {
      return;
    }
    
    try {
      // Create a multi-sampler for different guitar techniques
      this.sampler = new Tone.Sampler({
        urls: {
          // Normal guitar notes (using soundfont samples for now)
          "C4": "https://tonejs.github.io/audio/salamander/C4.mp3",
          "D#4": "https://tonejs.github.io/audio/salamander/Ds4.mp3",
          "F#4": "https://tonejs.github.io/audio/salamander/Fs4.mp3",
          "A4": "https://tonejs.github.io/audio/salamander/A4.mp3",
        },
        release: 1,
      }).toDestination();

      // Wait for samples to load
      await Tone.loaded();
    } catch (error) {
      console.error('Failed to create sampler:', error);
      throw error;
    }
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
      attack: 0.01,
      decay: 0.3,
      sustain: 0.8,
      release: 0.5
    };

    switch (technique) {
      case 'muted':
        return {
          ...baseOptions,
          attack: 0.001,
          decay: 0.05,
          sustain: 0.1,
          release: 0.1,
          velocity: velocity * 0.6 // Quieter
        };
      
      case 'palm-muted':
        return {
          ...baseOptions,
          attack: 0.001,
          decay: 0.1,
          sustain: 0.3,
          release: 0.2,
          velocity: velocity * 0.7
        };
      
      case 'percussive':
        return {
          ...baseOptions,
          attack: 0.001,
          decay: 0.02,
          sustain: 0.0,
          release: 0.05,
          velocity: velocity * 0.8
        };
      
      case 'accented':
        return {
          ...baseOptions,
          velocity: Math.min(1.0, velocity * 1.3),
          attack: 0.005
        };
      
      default: // normal
        return baseOptions;
    }
  }

  /**
   * Play a sequence of MIDI instructions
   */
  async playSequence(instructions: MidiInstruction[]): Promise<void> {
    await this.ensureInitialized();
    
    if (!this.sampler) {
      throw new Error('Sampler not initialized');
    }

    const transport = Tone.getTransport();
    const startTime = transport.now();

    // Schedule all instructions
    for (const instruction of instructions) {
      const scheduleTime = startTime + instruction.time;
      const options = this.getPlaybackOptions(instruction.technique, instruction.velocity);
      
      // Determine how to play the notes (default to parallel)
      const playMode = instruction.playNotes || 'parallel';
      
      // Check if this is a sequential/reversed instruction (multiple notes with timing)
      if (instruction.notes.length > 1 && playMode !== 'parallel') {
        await this.playSequentialNotes(instruction, scheduleTime, options);
      } else {
        // Play all notes simultaneously (parallel or single notes)
        for (const note of instruction.notes) {
          const noteName = this.noteToToneName(note.note);
          
          this.sampler.triggerAttackRelease(
            noteName,
            instruction.duration,
            scheduleTime,
            options.velocity
          );
        }
      }
    }

    // Calculate total duration and wait
    const totalDuration = Math.max(...instructions.map(i => i.time + i.duration));
    await new Promise(resolve => setTimeout(resolve, (totalDuration + 0.5) * 1000));
  }

  /**
   * Play notes sequentially or in reverse order
   */
  private async playSequentialNotes(
    instruction: MidiInstruction, 
    startTime: number, 
    options: any
  ): Promise<void> {
    if (!this.sampler) return;

    const notes = instruction.notes;
    if (notes.length === 0) return;

    // Time between each note (in seconds)
    const noteSpacing = 0.02; // 20ms between notes - adjust for feel
    const playMode = instruction.playNotes || 'parallel';
    
    let sortedNotes = [...notes];
    
    if (playMode === 'sequential') {
      // Sequential: play notes in order by pitch (low to high)
      sortedNotes = sortedNotes.sort((a, b) => {
        const aPitch = this.noteToMidiNumber(a.note);
        const bPitch = this.noteToMidiNumber(b.note);
        return aPitch - bPitch;
      });
    } else if (playMode === 'reversed') {
      // Reversed: play notes in reverse order by pitch (high to low)
      sortedNotes = sortedNotes.sort((a, b) => {
        const aPitch = this.noteToMidiNumber(a.note);
        const bPitch = this.noteToMidiNumber(b.note);
        return bPitch - aPitch;
      });
    }

    // Play each note with slight timing offset
    for (let i = 0; i < sortedNotes.length; i++) {
      const note = sortedNotes[i];
      const noteTime = startTime + (i * noteSpacing);
      const noteName = this.noteToToneName(note.note);
      
      this.sampler.triggerAttackRelease(
        noteName,
        instruction.duration,
        noteTime,
        options.velocity
      );
    }
  }

  /**
   * Convert Note to MIDI number for sorting purposes
   */
  private noteToMidiNumber(note: Note): number {
    const noteMap: { [key: string]: number } = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
      'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
    };
    
    return (note.octave + 1) * 12 + noteMap[note.semitone];
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.sampler) {
      this.sampler.dispose();
      this.sampler = null;
    }
    
    // Reset initialization state
    this.context = null;
    this.initializationPromise = null;
  }
}
