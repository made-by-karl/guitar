import { CommonModule } from '@angular/common';
import { Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BaseRelativeLegatoEndpoint,
  BaseRelativePickingNote,
  ExplicitLegatoNote,
  ExplicitPickingNote,
  getBeatsFromTimeSignature,
  formatActionPosition,
  getLegatoMode,
  getSixteenthPerBeatFromTimeSignature,
  GripRelativeLegatoEndpoint,
  GripRelativePickingNote,
  isRelativeStrumRange,
  LegatoMode,
  LegatoNote,
  Measure,
  PickMode,
  PickingNote,
  PlayingAction,
  PlayingModifier,
  PlayingPatternActionGrip,
  RelativeLegatoEndpointNote,
  RelativeLegatoNote,
  RelativeNoteAnchor,
  RelativeString,
  RelativeStrumRange,
  StrumRange
} from '@/app/features/patterns/services/playing-patterns.model';
import {
  parseTimeSignature,
  TIME_SIGNATURES,
  TimeSignature,
  timeSignatureLabel
} from '@/app/core/music/rhythm/time-signature.model';

export type TechniqueType = 'strum-down' | 'strum-up' | 'pick' | 'percussive' | 'hammer-on' | 'pull-off' | 'slide';
type ActionSubdivision = 'quarter' | 'eighth' | 'sixteenth';

interface ActionDisplayData {
  position: string;
  action: PlayingAction | null;
  originalIndex: number;
  isMainPosition: boolean;
  subdivision: ActionSubdivision;
}

@Component({
  selector: 'app-playing-measure-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './playing-measure-editor.component.html',
  styleUrl: './playing-measure-editor.component.scss'
})
export class PlayingMeasureEditorComponent {
  readonly maxPickNotes = 6;
  readonly measure = model.required<Measure>();
  readonly actionGrips = model<PlayingPatternActionGrip[]>([]);
  readonly measureLabel = input('Measure');
  readonly showGripControls = input(true);
  readonly assignActionGrip = output<number>();

  readonly relativeStrings: RelativeString[] = ['bass', 'second-from-bass', 'lower-middle', 'upper-middle', 'second-from-top', 'top'];
  readonly strumStringOptions = [
    { value: 'all', label: 'All' },
    { value: 'bass', label: 'Bass' },
    { value: 'treble', label: 'Treble' },
    { value: 'middle', label: 'Middle' },
    { value: 'power', label: 'Power' },
    { value: 'range', label: 'Range' }
  ] as const;

  private useSixteenthSteps = false;

  addAction(originalIndex: number, techniqueType: TechniqueType): void {
    const measure = this.measure();
    if (originalIndex < 0 || originalIndex >= measure.actions.length) return;

    let newAction: PlayingAction;

    switch (techniqueType) {
      case 'strum-down':
        newAction = {
          technique: 'strum',
          strum: { direction: 'D', strings: 'all' },
          modifiers: []
        };
        break;
      case 'strum-up':
        newAction = {
          technique: 'strum',
          strum: { direction: 'U', strings: 'all' },
          modifiers: []
        };
        break;
      case 'pick':
        newAction = {
          technique: 'pick',
          pick: [this.getDefaultPickNote('relative')],
          modifiers: []
        };
        break;
      case 'percussive':
        newAction = {
          technique: 'percussive',
          percussive: { technique: 'body-knock' }
        };
        break;
      case 'hammer-on':
      case 'pull-off':
      case 'slide':
        newAction = {
          technique: techniqueType,
          legatoMode: 'relative',
          legato: this.getDefaultLegato(techniqueType, 'relative')
        };
        break;
    }

    this.updateAction(originalIndex, () => newAction);
  }

  onActionTechniqueChange(originalIndex: number): void {
    const action = this.measure().actions[originalIndex];
    if (!action) return;

    let updatedAction: PlayingAction = { ...action };

    if (action.technique === 'strum') {
      updatedAction.strum ??= { direction: 'D', strings: 'all' };
      delete updatedAction.pick;
      delete updatedAction.legato;
      delete updatedAction.legatoMode;
      delete updatedAction.percussive;
    } else if (action.technique === 'pick') {
      updatedAction.pick ??= [this.getDefaultPickNote('relative')];
      delete updatedAction.strum;
      delete updatedAction.percussive;
      delete updatedAction.legato;
      delete updatedAction.legatoMode;
    } else if (action.technique === 'percussive') {
      updatedAction.percussive ??= { technique: 'body-knock' };
      delete updatedAction.strum;
      delete updatedAction.pick;
      delete updatedAction.legato;
      delete updatedAction.legatoMode;
    } else if (action.technique === 'hammer-on' || action.technique === 'pull-off' || action.technique === 'slide') {
      if (!updatedAction.legato) {
        updatedAction.legatoMode = 'relative';
        updatedAction.legato = this.getDefaultLegato(action.technique, 'relative');
      }
      delete updatedAction.strum;
      delete updatedAction.pick;
      delete updatedAction.percussive;
    }

    if (action.technique === 'strum' || action.technique === 'pick') {
      updatedAction.modifiers ??= [];
    } else {
      delete updatedAction.modifiers;
    }

    this.updateAction(originalIndex, () => updatedAction);
  }

  removeAction(originalIndex: number): void {
    this.updateAction(originalIndex, () => null);
  }

  addPickingNote(originalIndex: number): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'pick') return action;
      const currentPick = action.pick || [];
      if (currentPick.length >= this.maxPickNotes) return action;
      return {
        ...action,
        pick: [...currentPick, this.getDefaultPickNote('relative')]
      };
    });
  }

  removePickingNote(originalIndex: number, noteIndex: number): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'pick' || !action.pick) return action;
      const updatedPick = [...action.pick];
      updatedPick.splice(noteIndex, 1);
      return { ...action, pick: updatedPick };
    });
  }

  updatePickNoteRelativeString(originalIndex: number, noteIndex: number, string: RelativeString): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'pick' || !action.pick || !action.pick[noteIndex]) return action;
      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = { ...(updatedPick[noteIndex] as GripRelativePickingNote | BaseRelativePickingNote), string };
      return { ...action, pick: updatedPick };
    });
  }

  updatePickNoteString(originalIndex: number, noteIndex: number, stringValue: number): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'pick' || !action.pick || !action.pick[noteIndex]) return action;
      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = { ...(updatedPick[noteIndex] as ExplicitPickingNote), string: stringValue };
      return { ...action, pick: updatedPick };
    });
  }

  updatePickNoteFret(originalIndex: number, noteIndex: number, fretValue: number): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'pick' || !action.pick || !action.pick[noteIndex]) return action;
      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = { ...(updatedPick[noteIndex] as ExplicitPickingNote), fret: fretValue };
      return { ...action, pick: updatedPick };
    });
  }

  updateStrumDirection(originalIndex: number, direction: 'D' | 'U'): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'strum' || !action.strum) return action;
      return {
        ...action,
        strum: {
          ...action.strum,
          direction
        }
      };
    });
  }

  updateStrumStringsMode(originalIndex: number, value: string): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'strum' || !action.strum) return action;
      return {
        ...action,
        strum: {
          ...action.strum,
          strings: value === 'range'
            ? this.getDefaultRelativeStrumRange()
            : value as Exclude<StrumRange, number[] | RelativeStrumRange>
        }
      };
    });
  }

  updateStrumRangeFrom(originalIndex: number, from: RelativeString): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'strum' || !action.strum || !isRelativeStrumRange(action.strum.strings)) return action;
      return {
        ...action,
        strum: {
          ...action.strum,
          strings: {
            ...action.strum.strings,
            from
          }
        }
      };
    });
  }

  updateStrumRangeTo(originalIndex: number, to: RelativeString): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'strum' || !action.strum || !isRelativeStrumRange(action.strum.strings)) return action;
      return {
        ...action,
        strum: {
          ...action.strum,
          strings: {
            ...action.strum.strings,
            to
          }
        }
      };
    });
  }

  updatePercussionTechnique(originalIndex: number, technique: 'body-knock' | 'string-slap'): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'percussive') return action;
      return {
        ...action,
        percussive: { technique }
      };
    });
  }

  setPickNoteMode(originalIndex: number, noteIndex: number, pickMode: PickMode): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'pick' || !action.pick || !action.pick[noteIndex]) return action;
      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = this.getDefaultPickNote(pickMode);
      return { ...action, pick: updatedPick };
    });
  }

  updatePickNoteOffset(originalIndex: number, noteIndex: number, fretOffset: number): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'pick' || !action.pick || !action.pick[noteIndex]) return action;
      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = { ...(updatedPick[noteIndex] as GripRelativePickingNote), fretOffset };
      return { ...action, pick: updatedPick };
    });
  }

  updatePickNoteAnchor(originalIndex: number, noteIndex: number, anchor: RelativeNoteAnchor): void {
    this.updateAction(originalIndex, action => {
      if (!action || action.technique !== 'pick' || !action.pick || !action.pick[noteIndex]) return action;
      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = this.toRelativePickWithAnchor(
        updatedPick[noteIndex] as GripRelativePickingNote | BaseRelativePickingNote,
        anchor
      );
      return { ...action, pick: updatedPick };
    });
  }

  updateLegatoRelativeString(originalIndex: number, string: RelativeString): void {
    this.updateAction(originalIndex, action => {
      if (!action || !action.legato || !this.isRelativeLegato(action.legato)) return action;
      return { ...action, legato: { ...action.legato, string } };
    });
  }

  updateLegatoString(originalIndex: number, stringValue: number): void {
    this.updateAction(originalIndex, action => {
      if (!action || !action.legato || this.isRelativeLegato(action.legato)) return action;
      return { ...action, legato: { ...action.legato, string: stringValue } };
    });
  }

  updateLegatoToFret(originalIndex: number, toFret: number): void {
    this.updateLegato(originalIndex, { toFret });
  }

  setLegatoMode(originalIndex: number, legatoMode: LegatoMode): void {
    this.updateAction(originalIndex, action => {
      if (!action || (action.technique !== 'hammer-on' && action.technique !== 'pull-off' && action.technique !== 'slide')) {
        return action;
      }

      return {
        ...action,
        legatoMode,
        legato: this.getDefaultLegato(action.technique, legatoMode)
      };
    });
  }

  updateLegatoTargetFretOffset(originalIndex: number, fretOffset: number): void {
    this.updateAction(originalIndex, action => {
      if (!action || !action.legato || !this.isRelativeLegato(action.legato) || action.legato.target.anchor !== 'grip-note') return action;
      return { ...action, legato: { ...action.legato, target: { ...action.legato.target, fretOffset } } };
    });
  }

  updateLegatoTargetAnchor(originalIndex: number, anchor: RelativeNoteAnchor): void {
    const action = this.measure().actions[originalIndex];
    if (!action || !action.legato || !this.isRelativeLegato(action.legato)) return;

    const nextTarget = this.toRelativeLegatoEndpointWithAnchor(action.legato.target, anchor, this.getDefaultRelativeLegatoTargetOffset(action.technique));
    this.updateAction(originalIndex, currentAction => {
      if (!currentAction || !currentAction.legato || !this.isRelativeLegato(currentAction.legato)) return currentAction;
      return { ...currentAction, legato: { ...currentAction.legato, target: nextTarget } };
    });
  }

  changeTimeSignature(newTimeSignatureValue: unknown): void {
    const measure = this.measure();
    const oldTimeSignature = measure.timeSignature;
    const newTimeSignature = parseTimeSignature(newTimeSignatureValue, oldTimeSignature);

    if (oldTimeSignature === newTimeSignature) return;

    const newActionLength = getSixteenthPerBeatFromTimeSignature(newTimeSignature) * getBeatsFromTimeSignature(newTimeSignature);
    const oldActionLength = measure.actions.length;
    const newActions = newActionLength === oldActionLength
      ? [...measure.actions]
      : newActionLength > oldActionLength
        ? [...measure.actions, ...Array(newActionLength - oldActionLength).fill(null)]
        : measure.actions.slice(0, newActionLength);

    this.useSixteenthSteps = false;
    this.measure.set({
      timeSignature: newTimeSignature,
      actions: newActions
    });
    this.actionGrips.set(this.actionGrips().filter(grip => grip.actionIndex >= 0 && grip.actionIndex < newActions.length));
  }

  toggleModifier(originalIndex: number, modifier: PlayingModifier): void {
    this.updateAction(originalIndex, action => {
      if (!action) return action;
      const currentModifiers = action.modifiers || [];
      const updatedModifiers = currentModifiers.includes(modifier)
        ? currentModifiers.filter(current => current !== modifier)
        : [...currentModifiers, modifier];

      return {
        ...action,
        modifiers: updatedModifiers
      };
    });
  }

  hasModifier(action: PlayingAction, modifier: PlayingModifier): boolean {
    return action.modifiers?.includes(modifier) || false;
  }

  getAvailableModifiers(): { value: PlayingModifier; label: string }[] {
    return [
      { value: 'mute', label: 'Mute' },
      { value: 'palm-mute', label: 'Palm Mute' },
      { value: 'accent', label: 'Accent' }
    ];
  }

  getAvailableTimeSignatures(): { value: TimeSignature; label: string }[] {
    return TIME_SIGNATURES.map(value => ({ value, label: timeSignatureLabel(value) }));
  }

  toggleSixteenthSteps(): void {
    const measure = this.measure();
    if (this.measureRequiresSixteenthSteps(measure)) {
      return;
    }

    this.useSixteenthSteps = !this.useSixteenthSteps;
    this.measure.set({ ...measure });
  }

  canToggleSixteenthSteps(): boolean {
    return !this.measureRequiresSixteenthSteps(this.measure());
  }

  isSixteenthDisplayActive(): boolean {
    return this.measureRequiresSixteenthSteps(this.measure()) || this.useSixteenthSteps;
  }

  getActionGrip(actionIndex: number): PlayingPatternActionGrip | undefined {
    return this.actionGrips().find(grip => grip.actionIndex === actionIndex);
  }

  requestActionGrip(actionIndex: number): void {
    this.assignActionGrip.emit(actionIndex);
  }

  setActionGrip(actionIndex: number, selectedGrip: PlayingPatternActionGrip | null): void {
    const remaining = this.actionGrips().filter(grip => grip.actionIndex !== actionIndex);
    this.actionGrips.set(selectedGrip ? [
      ...remaining,
      {
        ...selectedGrip,
        measureIndex: 0,
        actionIndex
      }
    ] : remaining);
  }

  clearMeasureGrips(): void {
    this.actionGrips.set([]);
  }

  getActionsForDisplay(): ActionDisplayData[] {
    const measure = this.measure();
    const numberOfBeats = getBeatsFromTimeSignature(measure.timeSignature);
    const sixteenthPerBeat = getSixteenthPerBeatFromTimeSignature(measure.timeSignature);
    const totalSixteenths = numberOfBeats * sixteenthPerBeat;
    const displayActions: ActionDisplayData[] = [];
    const useSixteenthSteps = this.measureRequiresSixteenthSteps(measure) || this.useSixteenthSteps;

    for (let i = 0; i < totalSixteenths; i += useSixteenthSteps ? 1 : 2) {
      displayActions.push({
        position: formatActionPosition(i, measure.timeSignature),
        action: measure.actions[i] || null,
        originalIndex: i,
        isMainPosition: i % 4 === 0,
        subdivision: this.getActionSubdivision(i)
      });
    }

    return displayActions;
  }

  getActionPositionLabel(actionData: Pick<ActionDisplayData, 'position' | 'subdivision'>): string {
    return actionData.position;
  }

  getStringName(stringIndex: number): string {
    const names = ['Low E (6th)', 'A (5th)', 'D (4th)', 'G (3rd)', 'B (2nd)', 'High E (1st)'];
    return names[stringIndex] || `String ${stringIndex + 1}`;
  }

  getRelativeStringLabel(string: RelativeString): string {
    switch (string) {
      case 'bass': return 'Bass';
      case 'second-from-bass': return '2nd from Bass';
      case 'lower-middle': return 'Lower Middle';
      case 'upper-middle': return 'Upper Middle';
      case 'second-from-top': return '2nd from Top';
      case 'top': return 'Top Note';
    }
  }

  getStrumStringsMode(action: PlayingAction): string {
    if (action.technique !== 'strum' || !action.strum) {
      return 'all';
    }

    if (isRelativeStrumRange(action.strum.strings)) {
      return 'range';
    }

    return typeof action.strum.strings === 'string' ? action.strum.strings : 'all';
  }

  isRelativeStrumStrings(action: PlayingAction): boolean {
    return action.technique === 'strum' && !!action.strum && isRelativeStrumRange(action.strum.strings);
  }

  getStrumRangeFrom(action: PlayingAction): RelativeString {
    if (!this.isRelativeStrumStrings(action)) {
      return 'bass';
    }

    const strings = action.strum!.strings as RelativeStrumRange;
    return strings.from;
  }

  getStrumRangeTo(action: PlayingAction): RelativeString {
    if (!this.isRelativeStrumStrings(action)) {
      return 'top';
    }

    const strings = action.strum!.strings as RelativeStrumRange;
    return strings.to;
  }

  getLegatoModeForAction(action: PlayingAction): LegatoMode {
    return getLegatoMode(action);
  }

  isRelativePickNote(note: PickingNote): note is GripRelativePickingNote | BaseRelativePickingNote {
    return note.mode === 'relative';
  }

  getPickNoteMode(note: PickingNote): PickMode {
    return note.mode;
  }

  isRelativeLegato(legato: LegatoNote): legato is RelativeLegatoNote {
    return typeof legato.string === 'string' && 'target' in legato;
  }

  getPickAnchor(note: PickingNote): RelativeNoteAnchor {
    return this.isRelativePickNote(note) ? note.anchor : 'grip-note';
  }

  getPickRelativeString(note: PickingNote): RelativeString {
    return this.isRelativePickNote(note) ? note.string : 'bass';
  }

  getLegatoRelativeString(legato: LegatoNote): RelativeString {
    return this.isRelativeLegato(legato) ? legato.string : 'second-from-bass';
  }

  canEditPickOffset(note: PickingNote): boolean {
    return this.isRelativePickNote(note) && note.anchor === 'grip-note';
  }

  getRelativePickOffset(note: PickingNote): number {
    return this.isRelativePickNote(note) && 'fretOffset' in note ? note.fretOffset : 0;
  }

  getLegatoTargetAnchor(legato: LegatoNote): RelativeNoteAnchor {
    return this.isRelativeLegato(legato) ? legato.target.anchor : 'grip-note';
  }

  canEditLegatoTargetOffset(legato: LegatoNote): boolean {
    return this.isRelativeLegato(legato) && legato.target.anchor === 'grip-note';
  }

  getRelativeLegatoTargetOffset(legato: LegatoNote): number {
    return this.isRelativeLegato(legato) && 'fretOffset' in legato.target ? legato.target.fretOffset : 0;
  }

  private updateLegato(originalIndex: number, patch: Partial<ExplicitLegatoNote>): void {
    this.updateAction(originalIndex, action => {
      if (!action || !action.legato || this.isRelativeLegato(action.legato)) return action;
      return {
        ...action,
        legato: {
          ...action.legato,
          ...patch
        }
      };
    });
  }

  private updateAction(
    originalIndex: number,
    updater: (action: PlayingAction | null) => PlayingAction | null
  ): void {
    const measure = this.measure();
    if (originalIndex < 0 || originalIndex >= measure.actions.length) return;

    const updatedActions = [...measure.actions];
    updatedActions[originalIndex] = updater(updatedActions[originalIndex]);

    this.measure.set({
      ...measure,
      actions: updatedActions
    });
  }

  private getDefaultPickNote(pickMode: PickMode): PickingNote {
    return pickMode === 'relative'
      ? { mode: 'relative', string: 'bass', anchor: 'grip-note', fretOffset: 0 }
      : { mode: 'explicit', string: 0, fret: 0 };
  }

  private getDefaultRelativeStrumRange(): RelativeStrumRange {
    return {
      from: 'bass',
      to: 'top'
    };
  }

  private getDefaultLegato(technique: 'hammer-on' | 'pull-off' | 'slide', legatoMode: LegatoMode): LegatoNote {
    if (legatoMode === 'relative') {
      return {
        string: 'second-from-bass',
        target: technique === 'pull-off'
          ? { anchor: 'base-note' }
          : technique === 'slide'
            ? { anchor: 'grip-note', fretOffset: 2 }
            : { anchor: 'grip-note', fretOffset: 0 }
      };
    }

    return {
      string: 0,
      toFret: technique === 'pull-off' ? 0 : 2
    };
  }

  private toRelativePickWithAnchor(
    note: GripRelativePickingNote | BaseRelativePickingNote,
    anchor: RelativeNoteAnchor
  ): GripRelativePickingNote | BaseRelativePickingNote {
    if (anchor === 'base-note') {
      return {
        mode: 'relative',
        string: note.string,
        anchor: 'base-note'
      };
    }

    return {
      mode: 'relative',
      string: note.string,
      anchor: 'grip-note',
      fretOffset: 'fretOffset' in note ? note.fretOffset : 0
    };
  }

  private toRelativeLegatoEndpointWithAnchor(
    endpoint: RelativeLegatoEndpointNote,
    anchor: RelativeNoteAnchor,
    defaultOffset: number
  ): GripRelativeLegatoEndpoint | BaseRelativeLegatoEndpoint {
    if (anchor === 'base-note') {
      return {
        anchor: 'base-note'
      };
    }

    return {
      anchor: 'grip-note',
      fretOffset: 'fretOffset' in endpoint ? endpoint.fretOffset : defaultOffset
    };
  }

  private getDefaultRelativeLegatoTargetOffset(technique: PlayingAction['technique']): number {
    return technique === 'slide' ? 2 : 0;
  }

  private measureRequiresSixteenthSteps(measure: Measure): boolean {
    return measure.actions.some((action, index) => index % 2 === 1 && !!action);
  }

  private getActionSubdivision(actionIndex: number): ActionSubdivision {
    if (actionIndex % 4 === 0) return 'quarter';
    if (actionIndex % 2 === 0) return 'eighth';
    return 'sixteenth';
  }
}
