import { Injectable } from '@angular/core';
import { PlaybackPlan } from '@/app/core/services/playback.service';
import { MidiInstruction, MidiNote, MidiTechnique } from '@/app/core/services/midi.model';
import { Note, transpose } from '@/app/core/music/semitones';
import { parseGrip, Grip } from '@/app/features/grips/services/grips/grip.model';
import {
  Measure,
  RhythmAction,
  RhythmPatternActionGripOverride,
  RhythmPatternBeatGrip,
  getBeatsFromTimeSignature,
  getStringsForStrum
} from '@/app/features/patterns/services/rhythm-patterns.model';

interface FlatPlaybackEvent {
  time: number;
  action: RhythmAction;
  grip?: Grip;
}

export interface RhythmPatternPlaybackMeasure {
  measure: Measure;
  beatGrips?: RhythmPatternBeatGrip[];
  actionGripOverrides?: RhythmPatternActionGripOverride[];
}

@Injectable({ providedIn: 'root' })
export class RhythmPatternPlaybackPlannerService {
  buildPlaybackPlan(
    measures: RhythmPatternPlaybackMeasure[],
    tuning: Note[],
    tempo: number,
    initialGrip?: Grip
  ): PlaybackPlan {
    const gripMap = this.createGripMap(measures);
    const flatEvents: FlatPlaybackEvent[] = [];
    const segmentStartTimes: number[] = [];
    const quarterNoteDuration = 60 / tempo;
    const actionDuration = quarterNoteDuration / 4;

    let currentTime = 0;
    let currentGrip = initialGrip;

    for (const measureConfig of measures) {
      segmentStartTimes.push(currentTime);

      for (let actionIndex = 0; actionIndex < measureConfig.measure.actions.length; actionIndex++) {
        const action = measureConfig.measure.actions[actionIndex];
        if (!action) {
          continue;
        }

        currentGrip = this.resolveGripForAction(measureConfig, actionIndex, gripMap, currentGrip);
        flatEvents.push({
          time: currentTime + (actionIndex * actionDuration),
          action,
          grip: currentGrip
        });
      }

      currentTime += measureConfig.measure.actions.length * actionDuration;
    }

    return {
      instructions: this.buildInstructionsFromFlatEvents(flatEvents, tuning),
      segmentStartTimes,
      totalDuration: currentTime,
      totalSegments: measures.length
    };
  }

  resolveGripBeforeMeasure(
    measures: RhythmPatternPlaybackMeasure[],
    targetMeasureIndex: number
  ): Grip | undefined {
    const gripMap = this.createGripMap(measures);
    let currentGrip: Grip | undefined;

    for (let measureIndex = 0; measureIndex < targetMeasureIndex; measureIndex++) {
      const measureConfig = measures[measureIndex];
      if (!measureConfig) {
        break;
      }

      for (let actionIndex = 0; actionIndex < measureConfig.measure.actions.length; actionIndex++) {
        currentGrip = this.resolveGripForAction(measureConfig, actionIndex, gripMap, currentGrip);
      }
    }

    return currentGrip;
  }

  private createGripMap(measures: RhythmPatternPlaybackMeasure[]): Map<string, Grip> {
    const gripMap = new Map<string, Grip>();

    for (const measure of measures) {
      for (const grip of measure.beatGrips ?? []) {
        if (!gripMap.has(grip.gripId)) {
          gripMap.set(grip.gripId, parseGrip(grip.gripId));
        }
      }

      for (const grip of measure.actionGripOverrides ?? []) {
        if (!gripMap.has(grip.gripId)) {
          gripMap.set(grip.gripId, parseGrip(grip.gripId));
        }
      }
    }

    return gripMap;
  }

  private resolveGripForAction(
    measureConfig: RhythmPatternPlaybackMeasure,
    actionIndex: number,
    gripMap: Map<string, Grip>,
    currentGrip?: Grip
  ): Grip | undefined {
    const override = measureConfig.actionGripOverrides?.find(grip => grip.actionIndex === actionIndex);
    if (override) {
      return gripMap.get(override.gripId) ?? currentGrip;
    }

    const beats = getBeatsFromTimeSignature(measureConfig.measure.timeSignature);
    const actionsPerBeat = beats > 0 ? measureConfig.measure.actions.length / beats : measureConfig.measure.actions.length;
    const beatIndex = Math.floor(actionIndex / Math.max(1, actionsPerBeat));
    const beatGrip = measureConfig.beatGrips?.find(grip => grip.beatIndex === beatIndex);

    if (beatGrip) {
      return gripMap.get(beatGrip.gripId) ?? currentGrip;
    }

    return currentGrip;
  }

  private buildInstructionsFromFlatEvents(flatEvents: FlatPlaybackEvent[], tuning: Note[]): MidiInstruction[] {
    const instructions: MidiInstruction[] = [];
    const nextStringPlayTime = new Map<number, number>();
    let nextStringSlapTime: number | null = null;
    const maxDuration = 2.0;

    for (let index = flatEvents.length - 1; index >= 0; index--) {
      const event = flatEvents[index];
      const eventData = this.buildEventInstructionData(event.action, event.grip, tuning);

      if (!eventData) {
        continue;
      }

      if (eventData.percussionTechnique) {
        instructions.push({
          time: event.time,
          duration: 0.5,
          percussion: { technique: eventData.percussionTechnique },
          velocity: eventData.velocity,
          technique: 'percussive'
        });

        if (eventData.percussionTechnique === 'string-slap') {
          nextStringSlapTime = event.time;
        }
        continue;
      }

      if (eventData.notes.length === 0) {
        continue;
      }

      let duration = maxDuration;
      if (nextStringSlapTime !== null) {
        duration = Math.min(duration, nextStringSlapTime - event.time);
      }

      for (const stringIndex of eventData.affectedStrings) {
        if (nextStringPlayTime.has(stringIndex)) {
          duration = Math.min(duration, nextStringPlayTime.get(stringIndex)! - event.time);
        }
      }

      instructions.push({
        time: event.time,
        duration,
        notes: eventData.notes,
        velocity: eventData.velocity,
        technique: eventData.technique,
        playNotes: eventData.playNotes
      });

      for (const stringIndex of eventData.affectedStrings) {
        nextStringPlayTime.set(stringIndex, event.time);
      }
    }

    return instructions.reverse();
  }

  private buildEventInstructionData(
    action: RhythmAction,
    grip: Grip | undefined,
    tuning: Note[]
  ): {
    notes: MidiNote[];
    affectedStrings: number[];
    technique: MidiTechnique;
    velocity: number;
    playNotes: 'parallel' | 'sequential' | 'reversed';
    percussionTechnique?: 'body-knock' | 'string-slap';
  } | undefined {
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

    if (action.technique === 'percussive' && action.percussive) {
      return {
        notes: [],
        affectedStrings: [],
        technique: 'percussive',
        velocity,
        playNotes: 'parallel',
        percussionTechnique: action.percussive.technique
      };
    }

    if (!grip) {
      return undefined;
    }

    const notes: MidiNote[] = [];
    const affectedStrings: number[] = [];
    let playNotes: 'parallel' | 'sequential' | 'reversed' = 'parallel';

    if (action.technique === 'strum' && action.strum) {
      const strings = getStringsForStrum(action.strum.strings);
      affectedStrings.push(...strings);
      playNotes = action.strum.direction === 'D' ? 'sequential' : 'reversed';

      for (const stringIndex of strings) {
        const entry = grip.strings[stringIndex];
        if (entry === 'x') {
          continue;
        }
        if (entry === 'o') {
          notes.push({ note: tuning[stringIndex] });
          continue;
        }

        const fret = Math.max(...entry.map(value => value.fret));
        notes.push({ note: this.getStringNote(tuning, stringIndex, fret) });
      }
    } else if (action.technique === 'pick' && action.pick) {
      for (const pickNote of action.pick) {
        affectedStrings.push(pickNote.string);
        notes.push({
          note: this.getStringNote(tuning, pickNote.string, pickNote.fret)
        });
      }
    }

    return {
      notes,
      affectedStrings,
      technique,
      velocity,
      playNotes
    };
  }

  private getStringNote(tuning: Note[], stringIndex: number, fret: number): Note {
    return transpose(tuning[stringIndex], fret);
  }
}
