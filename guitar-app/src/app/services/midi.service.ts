import { Injectable } from '@angular/core';
import * as Tone from 'tone';
import { MidiInstruction, MidiTechnique } from './midi.model';
import { Note } from 'app/common/semitones';

@Injectable({
  providedIn: 'root'
})
export class MidiService {
  private sampler: Tone.Sampler | null = null;
  private percussionSampler: Tone.Sampler | null = null;
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
    
    // Then create the samplers
    if (!this.sampler) {
      await this.createSampler();
    }
    if (!this.percussionSampler) {
      await this.createPercussionSampler();
    }
  }

  /**
   * Creates a Tone.js sampler with guitar string samples
   */
  private async createSampler(): Promise<void> {
    // Skip if sampler already exists
    if (this.sampler) {
      return;
    }
    
    try {
      // Create a sampler using all available guitar note samples
      // This provides comprehensive chromatic coverage across multiple octaves
      this.sampler = new Tone.Sampler({
        urls: {
          // Octave 2
          "E2": "/samples/notes/guitar_E2.mp3",
          "F2": "/samples/notes/guitar_F2.mp3",
          "F#2": "/samples/notes/guitar_Fs2.mp3",
          "G2": "/samples/notes/guitar_G2.mp3",
          "G#2": "/samples/notes/guitar_Gs2.mp3",
          "A2": "/samples/notes/guitar_A2.mp3",
          "A#2": "/samples/notes/guitar_As2.mp3",
          "B2": "/samples/notes/guitar_B2.mp3",
          
          // Octave 3
          "C3": "/samples/notes/guitar_C3.mp3",
          "C#3": "/samples/notes/guitar_Cs3.mp3",
          "D3": "/samples/notes/guitar_D3.mp3",
          "D#3": "/samples/notes/guitar_Ds3.mp3",
          "E3": "/samples/notes/guitar_E3.mp3",
          "F3": "/samples/notes/guitar_F3.mp3",
          "F#3": "/samples/notes/guitar_Fs3.mp3",
          "G3": "/samples/notes/guitar_G3.mp3",
          "G#3": "/samples/notes/guitar_Gs3.mp3",
          "A3": "/samples/notes/guitar_A3.mp3",
          "A#3": "/samples/notes/guitar_As3.mp3",
          "B3": "/samples/notes/guitar_B3.mp3",
          
          // Octave 4
          "C4": "/samples/notes/guitar_C4.mp3",
          "C#4": "/samples/notes/guitar_Cs4.mp3",
          "D4": "/samples/notes/guitar_D4.mp3",
          "D#4": "/samples/notes/guitar_Ds4.mp3",
          "E4": "/samples/notes/guitar_E4.mp3",
          "F4": "/samples/notes/guitar_F4.mp3",
          "F#4": "/samples/notes/guitar_Fs4.mp3",
          "G4": "/samples/notes/guitar_G4.mp3",
          "G#4": "/samples/notes/guitar_Gs4.mp3",
          "A4": "/samples/notes/guitar_A4.mp3",
          "A#4": "/samples/notes/guitar_As4.mp3",
          "B4": "/samples/notes/guitar_B4.mp3",
          
          // Octave 5
          "D5": "/samples/notes/guitar_D5.mp3",
          "D#5": "/samples/notes/guitar_Ds5.mp3",
          "E5": "/samples/notes/guitar_E5.mp3",
          "G5": "/samples/notes/guitar_G5.mp3",
          "G#5": "/samples/notes/guitar_Gs5.mp3"
        },
        release: 3,
        attack: 0.005,
        volume: 0 // Adjust volume as needed
      }).toDestination();

      console.log('Loading guitar note samples...');
      // Wait for all samples to load
      await Tone.loaded();
      console.log('Guitar note samples loaded successfully');
    } catch (error) {
      console.error('Failed to create guitar sampler:', error);
      throw error;
    }
  }

  /**
   * Creates a Tone.js sampler with guitar percussion samples
   */
  private async createPercussionSampler(): Promise<void> {
    // Skip if percussion sampler already exists
    if (this.percussionSampler) {
      return;
    }
    
    try {
      // Create percussion sampler for guitar techniques
      this.percussionSampler = new Tone.Sampler({
        urls: {
          // Guitar percussion techniques mapped to notes
          "C3": "/samples/percussion/guitar_body_tap.mp3",     // Body tapping
          "C#3": "/samples/percussion/guitar_body_knock.mp3",   // Body knocking
          "D3": "/samples/percussion/guitar_string_slap.mp3",   // String slapping
          "D#3": "/samples/percussion/guitar_finger_tap.mp3",   // Finger tapping
          "E3": "/samples/percussion/guitar_string_scratch.mp3", // String scratching
          "F3": "/samples/percussion/guitar_bridge_tap.mp3",    // Bridge tapping
          "G3": "/samples/percussion/guitar_accent.mp3",       // Accented hits
        },
        release: 0.5,
        attack: 0.001,
        volume: -6 // Slightly louder than guitar for percussion effect
      }).toDestination();

      console.log('Loading guitar percussion samples...');
      // Wait for percussion samples to load
      await Tone.loaded();
      console.log('Guitar percussion samples loaded successfully');
    } catch (error) {
      console.error('Failed to create percussion sampler:', error);
      // Don't throw error - percussion is optional
      console.log('Continuing without percussion samples');
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
            options.duration ?? instruction.duration,
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
      
      this.sampler.triggerAttackRelease(
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
    
    if (!this.percussionSampler) {
      console.warn('Percussion sampler not loaded');
      return;
    }

    const techniqueMapping: { [key: string]: string } = {
      'body_tap': 'C3',
      'body_knock': 'C#3', 
      'string_slap': 'D3',
      'finger_tap': 'D#3',
      'string_scratch': 'E3',
      'bridge_tap': 'F3',
      'accent': 'G3'
    };

    const note = techniqueMapping[technique];
    if (note) {
      this.percussionSampler.triggerAttackRelease(note, '8n');
      console.log(`Playing percussion technique: ${technique}`);
    } else {
      console.warn(`Unknown percussion technique: ${technique}`);
    }
  }

  /**
   * Play a chord with percussion technique
   */
  async playChordWithPercussion(notes: string[], technique: string, duration: number = 2.0): Promise<void> {
    await this.ensureInitialized();
    
    if (!this.sampler) {
      throw new Error('Guitar sampler not initialized');
    }

    // Play the chord
    const chordPromise = this.playChordFromNotes(notes, duration);
    
    // Add percussion accent if requested
    if (technique === 'accented' && this.percussionSampler) {
      setTimeout(() => {
        this.percussionSampler!.triggerAttackRelease('G3', '8n');
      }, 50); // Slight delay for accent
    }
    
    return chordPromise;
  }

  /**
   * Helper method to play chord from note names
   */
  private async playChordFromNotes(notes: string[], duration: number): Promise<void> {
    if (!this.sampler) return;
    
    const now = Tone.now();
    notes.forEach((note, index) => {
      // Strum effect - slight delay between notes
      const strumDelay = index * 0.02;
      this.sampler!.triggerAttackRelease(note, duration, now + strumDelay);
    });
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.sampler) {
      this.sampler.dispose();
      this.sampler = null;
    }
    
    if (this.percussionSampler) {
      this.percussionSampler.dispose();
      this.percussionSampler = null;
    }
    
    // Reset initialization state
    this.context = null;
    this.initializationPromise = null;
  }
}
