import { Injectable } from '@angular/core';
import { PlaybackPlan } from '@/app/core/services/playback.service';
import { MidiInstruction, MidiNote, MidiTechnique, MidiLegato } from '@/app/core/services/midi.model';
import { resolveSlideTargets } from '@/app/features/patterns/services/playing-pattern-notation-resolver';
import { Note, transpose } from '@/app/core/music/semitones';
import { parseGrip, Grip } from '@/app/features/grips/services/grips/grip.model';
import {
  BaseRelativePickingNote,
  ExplicitLegatoNote,
  GripRelativePickingNote,
  Measure,
  PlayingAction,
  PlayingPatternActionGrip,
  RelativeLegatoEndpointNote,
  RelativeLegatoNote,
  RelativeStrumRange,
  StrumRange,
  RelativeString,
  getLegatoMode,
  getStringsForStrum,
  isRelativeStrumRange,
  isBaseRelativeLegatoEndpoint,
  isRelativePickingNote,
  isBaseRelativePickingNote
} from '@/app/features/patterns/services/playing-patterns.model';

interface FlatPlaybackEvent {
  time: number;
  action: PlayingAction;
  grip?: Grip;
}

interface SoundingStringState {
  fret: number;
  note: MidiNote;
}

export interface PlayingPatternPlaybackMeasure {
  measure: Measure;
  actionGrips?: PlayingPatternActionGrip[];
}

export interface PlayingPatternPlaybackPlan extends PlaybackPlan {
  diagnostics: string[];
}

@Injectable({ providedIn: 'root' })
export class PlayingPatternPlaybackPlannerService {
  /** Pure planning: callers report diagnostics when playback is requested. */
  buildPlaybackPlan(
    measures: PlayingPatternPlaybackMeasure[],
    tuning: Note[],
    tempo: number,
    initialGrip?: Grip,
    precedingMeasures: PlayingPatternPlaybackMeasure[] = []
  ): PlayingPatternPlaybackPlan {
    const gripMap = this.createGripMap([...precedingMeasures, ...measures]);
    const flatEvents: FlatPlaybackEvent[] = [];
    const segmentStartTimes: number[] = [];
    const quarterNoteDuration = 60 / tempo;
    const actionDuration = quarterNoteDuration / 4;

    let currentTime = 0;
    let currentGrip = initialGrip;
    const initialStringState = new Map<number, SoundingStringState>();

    // Earlier actions establish grip and sounding frets, but are never scheduled
    // or reported as diagnostics for this preview.
    for (const measureConfig of precedingMeasures) {
      for (let actionIndex = 0; actionIndex < measureConfig.measure.actions.length; actionIndex++) {
        currentGrip = this.resolveGripForAction(measureConfig, actionIndex, gripMap, currentGrip);
        const action = measureConfig.measure.actions[actionIndex];
        if (action) this.buildEventInstructionData(action, currentGrip, tuning, initialStringState, []);
      }
    }

    for (const measureConfig of measures) {
      segmentStartTimes.push(currentTime);

      for (let actionIndex = 0; actionIndex < measureConfig.measure.actions.length; actionIndex++) {
        currentGrip = this.resolveGripForAction(measureConfig, actionIndex, gripMap, currentGrip);
        const action = measureConfig.measure.actions[actionIndex];
        if (!action) {
          continue;
        }
        flatEvents.push({
          time: currentTime + (actionIndex * actionDuration),
          action,
          grip: currentGrip
        });
      }

      currentTime += measureConfig.measure.actions.length * actionDuration;
    }

    const diagnostics: string[] = [];
    const instructions = this.buildInstructionsFromFlatEvents(flatEvents, tuning, actionDuration, diagnostics, initialStringState);

    return {
      instructions,
      diagnostics,
      segmentStartTimes,
      totalDuration: this.resolveTotalDuration(currentTime, instructions),
      totalSegments: measures.length
    };
  }

  private createGripMap(measures: PlayingPatternPlaybackMeasure[]): Map<string, Grip> {
    const gripMap = new Map<string, Grip>();

    for (const measure of measures) {
      for (const grip of measure.actionGrips ?? []) {
        if (!gripMap.has(grip.gripId)) {
          gripMap.set(grip.gripId, parseGrip(grip.gripId));
        }
      }
    }

    return gripMap;
  }

  private resolveGripForAction(
    measureConfig: PlayingPatternPlaybackMeasure,
    actionIndex: number,
    gripMap: Map<string, Grip>,
    currentGrip?: Grip
  ): Grip | undefined {
    const actionGrip = measureConfig.actionGrips?.find(grip => grip.actionIndex === actionIndex);
    if (actionGrip) {
      return gripMap.get(actionGrip.gripId) ?? currentGrip;
    }

    return currentGrip;
  }

  private buildInstructionsFromFlatEvents(
    flatEvents: FlatPlaybackEvent[],
    tuning: Note[],
    actionDuration: number,
    diagnostics: string[],
    initialStringState: Map<number, SoundingStringState>
  ): MidiInstruction[] {
    const eventDataByIndex = this.resolveEventInstructionData(flatEvents, tuning, diagnostics, initialStringState);
    const instructions: MidiInstruction[] = [];
    const nextStringPlayTime = new Map<number, number>();
    let nextStringSlapTime: number | null = null;
    const maxDuration = 2.0;

    for (let index = flatEvents.length - 1; index >= 0; index--) {
      const event = flatEvents[index];
      const eventData = eventDataByIndex[index];

      if (!eventData) {
        continue;
      }

      if (eventData.percussionTechnique) {
        instructions.push({
          time: event.time,
          playbackDuration: 0.5,
          actionDuration,
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

      let duration = this.resolveBaseDuration(eventData.technique, actionDuration, maxDuration);
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
        playbackDuration: duration,
        actionDuration,
        notes: eventData.notes,
        legato: eventData.legato,
        legatos: eventData.legatos,
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

  private resolveEventInstructionData(
    flatEvents: FlatPlaybackEvent[],
    tuning: Note[],
    diagnostics: string[],
    initialStringState: Map<number, SoundingStringState>
  ): Array<ReturnType<PlayingPatternPlaybackPlannerService['buildEventInstructionData']>> {
    const stringState = new Map(initialStringState);

    return flatEvents.map(event => this.buildEventInstructionData(event.action, event.grip, tuning, stringState, diagnostics));
  }

  private resolveTotalDuration(measureDuration: number, instructions: MidiInstruction[]): number {
    const instructionTail = instructions.reduce((maxTail, instruction) => {
      return Math.max(maxTail, instruction.time + instruction.playbackDuration);
    }, 0);

    return Math.max(measureDuration, instructionTail);
  }

  private resolveBaseDuration(
    technique: MidiTechnique,
    actionDuration: number,
    maxDuration: number
  ): number {
    if (technique !== 'hammer-on' && technique !== 'pull-off') {
      return maxDuration;
    }

    return actionDuration * 2;
  }

  private buildEventInstructionData(
    action: PlayingAction,
    grip: Grip | undefined,
    tuning: Note[],
    stringState: Map<number, SoundingStringState>,
    diagnostics: string[]
  ): {
    notes: MidiNote[];
    affectedStrings: number[];
    technique: MidiTechnique;
    velocity: number;
    playNotes: 'parallel' | 'sequential' | 'reversed';
    legatos?: MidiLegato[];
    legato?: {
      source?: MidiNote;
      target: MidiNote;
      string: number;
    };
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
      if (technique === 'normal') technique = 'accented';
      velocity = 0.9;
    }

    if (action.technique === 'hammer-on' || action.technique === 'pull-off' || action.technique === 'slide') {
      technique = action.technique;
      velocity = 0.75;
    }

    if (action.technique === 'percussive' && action.percussive) {
      if (action.percussive.technique === 'string-slap') {
        stringState.clear();
      }

      return {
        notes: [],
        affectedStrings: [],
        technique: 'percussive',
        velocity,
        playNotes: 'parallel',
        percussionTechnique: action.percussive.technique
      };
    }

    const notes: MidiNote[] = [];
    const affectedStrings: number[] = [];
    let playNotes: 'parallel' | 'sequential' | 'reversed' = 'parallel';
    let legatos: MidiLegato[] | undefined;
    let legato: {
      source?: MidiNote;
      target: MidiNote;
      string: number;
    } | undefined;

    if (action.technique === 'strum' && action.strum) {
      if (!grip) {
        return undefined;
      }

      const strings = this.resolveStrumStrings(grip, action.strum.strings);
      affectedStrings.push(...strings);
      playNotes = action.strum.direction === 'D' ? 'sequential' : 'reversed';

      for (const stringIndex of strings) {
        const entry = grip.strings[stringIndex];
        if (entry === 'x') {
          stringState.delete(stringIndex);
          continue;
        }
        let fret = 0;
        let note: MidiNote;
        if (entry === 'o') {
          note = { note: tuning[stringIndex] };
        } else {
          fret = Math.max(...entry.map(value => value.fret));
          note = { note: this.getStringNote(tuning, stringIndex, fret) };
        }

        notes.push(note);
        stringState.set(stringIndex, { fret, note });
      }
    } else if (action.technique === 'pick' && action.pick) {
      for (const pickNote of action.pick) {
        const stringIndex = isRelativePickingNote(pickNote)
          ? this.resolveRelativeStringIndex(grip, pickNote.string)
          : pickNote.string;

        affectedStrings.push(stringIndex);

        const fret = isRelativePickingNote(pickNote)
          ? this.resolveRelativePickFret(grip, stringIndex, pickNote)
          : pickNote.fret;

        if (fret < 0) {
          stringState.delete(stringIndex);
          continue;
        }

        const note = {
          note: this.getStringNote(tuning, stringIndex, fret)
        };

        notes.push(note);
        stringState.set(stringIndex, { fret, note });
      }
    } else if (action.technique === 'slide' && action.slide) {
      const targets = resolveSlideTargets(action.slide, stringState);
      if (targets.length === 0) return undefined;
      legatos = targets.map(target => {
        const source = stringState.get(target.string)!;
        const note = { note: this.getStringNote(tuning, target.string, target.toFret) };
        notes.push(note);
        affectedStrings.push(target.string);
        stringState.set(target.string, { fret: target.toFret, note });
        return { string: target.string, source: source.note, target: note };
      });
    } else if ((action.technique === 'hammer-on' || action.technique === 'pull-off' || action.technique === 'slide') && action.legato) {
      const legatoMode = getLegatoMode(action);
      const resolvedLegato = legatoMode === 'relative'
        ? this.resolveRelativeLegato(grip, action.legato as RelativeLegatoNote)
        : action.legato as ExplicitLegatoNote;

      const target = {
        note: this.getStringNote(tuning, resolvedLegato.string, resolvedLegato.toFret)
      };
      const sourceState = stringState.get(resolvedLegato.string);

      if (!sourceState && action.technique !== 'hammer-on') {
        diagnostics.push(`${action.technique} skipped: no previous note is sounding on string ${resolvedLegato.string + 1}`);
        return undefined;
      }

      if (sourceState) {
        this.collectLegatoDiagnostics(action, resolvedLegato.string, sourceState.fret, resolvedLegato.toFret, diagnostics);
      }

      affectedStrings.push(resolvedLegato.string);
      notes.push(target);
      legato = {
        source: sourceState?.note,
        target,
        string: resolvedLegato.string
      };
      stringState.set(resolvedLegato.string, {
        fret: resolvedLegato.toFret,
        note: target
      });
    }

    return {
      notes,
      affectedStrings,
      technique,
      velocity,
      playNotes,
      legato,
      legatos
    };
  }

  private getStringNote(tuning: Note[], stringIndex: number, fret: number): Note {
    return transpose(tuning[stringIndex], Math.max(0, fret));
  }

  private resolveRelativeLegato(
    grip: Grip | undefined,
    legato: RelativeLegatoNote
  ): ExplicitLegatoNote {
    const stringIndex = this.resolveRelativeStringIndex(grip, legato.string);
    const toFret = this.resolveRelativeLegatoEndpointFret(grip, stringIndex, legato.target);

    return {
      string: stringIndex,
      toFret
    };
  }

  private collectLegatoDiagnostics(
    action: PlayingAction,
    stringIndex: number,
    sourceFret: number,
    targetFret: number,
    diagnostics: string[]
  ): void {
    if (action.technique === 'hammer-on' && targetFret <= sourceFret) {
      diagnostics.push(`hammer-on warning: target fret ${targetFret} is not higher than source fret ${sourceFret} on string ${stringIndex + 1}`);
    }

    if (action.technique === 'pull-off' && targetFret >= sourceFret) {
      diagnostics.push(`pull-off warning: target fret ${targetFret} is not lower than source fret ${sourceFret} on string ${stringIndex + 1}`);
    }

    if (action.technique === 'slide' && targetFret === sourceFret) {
      diagnostics.push(`slide warning: source and target are both fret ${targetFret} on string ${stringIndex + 1}`);
    }
  }

  private resolveRelativeLegatoEndpointFret(
    grip: Grip | undefined,
    stringIndex: number,
    endpoint: RelativeLegatoEndpointNote
  ): number {
    if (isBaseRelativeLegatoEndpoint(endpoint)) {
      return this.resolveBaseNoteFret(grip, stringIndex);
    }

    return this.resolveGripNoteFret(grip, stringIndex) + endpoint.fretOffset;
  }

  private resolveRelativePickFret(
    grip: Grip | undefined,
    stringIndex: number,
    note: GripRelativePickingNote | BaseRelativePickingNote
  ): number {
    if (isBaseRelativePickingNote(note)) {
      return this.resolveBaseNoteFret(grip, stringIndex);
    }

    return this.resolveGripNoteFret(grip, stringIndex) + note.fretOffset;
  }

  private resolveStrumStrings(grip: Grip, strings: StrumRange): number[] {
    if (isRelativeStrumRange(strings)) {
      return this.resolveRelativeStrumRange(grip, strings);
    }

    return getStringsForStrum(strings);
  }

  private resolveRelativeStrumRange(grip: Grip, range: RelativeStrumRange): number[] {
    const from = this.resolveRelativeStringIndex(grip, range.from);
    const to = this.resolveRelativeStringIndex(grip, range.to);
    const start = Math.min(from, to);
    const end = Math.max(from, to);

    return this.getPlayableStringIndices(grip).filter(index => index >= start && index <= end);
  }

  private resolveRelativeStringIndex(grip: Grip | undefined, relativeString: RelativeString): number {
    const playableStrings = this.getPlayableStringIndices(grip);
    if (playableStrings.length === 0) {
      return 0;
    }

    switch (relativeString) {
      case 'bass':
        return playableStrings[0];
      case 'second-from-bass':
        return playableStrings[Math.min(1, playableStrings.length - 1)];
      case 'lower-middle':
        return playableStrings[Math.floor((playableStrings.length - 1) / 2)];
      case 'upper-middle':
        return playableStrings[Math.ceil((playableStrings.length - 1) / 2)];
      case 'second-from-top':
        return playableStrings[Math.max(0, playableStrings.length - 2)];
      case 'top':
        return playableStrings[playableStrings.length - 1];
    }
  }

  private getPlayableStringIndices(grip: Grip | undefined): number[] {
    if (!grip) {
      return [0, 1, 2, 3, 4, 5];
    }

    return grip.strings
      .map((stringValue, index) => stringValue === 'x' ? -1 : index)
      .filter(index => index >= 0);
  }

  private resolveGripNoteFret(grip: Grip | undefined, stringIndex: number): number {
    if (!grip) {
      return 0;
    }

    const stringValue = grip.strings[stringIndex];
    if (!stringValue || stringValue === 'x' || stringValue === 'o') {
      return 0;
    }

    return Math.max(...stringValue.map(value => value.fret));
  }

  private resolveBaseNoteFret(grip: Grip | undefined, stringIndex: number): number {
    if (!grip) {
      return 0;
    }

    const stringValue = grip.strings[stringIndex];
    if (!stringValue || stringValue === 'x' || stringValue === 'o') {
      return 0;
    }

    const barreFrets = stringValue
      .filter(value => value.isPartOfBarre)
      .map(value => value.fret);

    return barreFrets.length > 0 ? Math.min(...barreFrets) : 0;
  }
}
