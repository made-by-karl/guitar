import { Injectable } from '@angular/core';
import { MidiService } from './midi.service';
import { RhythmPattern, BeatTiming, getStringsForStrum } from './rhythm-patterns.model';
import { MidiInstruction, MidiNote, MidiTechnique } from './midi.model';
import { Note, transpose, noteNameToNote, note } from 'app/common/semitones';
import { Grip } from './grips/grip.model';

@Injectable({
  providedIn: 'root'
})
export class PlaybackService {
  
  constructor(private midiService: MidiService) {}

  /**
   * Play a rhythm pattern with tuning and a grip
   * @param pattern The rhythm pattern to play
   * @param tuning The tuning to use, defaults to standard EADGBE
   * @param grip The grip to use, defaults to E major
   * @param tempo The tempo, default is 80bpm
   */
  async playRhythmPattern(
    pattern: RhythmPattern,
    tuning?: Note[],
    grip?: Grip,
    tempo?: number): Promise<void> {
    
    tuning = tuning ?? [note('E', 2), note('A', 2), note('D', 3), note('G', 3), note('B', 3), note('E', 4)]; 
    grip = grip ?? { strings: ['o', [{ fret: 2 }], [{ fret: 2 }], [{ fret: 1 }], 'o', 'o'] }; //E major
    tempo = tempo ?? 80;
    const instructions = this.generateFromRhythmPattern(pattern, grip, tuning, tempo);
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
  private generateFromRhythmPattern(pattern: RhythmPattern, grip: Grip, tuning: Note[], tempo: number): MidiInstruction[] {
    const instructions: MidiInstruction[] = [];
    const stepDuration = 60 / tempo; // Duration of quarter note in seconds

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
              note: tuning[stringIndex]
            });
          } else {
            const fret = Math.max(...entry.map((s: any) => s.fret));
            const note = this.getStringNote(tuning, stringIndex, fret);
            notes.push({
              note: note
            });
          }
        }
      } else if (step.technique === 'pick' && step.pick) {
        // Generate notes for picking
        for (const pickNote of step.pick) {
          const note = this.getStringNote(tuning, pickNote.string, pickNote.fret);
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
