import { Injectable } from '@angular/core';
import { MidiService } from './midi.service';
import { RhythmPattern, BeatTiming, getStringsForStrum } from './rhythm-patterns.model';
import { MidiInstruction, MidiNote, MidiTechnique } from './midi.model';
import { Note, transpose, noteNameToNote } from 'app/common/semitones';
import { Grip } from './grips/grip-generator.service';

@Injectable({
  providedIn: 'root'
})
export class PlaybackService {
  
  constructor(private midiService: MidiService) {}

  /**
   * Play a rhythm pattern with a given grip (Cmajor as default)
   */
  async playRhythmPattern(
    pattern: RhythmPattern,
    grip: Grip = { strings: ['o', [{ fret: 2 }], [{ fret: 2 }], [{ fret: 1 }], 'o', 'o'] } ): Promise<void> {
    
    const instructions = this.generateFromRhythmPattern(pattern, grip);
    await this.midiService.playSequence(instructions);
  }

  /**
   * Play a chord from note names (e.g., ["E4", "A4", "C5"])
   */
  async playChordFromNotes(noteNames: string[], duration: number = 2.0, velocity: number = 0.7, technique: MidiTechnique = 'normal'): Promise<void> {
    const notes: MidiNote[] = noteNames.map(noteName => {
      const note = noteNameToNote(noteName);
      return {
        note: note
      };
    });

    const instruction: MidiInstruction = {
      time: 0,
      duration: duration,
      notes: notes,
      velocity: velocity,
      technique: technique,
      playNotes: 'parallel' // Single chord played simultaneously
    };

    await this.midiService.playSequence([instruction]);
  }

  /**
   * Generate MIDI instructions from a rhythm pattern
   */
  private generateFromRhythmPattern(pattern: RhythmPattern, grip: Grip): MidiInstruction[] {
    const instructions: MidiInstruction[] = [];
    const stepDuration = 60 / pattern.tempo; // Duration of quarter note in seconds

    for (const step of pattern.steps) {
      // Calculate timing for this step
      const startTime = this.beatToDecimal(step.beat, step.timing);
      const duration = step.duration || 0.25; // Default quarter note duration
      
      const absoluteStartTime = startTime * stepDuration;
      const absoluteDuration = duration * stepDuration;

      // Determine technique based on step and modifiers
      let technique: MidiTechnique = 'normal';
      let velocity = 0.7;

      if (step.modifiers?.includes('mute')) {
        technique = 'muted';
      } else if (step.modifiers?.includes('palm-mute')) {
        technique = 'palm-muted';
      } else if (step.technique === 'percussive') {
        technique = 'percussive';
      }

      if (step.modifiers?.includes('accent')) {
        technique = 'accented';
        velocity = 0.9;
      }

      // Generate notes based on technique
      const notes: MidiNote[] = [];

      if (step.technique === 'strum' && step.strum) {
        // Generate notes for strumming
        const strings = getStringsForStrum(step.strum.strings);
        for (const stringIndex of strings) {
          const entry = grip.strings[stringIndex];
          if (entry === 'x') {
            // Muted strum, no note
            continue;
          } else if (entry === 'o') {
            notes.push({
              note: pattern.tuning[stringIndex]
            });
          } else {
            const fret = Math.max(...entry.map(s => s.fret));
            const note = this.getStringNote(pattern.tuning, stringIndex, fret);
            notes.push({
              note: note
            });
          }
        }
      } else if (step.technique === 'pick' && step.pick) {
        // Generate notes for picking
        for (const pickNote of step.pick) {
          const note = this.getStringNote(pattern.tuning, pickNote.string, pickNote.fret);
          notes.push({
            note: note
          });
        }
      } else if (step.technique === 'percussive') {
        // Add a percussive hit (use a fixed note for body percussion)
        notes.push({
          note: { semitone: 'C', octave: 4 } // Middle C for percussion
        });
      }

      if (notes.length > 0) {
        instructions.push({
          time: absoluteStartTime,
          duration: Math.min(absoluteDuration, 2.0), // Cap duration
          notes: notes,
          velocity: velocity,
          technique: technique,
          playNotes: step.technique === 'strum' ? 
            (step.direction === 'D' ? 'sequential' : 'reversed') : 
            'parallel' // Default to parallel for other techniques
        });
      }
    }

    return instructions;
  }

  /**
   * Converts string and fret to Note
   */
  private getStringNote(tuning: Note[], string: number, fret: number): Note {
    return transpose(tuning[string], fret);
  }

  /**
   * Convert beat and timing to decimal beat position
   */
  private beatToDecimal(beat: number, timing: BeatTiming): number {
    let decimal = beat;
    switch (timing) {
      case 'on-beat': decimal += 0.0; break;
      case 'quarter-past': decimal += 0.25; break;
      case 'half-past': decimal += 0.5; break;
      case 'three-quarter-past': decimal += 0.75; break;
    }
    return decimal;
  }
}
