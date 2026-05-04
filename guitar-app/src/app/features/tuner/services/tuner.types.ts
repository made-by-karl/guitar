import { Note } from '@/app/core/music/semitones';
import { DetectedPitchCandidate } from '@/app/features/tuner/services/tuner-detector';

export type PitchTrackingState = 'idle' | 'signal' | 'acquiring' | 'locked' | 'decaying';
export type TunerSessionStatus = 'idle' | 'running' | 'stopped' | 'interrupted';

export interface TunerState {
  supported: boolean;
  permission: 'idle' | 'prompt' | 'granted' | 'denied';
  running: boolean;
  sessionStatus: TunerSessionStatus;
  frequencyHz: number | null;
  rawFrequencyHz: number | null;
  displayFrequencyHz: number | null;
  midiFloat: number | null;
  displayMidiFloat: number | null;
  nearestNote: Note | null;
  centsOff: number | null;
  semitoneOffset: number | null;
  confidence: number;
  pitchProbability: number;
  inputLevel: number;
  displayInputLevel: number;
  noiseFloor: number;
  signalPresent: boolean;
  pitchLocked: boolean;
  lockStrength: number;
  pitchCandidates: DetectedPitchCandidate[];
  trackingState: PitchTrackingState;
  inTune: boolean;
  interruptionMessage: string | null;
  errorMessage: string | null;
}
