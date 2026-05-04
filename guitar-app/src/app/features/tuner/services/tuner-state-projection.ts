import { DetectedPitch } from '@/app/features/tuner/services/tuner-detector';
import {
  frequencyToMidiFloat,
  getCentsOffset,
  midiToFrequency,
  midiToNote
} from '@/app/features/tuner/services/tuner-note-math';
import { PitchTrackingState, TunerState } from '@/app/features/tuner/services/tuner.types';

const INITIAL_NOISE_FLOOR = 0.0012;
const DECAY_DISPLAY_SEMITONE_LIMIT = 0.35;

export const INITIAL_TUNER_STATE: TunerState = {
  supported: false,
  permission: 'idle',
  running: false,
  sessionStatus: 'idle',
  frequencyHz: null,
  rawFrequencyHz: null,
  displayFrequencyHz: null,
  midiFloat: null,
  displayMidiFloat: null,
  nearestNote: null,
  centsOff: null,
  semitoneOffset: null,
  confidence: 0,
  pitchProbability: 0,
  inputLevel: 0,
  displayInputLevel: 0,
  noiseFloor: INITIAL_NOISE_FLOOR,
  signalPresent: false,
  pitchLocked: false,
  lockStrength: 0,
  pitchCandidates: [],
  trackingState: 'idle',
  inTune: false,
  interruptionMessage: null,
  errorMessage: null
};

export interface TunerTrackingProjection {
  acceptedFrequencyHz: number | null;
  pitchLocked: boolean;
  state: PitchTrackingState;
  lockStrength: number;
}

export function buildInactiveState(previous: TunerState, noiseFloor: number): TunerState {
  return {
    ...previous,
    running: false,
    frequencyHz: null,
    rawFrequencyHz: null,
    displayFrequencyHz: null,
    midiFloat: null,
    displayMidiFloat: null,
    nearestNote: null,
    centsOff: null,
    semitoneOffset: null,
    confidence: 0,
    pitchProbability: 0,
    inputLevel: 0,
    displayInputLevel: 0,
    noiseFloor,
    signalPresent: false,
    pitchLocked: false,
    lockStrength: 0,
    pitchCandidates: [],
    trackingState: 'idle',
    inTune: false
  };
}

export function updateDisplayMidi(
  previousDisplayMidi: number | null,
  midiFloat: number | null,
  state: PitchTrackingState
): number | null {
  if (midiFloat === null) {
    return state === 'decaying' ? previousDisplayMidi : null;
  }

  if (previousDisplayMidi === null) {
    return midiFloat;
  }

  const semitoneJump = Math.abs(midiFloat - previousDisplayMidi);

  if (state === 'decaying' && semitoneJump > DECAY_DISPLAY_SEMITONE_LIMIT) {
    return previousDisplayMidi;
  }

  if (state === 'locked' && semitoneJump >= 7) {
    return midiFloat;
  }

  if (state === 'locked' && semitoneJump >= 2.5) {
    return previousDisplayMidi + (midiFloat - previousDisplayMidi) * 0.72;
  }

  const smoothingFactor = state === 'locked'
    ? 0.18
    : state === 'acquiring'
      ? 0.28
      : 0.08;
  return previousDisplayMidi + (midiFloat - previousDisplayMidi) * smoothingFactor;
}

export function projectActiveTunerState(
  previous: TunerState,
  detected: DetectedPitch,
  tracking: TunerTrackingProjection,
  input: {
    noiseFloor: number;
    displayInputLevel: number;
    signalPresent: boolean;
  }
): TunerState {
  const midiFloat = tracking.acceptedFrequencyHz === null ? null : frequencyToMidiFloat(tracking.acceptedFrequencyHz);
  const displayMidiFloat = updateDisplayMidi(previous.displayMidiFloat, midiFloat, tracking.state);
  const displayFrequencyHz = displayMidiFloat === null ? null : midiToFrequency(displayMidiFloat);
  const nearestMidi = displayMidiFloat === null ? null : Math.round(displayMidiFloat);
  const nearestNote = nearestMidi === null ? null : midiToNote(nearestMidi);
  const centsOff = tracking.pitchLocked && displayFrequencyHz !== null && nearestMidi !== null
    ? getCentsOffset(displayFrequencyHz, nearestMidi)
    : null;
  const semitoneOffset = tracking.pitchLocked && displayMidiFloat !== null && nearestMidi !== null
    ? displayMidiFloat - nearestMidi
    : null;

  return {
    ...previous,
    supported: true,
    permission: 'granted',
    running: true,
    sessionStatus: 'running',
    frequencyHz: tracking.acceptedFrequencyHz,
    rawFrequencyHz: detected.frequencyHz,
    displayFrequencyHz,
    midiFloat,
    displayMidiFloat,
    nearestNote,
    centsOff,
    semitoneOffset,
    confidence: tracking.lockStrength,
    pitchProbability: detected.probability,
    inputLevel: input.displayInputLevel,
    displayInputLevel: input.displayInputLevel,
    noiseFloor: input.noiseFloor,
    signalPresent: input.signalPresent,
    pitchLocked: tracking.pitchLocked,
    lockStrength: tracking.lockStrength,
    pitchCandidates: detected.candidates.map(candidate => ({ ...candidate })),
    trackingState: tracking.state,
    inTune: tracking.pitchLocked && centsOff !== null && Math.abs(centsOff) <= 5,
    interruptionMessage: null,
    errorMessage: null
  };
}
