
import { Note } from '@/app/core/music/semitones';

export interface MidiInstruction {
  time: number;           // When to play (in seconds from start)
  playbackDuration: number; // How long to hold/ring out (in seconds)
  actionDuration: number; // Rhythmic source action duration (in seconds)
  notes?: MidiNote[];     // Notes to play (for guitar techniques)
  percussion?: MidiPercussion; // Percussion to play (for body/string percussion)
  legato?: MidiLegato;
  velocity: number;       // Volume/intensity (0-1)
  technique: MidiTechnique;
  playNotes?: 'parallel' | 'sequential' | 'reversed'; // How to play multiple notes (default: parallel)
}

export interface MidiNote {
  note: Note;            // The musical note (semitone + octave)
}

export interface MidiPercussion {
  technique: 'body-knock' | 'string-slap';
}

export interface MidiLegato {
  source: MidiNote;
  target: MidiNote;
  string: number;
}

export type MidiTechnique = 
  | 'normal'        // Clean guitar notes
  | 'muted'         // Muted strings (chick sound)
  | 'palm-muted'    // Palm muted (damped)
  | 'percussive'    // Body hits, taps
  | 'accented'      // Emphasized notes
  | 'hammer-on'     // Ascending legato note
  | 'pull-off'      // Descending legato note
  | 'slide';        // Sliding transition between frets
