
import { Note } from 'app/common/semitones';

export interface MidiInstruction {
  time: number;           // When to play (in seconds from start)
  duration: number;       // How long to hold (in seconds)
  notes: MidiNote[];      // Notes to play
  velocity: number;       // Volume/intensity (0-1)
  technique: MidiTechnique;
  playNotes: 'parallel' | 'sequential' | 'reversed'; // How to play multiple notes (default: parallel)
}

export interface MidiNote {
  note: Note;            // The musical note (semitone + octave)
}

export type MidiTechnique = 
  | 'normal'        // Clean guitar notes
  | 'muted'         // Muted strings (chick sound)
  | 'palm-muted'    // Palm muted (damped)
  | 'percussive'    // Body hits, taps
  | 'accented';     // Emphasized notes

export interface SampleSet {
  normal: string;       // URL or key for normal guitar samples
  muted: string;        // URL or key for muted string samples
  palmMuted: string;    // URL or key for palm muted samples
  percussive: string;   // URL or key for percussive samples
}
