import { Injectable } from '@angular/core';
import { MidiService } from '@/app/core/services/midi.service';
import { RhythmPattern, getStringsForStrum } from '@/app/features/patterns/services/rhythm-patterns.model';
import { MidiInstruction, MidiNote, MidiTechnique } from '@/app/core/services/midi.model';
import { Note, transpose, noteNameToNote, note } from '@/app/core/music/semitones';
import { Grip } from '@/app/features/grips/services/grips/grip.model';

@Injectable({
  providedIn: 'root'
})
export class PlaybackService {

  constructor(private midiService: MidiService) { }

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
   * Processes actions from end to start to calculate proper note durations
   */
  private generateFromRhythmPattern(pattern: RhythmPattern, grip: Grip, tuning: Note[], tempo: number): MidiInstruction[] {
    const instructions: MidiInstruction[] = [];
    const quarterNoteDuration = 60 / tempo; // Duration of quarter note in seconds
    const sixteenthNoteDuration = quarterNoteDuration / 4; // Duration of 16th note
    const maxDuration = 2.0; // Cap duration at 2 seconds (sample length is 3s)

    // Track when each string will be played next (to determine current action's duration)
    // Map of string index to the next time it will be played
    const nextStringPlayTime: Map<number, number> = new Map();
    
    // Track the next string-slap time (which stops ALL strings)
    let nextStringSlapTime: number | null = null;

    let measureStartTime = 0; // Track absolute time across measures

    // Process all measures from end to start to handle cross-measure durations
    for (let measureIndex = pattern.measures.length - 1; measureIndex >= 0; measureIndex--) {
      const measure = pattern.measures[measureIndex];
      
      // Calculate this measure's start time by summing all following measures
      measureStartTime = 0;
      for (let i = 0; i < measureIndex; i++) {
        measureStartTime += pattern.measures[i].actions.length * sixteenthNoteDuration;
      }

      // Process actions from end to start within this measure
      for (let i = measure.actions.length - 1; i >= 0; i--) {
        const action = measure.actions[i];
        if (!action) continue;

        const actionStartTime = measureStartTime + (i * sixteenthNoteDuration);

        // Determine technique and velocity
        let technique: MidiTechnique = 'normal';
        let velocity = 0.7;

        if (action.modifiers?.includes('mute')) {
          technique = 'muted';
        } else if (action.modifiers?.includes('palm-mute')) {
          technique = 'palm-muted';
        } else if (action.technique === 'percussive') {
          technique = 'percussive';
        }

        if (action.modifiers?.includes('accent')) {
          technique = 'accented';
          velocity = 0.9;
        }

        // Generate notes based on technique
        const notes: MidiNote[] = [];
        const affectedStrings: number[] = [];

        if (action.technique === 'strum' && action.strum) {
          // Generate notes for strumming
          const strings = getStringsForStrum(action.strum.strings);
          affectedStrings.push(...strings);
          
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
        } else if (action.technique === 'pick' && action.pick) {
          // Generate notes for picking
          for (const pickNote of action.pick) {
            affectedStrings.push(pickNote.string);
            const note = this.getStringNote(tuning, pickNote.string, pickNote.fret);
            notes.push({
              note: note
            });
          }
        } else if (action.technique === 'percussive' && action.percussive) {
          // Handle percussion separately - add as percussion instruction
          const percussionTechnique = action.percussive.technique;
          
          instructions.push({
            time: actionStartTime,
            duration: 0.5, // Short duration for percussion
            percussion: {
              technique: percussionTechnique
            },
            velocity: velocity,
            technique: 'percussive'
          });
          
          // If this is a string-slap, update the next slap time for duration calculation
          if (percussionTechnique === 'string-slap') {
            nextStringSlapTime = actionStartTime;
          }
          
          // Skip the note instruction creation below
          continue;
        }

        if (notes.length > 0) {
          // Calculate duration based on when any of the affected strings will be played next
          let duration = maxDuration; // Default to max duration
          
          // Check if a string-slap is coming (which stops ALL strings)
          if (nextStringSlapTime !== null) {
            const calculatedDuration = nextStringSlapTime - actionStartTime;
            duration = Math.min(duration, calculatedDuration);
          }
          
          // Also check individual string play times
          for (const stringIndex of affectedStrings) {
            if (nextStringPlayTime.has(stringIndex)) {
              const nextPlayTime = nextStringPlayTime.get(stringIndex)!;
              const calculatedDuration = nextPlayTime - actionStartTime;
              duration = Math.min(duration, calculatedDuration);
            }
          }

          instructions.push({
            time: actionStartTime,
            duration: duration,
            notes: notes,
            velocity: velocity,
            technique: technique,
            playNotes: action.technique === 'strum' && action.strum ?
              (action.strum.direction === 'D' ? 'sequential' : 'reversed') :
              'parallel' // Default to parallel for other techniques
          });

          // Update nextStringPlayTime for all affected strings
          for (const stringIndex of affectedStrings) {
            nextStringPlayTime.set(stringIndex, actionStartTime);
          }
        }
      }
    }

    // Reverse instructions since we processed backwards
    return instructions.reverse();
  }

  /**
   * Converts string and fret to Note
   */
  private getStringNote(tuning: Note[], string: number, fret: number): Note {
    return transpose(tuning[string], fret);
  }
}
