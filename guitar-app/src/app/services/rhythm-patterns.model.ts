import { Note } from "app/common/semitones";

export type RhythmTechnique = 'strum' | 'pick' | 'rest' | 'percussive';
export type RhythmDirection = 'D' | 'U' | null;
export type BeatTiming = 'on-beat' | 'quarter-past' | 'half-past' | 'three-quarter-past'; // Timing within a beat

// Style modifiers that can be applied to strum and pick techniques
export type RhythmModifier = 'mute' | 'palm-mute' | 'accent';

export interface PickingNote {
  string: number; // 0-5 (low E to high E)
  fret: number;   // 0 = open, -1 = muted
}

// Helper interface for timing calculations
export interface BeatPosition {
  beat: number;           // 1, 2, 3, 4 (for 4/4 time)
  timing: BeatTiming;     // Position within the beat
}

// Helper function type for calculating step timing
export interface StepTiming {
  startTime: number;      // Time in beats (e.g., 1.0, 1.25, 1.5, 1.75)
  duration: number;       // Duration in beats
  endTime: number;        // startTime + duration
}

export type StrumRange = 
  | 'all'           // All 6 strings
  | 'bass'          // Strings 0-2 (low E, A, D)
  | 'treble'        // Strings 3-5 (G, B, high E)
  | 'middle'        // Strings 1-4 (A, D, G, B)
  | 'power'         // Strings 0-3 (low E, A, D, G)
  | number[];       // Specific string indices

export interface StrumPattern {
  strings: StrumRange;
}

export interface RhythmStep {
  technique: RhythmTechnique;
  direction?: RhythmDirection;
  
  // Timing information (required for precise rhythm definition)
  beat: number;                    // Which beat this step occurs on (1, 2, 3, 4 for 4/4 time)
  timing: BeatTiming;              // Position within the beat: 'on-beat', 'quarter-past', 'half-past', 'three-quarter-past'
  duration?: number;               // Duration in beats (default: until next step or end of measure)
  
  // Style modifiers that can be applied to strum and pick techniques
  modifiers?: RhythmModifier[];
  
  // For strumming patterns
  strum?: StrumPattern;
  
  // For picking patterns
  pick?: PickingNote[]; // array of notes to pick
}

export interface RhythmPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  timeSignature: string;
  tempo: number;
  tuning: Note[];
  steps: RhythmStep[];
  createdAt: number;
  updatedAt: number;
  isCustom?: boolean;
}

/**
 * Helper to get string indices for strumming patterns
 */
export function getStringsForStrum(strings: any): number[] {
  if (typeof strings === 'string') {
    switch (strings) {
      case 'all': return [0, 1, 2, 3, 4, 5];
      case 'bass': return [0, 1, 2];
      case 'treble': return [3, 4, 5];
      case 'middle': return [1, 2, 3, 4];
      case 'power': return [0, 1, 2, 3];
      default: return [0, 1, 2, 3, 4, 5];
    }
  } else if (Array.isArray(strings)) {
    return strings;
  }
  return [0, 1, 2, 3, 4, 5];
}

// Utility functions for rhythm timing calculations
export class RhythmTimingUtils {

  /**
   * Convert beat and timing to decimal beat position
   * @param beat The beat number (1, 2, 3, 4)
   * @param timing Position within the beat
   * @returns Decimal beat position (e.g., 1.0, 1.25, 1.5, 1.75)
   */
  static beatToDecimal(beat: number, timing: BeatTiming = 'on-beat'): number {
    let decimal = beat;
    switch (timing) {
      case 'on-beat': decimal += 0.0; break;        // Exactly on the beat
      case 'quarter-past': decimal += 0.25; break;  // 16th note after beat
      case 'half-past': decimal += 0.5; break;      // 8th note after beat (& of beat)
      case 'three-quarter-past': decimal += 0.75; break; // 16th note before next beat
    }
    return decimal;
  }

  /**
   * Calculate timing information for all steps in a pattern
   * @param steps Array of rhythm steps
   * @param beatsPerMeasure Number of beats per measure (e.g., 4 for 4/4 time)
   * @returns Array of step timing information
   */
  static calculateStepTimings(steps: RhythmStep[], beatsPerMeasure: number = 4): StepTiming[] {
    const timings: StepTiming[] = [];
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const startTime = this.beatToDecimal(step.beat, step.timing);
      
      // Calculate duration: either explicit duration or until next step/end of measure
      let duration: number;
      if (step.duration !== undefined) {
        duration = step.duration;
      } else {
        // Calculate until next step or end of measure
        const nextStep = steps[i + 1];
        if (nextStep) {
          const nextStartTime = this.beatToDecimal(nextStep.beat, nextStep.timing);
          duration = nextStartTime - startTime;
        } else {
          // Last step: duration until end of measure
          duration = beatsPerMeasure + 1 - startTime;
        }
      }
      
      timings.push({
        startTime,
        duration,
        endTime: startTime + duration
      });
    }
    
    return timings;
  }

  /**
   * Get beats per measure from time signature string
   * @param timeSignature Time signature string (e.g., '4/4', '3/4', '6/8')
   * @returns Number of beats per measure
   */
  static getBeatsPerMeasure(timeSignature: string): number {
    const [numerator] = timeSignature.split('/').map(Number);
    return numerator;
  }

  /**
   * Get human-readable description of timing
   * @param timing BeatTiming value
   * @returns Human-readable description
   */
  static getTimingDescription(timing: BeatTiming): string {
    switch (timing) {
      case 'on-beat': return 'On Beat';
      case 'quarter-past': return '1/4 Past';
      case 'half-past': return '1/2 Past (&)';
      case 'three-quarter-past': return '3/4 Past';
    }
  }
}
