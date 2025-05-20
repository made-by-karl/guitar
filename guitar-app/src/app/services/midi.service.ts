import { Injectable } from '@angular/core';
import Soundfont from 'soundfont-player';

@Injectable({
  providedIn: 'root'
})
export class MidiService {
  private stringNotes = [
    64, // E4 (highest string)
    59, // B3
    55, // G3
    50, // D3
    45, // A2
    40  // E2 (lowest string)
  ];

  private getMidiNote(string: number, fret: number): number {
    return this.stringNotes[string - 1] + fret;
  }

  async generateAndPlayChord(positions: string[]): Promise<void> {
    // Create new AudioContext for this chord
    const audioContext = new AudioContext();
    
    try {
      // Load the guitar instrument
      const instrument = await Soundfont.instrument(audioContext, 'acoustic_guitar_nylon');

      // Collect notes for the chord
      const midiNotes: number[] = [];
      
      // Add notes based on positions
      positions.forEach((position, index) => {
        if (position !== 'x') {  // Skip muted strings
          const fret = parseInt(position);
          const string = 6 - index;  // Convert 0-based index to 1-based string number (reversed)
          midiNotes.push(this.getMidiNote(string, fret));
        }
      });

      // Convert MIDI note numbers to note names that soundfont-player expects
      const notes = midiNotes.map(midi => {
        const noteNames = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
        const octave = Math.floor(midi / 12) - 1;
        const noteName = noteNames[midi % 12];
        return `${noteName}${octave}`;
      });

      console.log('Playing notes:', notes);

      // Play all notes simultaneously
      const playPromises = notes.map(note => 
        instrument.play(note, 0, {
          duration: 2,
          gain: 0.7,
          attack: 0.05,
          decay: 0.1,
          sustain: 0.8,
          release: 0.3
        })
      );

      // Wait for all notes to finish playing
      await Promise.all(playPromises);

      // Clean up
      await new Promise(resolve => setTimeout(resolve, 2500)); // Wait for release phase
      audioContext.close();

    } catch (error) {
      console.error('Error playing chord:', error);
      if (audioContext) {
        audioContext.close();
      }
    }
  }
}
