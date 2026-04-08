import { Component, computed, model, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BaseRelativeLegatoEndpoint,
  BaseRelativePickingNote,
  ExplicitLegatoNote,
  ExplicitPickingNote,
  GripRelativeLegatoEndpoint,
  GripRelativePickingNote,
  LegatoMode,
  RelativeLegatoEndpointNote,
  RelativeLegatoNote,
  PlayingPattern,
  PlayingAction,
  LegatoNote,
  PickMode,
  PickingNote,
  PlayingModifier,
  Measure,
  PlayingPatternActionGripOverride,
  PlayingPatternBeatGrip,
  PlayingPatternGripReference,
  RelativeNoteAnchor,
  RelativeStrumRange,
  RelativeStringRole,
  StrumRange,
  getLegatoMode,
  getBeatsFromTimeSignature,
  getPickMode,
  getSixteenthPerBeatFromTimeSignature,
  isRelativeStrumRange
} from '@/app/features/patterns/services/playing-patterns.model';
import { parseTimeSignature, TIME_SIGNATURES, TimeSignature, timeSignatureLabel } from '@/app/core/music/rhythm/time-signature.model';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { Subscription } from 'rxjs';
import { ModalService } from '@/app/core/services/modal.service';
import { GripSelectorModalComponent, GripSelectorModalData } from '@/app/features/grips/ui/grip-selector-modal/grip-selector-modal.component';
import { serializeGrip, TunedGrip } from '@/app/features/grips/services/grips/grip.model';
import { chordToString } from '@/app/core/music/chords';

type TechniqueType = 'strum-down' | 'strum-up' | 'pick' | 'percussive' | 'hammer-on' | 'pull-off' | 'slide';

@Component({
  selector: 'app-playing-pattern-editor',
  imports: [CommonModule, FormsModule],
  templateUrl: './playing-pattern-editor.component.html',
  styleUrl: './playing-pattern-editor.component.scss'
})
export class PlayingPatternEditorComponent implements OnDestroy {
  readonly relativeStringRoles: RelativeStringRole[] = ['bass', 'second-from-bass', 'middle', 'second-from-top', 'top'];
  readonly strumStringOptions = [
    { value: 'all', label: 'All' },
    { value: 'bass', label: 'Bass' },
    { value: 'treble', label: 'Treble' },
    { value: 'middle', label: 'Middle' },
    { value: 'power', label: 'Power' },
    { value: 'range', label: 'Range' }
  ] as const;

  pattern = model.required<PlayingPattern>();
  playbackState = { status: 'idle' } as ReturnType<PatternPlaybackService['getSnapshot']>;
  
  // Internal display model to manage UI state per measure
  private measureDisplayStates = new Map<number, boolean>();
  private readonly playbackStateSubscription: Subscription;

  // Use a computed signal that recalculates when pattern changes
  measuresForDisplay = computed(() => {
    const pattern = this.pattern();
    // Ensure we have display states for all measures
    this.ensureDisplayStates(pattern);
    return this.getMeasuresForDisplay(pattern);
  });

  constructor(
    private patternPlayback: PatternPlaybackService,
    private modalService: ModalService
  ) {
    this.playbackState = this.patternPlayback.getSnapshot();
    this.playbackStateSubscription = this.patternPlayback.state$.subscribe(state => {
      this.playbackState = state;
    });
  }

  async playPattern(): Promise<void> {
    const pattern = this.pattern()
    if (!pattern) return;

    await this.patternPlayback.togglePatternPreview(pattern);
  }

  isPatternPlaybackActive(): boolean {
    return this.playbackState.status === 'playing' && this.playbackState.patternId === this.pattern()?.id;
  }

  private updatePattern(updatedPattern: PlayingPattern) {
    // Update the pattern signal
    this.pattern.set({
      ...updatedPattern,
      beatGrips: this.normalizeBeatGrips(updatedPattern),
      actionGripOverrides: this.normalizeActionGripOverrides(updatedPattern),
      updatedAt: Date.now()
    });
  }

  ngOnDestroy(): void {
    // Clean up display states
    this.measureDisplayStates.clear();
    this.playbackStateSubscription.unsubscribe();
    this.patternPlayback.stopPatternPreview();
  }

  // Add a new measure
  addMeasure(): void {
    const pattern = this.pattern()
    if (!pattern) return;
    
    // Get time signature from previous measure or default to 4/4
    const prevMeasure = pattern.measures[pattern.measures.length - 1];
    const timeSignature: TimeSignature = prevMeasure?.timeSignature || '4/4';
    
    const actionLength = getSixteenthPerBeatFromTimeSignature(timeSignature) * getBeatsFromTimeSignature(timeSignature);
    const newMeasure: Measure = {
      timeSignature,
      actions: Array(actionLength).fill(null) // Fixed-length array, all initially null
    };
    
    // Create updated pattern with new measure
    const updatedPattern = {
      ...pattern,
      measures: [...pattern.measures, newMeasure],
      beatGrips: [...(pattern.beatGrips ?? [])],
      actionGripOverrides: [...(pattern.actionGripOverrides ?? [])]
    };
    
    // Initialize display state for new measure
    this.measureDisplayStates.set(updatedPattern.measures.length - 1, false);
    
    this.updatePattern(updatedPattern);
  }

  // Remove a measure
  removeMeasure(measureIndex: number): void {
    const pattern = this.pattern()
    if (!pattern) return;
    
    // Create updated pattern with measure removed
    const updatedMeasures = [...pattern.measures];
    updatedMeasures.splice(measureIndex, 1);
    
    const updatedPattern = {
      ...pattern,
      measures: updatedMeasures,
      beatGrips: (pattern.beatGrips ?? []).flatMap(grip => {
        if (grip.measureIndex === measureIndex) {
          return [];
        }
        return [{ ...grip, measureIndex: grip.measureIndex > measureIndex ? grip.measureIndex - 1 : grip.measureIndex }];
      }),
      actionGripOverrides: (pattern.actionGripOverrides ?? []).flatMap(grip => {
        if (grip.measureIndex === measureIndex) {
          return [];
        }
        return [{ ...grip, measureIndex: grip.measureIndex > measureIndex ? grip.measureIndex - 1 : grip.measureIndex }];
      })
    };
    
    // Clean up display state for removed measure and shift remaining states
    const newDisplayStates = new Map<number, boolean>();
    this.measureDisplayStates.forEach((value, key) => {
      if (key < measureIndex) {
        // Keep states for measures before the removed one
        newDisplayStates.set(key, value);
      } else if (key > measureIndex) {
        // Shift states for measures after the removed one
        newDisplayStates.set(key - 1, value);
      }
      // Skip the removed measure's state
    });
    this.measureDisplayStates = newDisplayStates;
    
    this.updatePattern(updatedPattern);
  }

  // Add action with specific technique type - now uses originalIndex from display model
  addAction(measureIndex: number, originalIndex: number, techniqueType: TechniqueType): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex]) return;
    const measure = pattern.measures[measureIndex];
    
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
          pickMode: 'relative',
          pick: [{ role: 'bass', anchor: 'grip-note', fretOffset: 0 }],
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
          legato: techniqueType === 'pull-off'
            ? { role: 'second-from-bass', start: { anchor: 'grip-note', fretOffset: 0 }, target: { anchor: 'base-note' } }
            : techniqueType === 'slide'
              ? { role: 'second-from-bass', start: { anchor: 'grip-note', fretOffset: 0 }, target: { anchor: 'grip-note', fretOffset: 2 } }
              : { role: 'second-from-bass', start: { anchor: 'base-note' }, target: { anchor: 'grip-note', fretOffset: 0 } }
        };
        break;
    }
    
    // Create immutable update
    const updatedActions = [...measure.actions];
    updatedActions[originalIndex] = newAction;
    
    const updatedMeasure: Measure = {
      ...measure,
      actions: updatedActions
    };
    
    const updatedMeasures = [...pattern.measures];
    updatedMeasures[measureIndex] = updatedMeasure;
    
    const updatedPattern: PlayingPattern = {
      ...pattern,
      measures: updatedMeasures,
      beatGrips: this.filterBeatGripsForMeasure(pattern, measureIndex, updatedMeasure),
      actionGripOverrides: this.filterActionGripsForMeasure(pattern, measureIndex, updatedMeasure)
    };
    
    this.updatePattern(updatedPattern);
  }

  onActionTechniqueChange(measureIndex: number, originalIndex: number): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (!action) return;
    
    let updatedAction: PlayingAction = { ...action };
    
    if (action.technique === 'strum') {
      // Ensure strum pattern exists
      if (!updatedAction.strum) {
        updatedAction.strum = { direction: 'D', strings: 'all' };
      }

      // Remove pick array and percussive if switching from pick/percussive to strum
      delete updatedAction.pick;
      delete updatedAction.pickMode;
      delete updatedAction.legatoMode;
      delete updatedAction.percussive;
    } else if (action.technique === 'pick') {
      // Ensure pick array exists
      if (!updatedAction.pick) {
        updatedAction.pickMode = 'relative';
        updatedAction.pick = [{ role: 'bass', anchor: 'grip-note', fretOffset: 0 }];
      }

      // Remove strum pattern and percussive if switching from strum/percussive to pick
      delete updatedAction.strum;
      delete updatedAction.percussive;
      delete updatedAction.legato;
      delete updatedAction.legatoMode;
    } else if (action.technique === 'percussive') {
      // Ensure percussive object exists
      if (!updatedAction.percussive) {
        updatedAction.percussive = { technique: 'body-knock' };
      }

      // Remove strum and pick for percussive
      delete updatedAction.strum;
      delete updatedAction.pick;
      delete updatedAction.pickMode;
      delete updatedAction.legato;
      delete updatedAction.legatoMode;
    } else if (action.technique === 'hammer-on' || action.technique === 'pull-off' || action.technique === 'slide') {
      if (!updatedAction.legato) {
        updatedAction.legatoMode = 'relative';
        updatedAction.legato = action.technique === 'pull-off'
          ? { role: 'second-from-bass', start: { anchor: 'grip-note', fretOffset: 0 }, target: { anchor: 'base-note' } }
          : action.technique === 'slide'
            ? { role: 'second-from-bass', start: { anchor: 'grip-note', fretOffset: 0 }, target: { anchor: 'grip-note', fretOffset: 2 } }
            : { role: 'second-from-bass', start: { anchor: 'base-note' }, target: { anchor: 'grip-note', fretOffset: 0 } };
      }

      delete updatedAction.strum;
      delete updatedAction.pick;
      delete updatedAction.pickMode;
      delete updatedAction.percussive;
    } else {
      // Remove strum, pick, and percussive for other techniques
      delete updatedAction.strum;
      delete updatedAction.pick;
      delete updatedAction.pickMode;
      delete updatedAction.percussive;
      delete updatedAction.legato;
      delete updatedAction.legatoMode;
    }
    
    // Ensure modifiers array exists for strum and pick
    if (action.technique === 'strum' || action.technique === 'pick') {
      if (!updatedAction.modifiers) {
        updatedAction.modifiers = [];
      }
    } else {
      // Remove modifiers for non-applicable techniques
      delete updatedAction.modifiers;
    }
    
    const measure = pattern.measures[measureIndex];
    const updatedActions = [...measure.actions];
    updatedActions[originalIndex] = updatedAction;
    
    const updatedMeasure: Measure = {
      ...measure,
      actions: updatedActions
    };
    
    const updatedMeasures = [...pattern.measures];
    updatedMeasures[measureIndex] = updatedMeasure;
    
    const updatedPattern: PlayingPattern = {
      ...pattern,
      measures: updatedMeasures
    };
    
    this.updatePattern(updatedPattern);
  }

  removeAction(measureIndex: number, originalIndex: number): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    
    const measure = pattern.measures[measureIndex];
    const updatedActions = [...measure.actions];
    updatedActions[originalIndex] = null;
    
    const updatedMeasure: Measure = {
      ...measure,
      actions: updatedActions
    };
    
    const updatedMeasures = [...pattern.measures];
    updatedMeasures[measureIndex] = updatedMeasure;
    
    const updatedPattern: PlayingPattern = {
      ...pattern,
      measures: updatedMeasures
    };
    
    this.updatePattern(updatedPattern);
  }

  trackByActionIndex(index: number, action: any) {
    return index;
  }

  trackByMeasureIndex(index: number, measure: any) {
    return index;
  }

  // Methods for handling picking notes
  addPickingNote(measureIndex: number, originalIndex: number): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (action && action.technique === 'pick') {
      const currentPick = action.pick || [];
      const updatedAction: PlayingAction = {
        ...action,
        pick: [...currentPick, this.getDefaultPickNote(this.getPickModeForAction(action))]
      };
      
      const measure = pattern.measures[measureIndex];
      const updatedActions = [...measure.actions];
      updatedActions[originalIndex] = updatedAction;
      
      const updatedMeasure: Measure = {
        ...measure,
        actions: updatedActions
      };
      
      const updatedMeasures = [...pattern.measures];
      updatedMeasures[measureIndex] = updatedMeasure;
      
      const updatedPattern: PlayingPattern = {
        ...pattern,
        measures: updatedMeasures
      };
      
      this.updatePattern(updatedPattern);
    }
  }

  removePickingNote(measureIndex: number, originalIndex: number, noteIndex: number): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (action && action.technique === 'pick' && action.pick) {
      const updatedPick = [...action.pick];
      updatedPick.splice(noteIndex, 1);
      
      const updatedAction: PlayingAction = {
        ...action,
        pick: updatedPick
      };
      
      const measure = pattern.measures[measureIndex];
      const updatedActions = [...measure.actions];
      updatedActions[originalIndex] = updatedAction;
      
      const updatedMeasure: Measure = {
        ...measure,
        actions: updatedActions
      };
      
      const updatedMeasures = [...pattern.measures];
      updatedMeasures[measureIndex] = updatedMeasure;
      
      const updatedPattern: PlayingPattern = {
        ...pattern,
        measures: updatedMeasures
      };
      
      this.updatePattern(updatedPattern);
    }
  }

  // Update pick note string role with immutable pattern update
  updatePickNoteRole(measureIndex: number, originalIndex: number, noteIndex: number, role: RelativeStringRole): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (action && action.technique === 'pick' && action.pick && action.pick[noteIndex]) {
      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = { ...(updatedPick[noteIndex] as GripRelativePickingNote | BaseRelativePickingNote), role };
      
      const updatedAction: PlayingAction = {
        ...action,
        pick: updatedPick
      };
      
      const measure = pattern.measures[measureIndex];
      const updatedActions = [...measure.actions];
      updatedActions[originalIndex] = updatedAction;
      
      const updatedMeasure: Measure = {
        ...measure,
        actions: updatedActions
      };
      
      const updatedMeasures = [...pattern.measures];
      updatedMeasures[measureIndex] = updatedMeasure;
      
      const updatedPattern: PlayingPattern = {
        ...pattern,
        measures: updatedMeasures
      };
      
      this.updatePattern(updatedPattern);
    }
  }

  updatePickNoteString(measureIndex: number, originalIndex: number, noteIndex: number, stringValue: number): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (action && action.technique === 'pick' && action.pick && action.pick[noteIndex]) {
      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = { ...(updatedPick[noteIndex] as ExplicitPickingNote), string: stringValue };

      const updatedAction: PlayingAction = {
        ...action,
        pick: updatedPick
      };

      const measure = pattern.measures[measureIndex];
      const updatedActions = [...measure.actions];
      updatedActions[originalIndex] = updatedAction;

      const updatedMeasure: Measure = {
        ...measure,
        actions: updatedActions
      };

      const updatedMeasures = [...pattern.measures];
      updatedMeasures[measureIndex] = updatedMeasure;

      const updatedPattern: PlayingPattern = {
        ...pattern,
        measures: updatedMeasures
      };

      this.updatePattern(updatedPattern);
    }
  }

  // Update pick note fret with immutable pattern update
  updatePickNoteFret(measureIndex: number, originalIndex: number, noteIndex: number, fretValue: number): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (action && action.technique === 'pick' && action.pick && action.pick[noteIndex]) {
      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = { ...(updatedPick[noteIndex] as ExplicitPickingNote), fret: fretValue };
      
      const updatedAction: PlayingAction = {
        ...action,
        pick: updatedPick
      };
      
      const measure = pattern.measures[measureIndex];
      const updatedActions = [...measure.actions];
      updatedActions[originalIndex] = updatedAction;
      
      const updatedMeasure: Measure = {
        ...measure,
        actions: updatedActions
      };
      
      const updatedMeasures = [...pattern.measures];
      updatedMeasures[measureIndex] = updatedMeasure;
      
      const updatedPattern: PlayingPattern = {
        ...pattern,
        measures: updatedMeasures
      };
      
      this.updatePattern(updatedPattern);
    }
  }

  // Update strum direction with immutable pattern update
  updateStrumDirection(measureIndex: number, originalIndex: number, direction: 'D' | 'U'): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];

    if (action && action.technique === 'strum' && action.strum) {
      const updatedAction: PlayingAction = {
        ...action,
        strum: {
          ...action.strum,
          direction: direction
        }
      };
      
      const measure = pattern.measures[measureIndex];
      const updatedActions = [...measure.actions];
      updatedActions[originalIndex] = updatedAction;
      
      const updatedMeasure: Measure = {
        ...measure,
        actions: updatedActions
      };
      
      const updatedMeasures = [...pattern.measures];
      updatedMeasures[measureIndex] = updatedMeasure;
      
      const updatedPattern: PlayingPattern = {
        ...pattern,
        measures: updatedMeasures
      };
      
      this.updatePattern(updatedPattern);
    }
  }

  // Update strum strings with immutable pattern update
  updateStrumStrings(measureIndex: number, originalIndex: number, strings: string): void {
    this.updateAction(measureIndex, originalIndex, action => {
      if (!action || action.technique !== 'strum' || !action.strum) return action;

      return {
        ...action,
        strum: {
          ...action.strum,
          strings: strings as Exclude<StrumRange, number[] | RelativeStrumRange>
        }
      };
    });
  }

  updateStrumStringsMode(measureIndex: number, originalIndex: number, value: string): void {
    this.updateAction(measureIndex, originalIndex, action => {
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

  updateStrumRangeFrom(measureIndex: number, originalIndex: number, from: RelativeStringRole): void {
    this.updateAction(measureIndex, originalIndex, action => {
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

  updateStrumRangeTo(measureIndex: number, originalIndex: number, to: RelativeStringRole): void {
    this.updateAction(measureIndex, originalIndex, action => {
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

  // Update percussion technique with immutable pattern update
  updatePercussionTechnique(measureIndex: number, originalIndex: number, technique: 'body-knock' | 'string-slap'): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (action && action.technique === 'percussive') {
      const updatedAction: PlayingAction = {
        ...action,
        percussive: {
          technique: technique
        }
      };
      
      const measure = pattern.measures[measureIndex];
      const updatedActions = [...measure.actions];
      updatedActions[originalIndex] = updatedAction;
      
      const updatedMeasure: Measure = {
        ...measure,
        actions: updatedActions
      };
      
      const updatedMeasures = [...pattern.measures];
      updatedMeasures[measureIndex] = updatedMeasure;
      
      const updatedPattern: PlayingPattern = {
        ...pattern,
        measures: updatedMeasures
      };
      
      this.updatePattern(updatedPattern);
    }
  }

  // Helper method to get string names for picking
  getStringName(stringIndex: number): string {
    const names = ['Low E (6th)', 'A (5th)', 'D (4th)', 'G (3rd)', 'B (2nd)', 'High E (1st)'];
    return names[stringIndex] || `String ${stringIndex + 1}`;
  }

  getRelativeStringRoleLabel(role: RelativeStringRole): string {
    switch (role) {
      case 'bass': return 'Bass Note';
      case 'second-from-bass': return '2nd from Bass';
      case 'middle': return 'Middle';
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

  getStrumRangeFrom(action: PlayingAction): RelativeStringRole {
    if (!this.isRelativeStrumStrings(action)) {
      return 'bass';
    }

    const strings = action.strum!.strings as RelativeStrumRange;
    return strings.from;
  }

  getStrumRangeTo(action: PlayingAction): RelativeStringRole {
    if (!this.isRelativeStrumStrings(action)) {
      return 'top';
    }

    const strings = action.strum!.strings as RelativeStrumRange;
    return strings.to;
  }

  getPickModeForAction(action: PlayingAction): PickMode {
    return getPickMode(action);
  }

  getLegatoModeForAction(action: PlayingAction): LegatoMode {
    return getLegatoMode(action);
  }

  isRelativePickNote(note: PickingNote): note is GripRelativePickingNote | BaseRelativePickingNote {
    return 'role' in note;
  }

  isRelativeLegato(legato: LegatoNote): legato is RelativeLegatoNote {
    return 'role' in legato && 'start' in legato && 'target' in legato;
  }

  getPickAnchor(note: PickingNote): RelativeNoteAnchor {
    return this.isRelativePickNote(note) ? note.anchor : 'grip-note';
  }

  getPickRole(note: PickingNote): RelativeStringRole {
    return this.isRelativePickNote(note) ? note.role : 'bass';
  }

  getLegatoRole(legato: LegatoNote): RelativeStringRole {
    return this.isRelativeLegato(legato) ? legato.role : 'second-from-bass';
  }

  canEditPickOffset(note: PickingNote): boolean {
    return this.isRelativePickNote(note) && note.anchor === 'grip-note';
  }

  getRelativePickOffset(note: PickingNote): number {
    return this.isRelativePickNote(note) && 'fretOffset' in note ? note.fretOffset : 0;
  }

  getLegatoStartAnchor(legato: LegatoNote): RelativeNoteAnchor {
    return this.isRelativeLegato(legato) ? legato.start.anchor : 'base-note';
  }

  getLegatoTargetAnchor(legato: LegatoNote): RelativeNoteAnchor {
    return this.isRelativeLegato(legato) ? legato.target.anchor : 'grip-note';
  }

  canEditLegatoStartOffset(legato: LegatoNote): boolean {
    return this.isRelativeLegato(legato) && legato.start.anchor === 'grip-note';
  }

  canEditLegatoTargetOffset(legato: LegatoNote): boolean {
    return this.isRelativeLegato(legato) && legato.target.anchor === 'grip-note';
  }

  getRelativeLegatoStartOffset(legato: LegatoNote): number {
    return this.isRelativeLegato(legato) && 'fretOffset' in legato.start ? legato.start.fretOffset : 0;
  }

  getRelativeLegatoTargetOffset(legato: LegatoNote): number {
    return this.isRelativeLegato(legato) && 'fretOffset' in legato.target ? legato.target.fretOffset : 0;
  }

  setPickMode(measureIndex: number, originalIndex: number, pickMode: PickMode): void {
    this.updateAction(measureIndex, originalIndex, action => {
      if (!action || action.technique !== 'pick') return action;

      return {
        ...action,
        pickMode,
        pick: [this.getDefaultPickNote(pickMode)]
      };
    });
  }

  updatePickNoteOffset(measureIndex: number, originalIndex: number, noteIndex: number, fretOffset: number): void {
    this.updateAction(measureIndex, originalIndex, action => {
      if (!action || action.technique !== 'pick' || !action.pick || !action.pick[noteIndex]) return action;

      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = { ...(updatedPick[noteIndex] as GripRelativePickingNote), fretOffset };
      return { ...action, pick: updatedPick };
    });
  }

  updatePickNoteAnchor(measureIndex: number, originalIndex: number, noteIndex: number, anchor: RelativeNoteAnchor): void {
    this.updateAction(measureIndex, originalIndex, action => {
      if (!action || action.technique !== 'pick' || !action.pick || !action.pick[noteIndex]) return action;

      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = this.toRelativePickWithAnchor(
        updatedPick[noteIndex] as GripRelativePickingNote | BaseRelativePickingNote,
        anchor
      );
      return { ...action, pick: updatedPick };
    });
  }

  updateLegatoRole(measureIndex: number, originalIndex: number, role: RelativeStringRole): void {
    this.updateAction(measureIndex, originalIndex, action => {
      if (!action || !action.legato || !this.isRelativeLegato(action.legato)) return action;
      return { ...action, legato: { ...action.legato, role } };
    });
  }

  updateLegatoString(measureIndex: number, originalIndex: number, stringValue: number): void {
    this.updateAction(measureIndex, originalIndex, action => {
      if (!action || !action.legato || this.isRelativeLegato(action.legato)) return action;
      return { ...action, legato: { ...action.legato, string: stringValue } };
    });
  }

  updateLegatoFromFret(measureIndex: number, originalIndex: number, fromFret: number): void {
    this.updateLegato(measureIndex, originalIndex, { fromFret });
  }

  updateLegatoToFret(measureIndex: number, originalIndex: number, toFret: number): void {
    this.updateLegato(measureIndex, originalIndex, { toFret });
  }

  setLegatoMode(measureIndex: number, originalIndex: number, legatoMode: LegatoMode): void {
    this.updateAction(measureIndex, originalIndex, action => {
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

  updateLegatoStartFretOffset(measureIndex: number, originalIndex: number, fretOffset: number): void {
    this.updateAction(measureIndex, originalIndex, action => {
      if (!action || !action.legato || !this.isRelativeLegato(action.legato) || action.legato.start.anchor !== 'grip-note') return action;
      return { ...action, legato: { ...action.legato, start: { ...action.legato.start, fretOffset } } };
    });
  }

  updateLegatoTargetFretOffset(measureIndex: number, originalIndex: number, fretOffset: number): void {
    this.updateAction(measureIndex, originalIndex, action => {
      if (!action || !action.legato || !this.isRelativeLegato(action.legato) || action.legato.target.anchor !== 'grip-note') return action;
      return { ...action, legato: { ...action.legato, target: { ...action.legato.target, fretOffset } } };
    });
  }

  updateLegatoStartAnchor(measureIndex: number, originalIndex: number, anchor: RelativeNoteAnchor): void {
    const action = this.pattern()?.measures[measureIndex]?.actions[originalIndex];
    if (!action || !action.legato || !this.isRelativeLegato(action.legato)) return;

    const nextStart = this.toRelativeLegatoEndpointWithAnchor(action.legato.start, anchor, this.getDefaultRelativeLegatoStartOffset(action.technique));
    this.updateAction(measureIndex, originalIndex, currentAction => {
      if (!currentAction || !currentAction.legato || !this.isRelativeLegato(currentAction.legato)) return currentAction;
      return { ...currentAction, legato: { ...currentAction.legato, start: nextStart } };
    });
  }

  updateLegatoTargetAnchor(measureIndex: number, originalIndex: number, anchor: RelativeNoteAnchor): void {
    const action = this.pattern()?.measures[measureIndex]?.actions[originalIndex];
    if (!action || !action.legato || !this.isRelativeLegato(action.legato)) return;

    const nextTarget = this.toRelativeLegatoEndpointWithAnchor(action.legato.target, anchor, this.getDefaultRelativeLegatoTargetOffset(action.technique));
    this.updateAction(measureIndex, originalIndex, currentAction => {
      if (!currentAction || !currentAction.legato || !this.isRelativeLegato(currentAction.legato)) return currentAction;
      return { ...currentAction, legato: { ...currentAction.legato, target: nextTarget } };
    });
  }

  // Helper method to get available modifiers
  getAvailableModifiers(): { value: PlayingModifier; label: string }[] {
    return [
      { value: 'mute', label: 'Mute' },
      { value: 'palm-mute', label: 'Palm Mute' },
      { value: 'accent', label: 'Accent' }
    ];
  }

  // Helper method to get available time signatures
  getAvailableTimeSignatures(): { value: TimeSignature; label: string }[] {
    return TIME_SIGNATURES.map(value => ({ value, label: timeSignatureLabel(value) }));
  }

  // Change time signature for a specific measure
  changeTimeSignature(measureIndex: number, newTimeSignatureValue: unknown): void {
    const pattern = this.pattern();
    if (!pattern || !pattern.measures[measureIndex]) return;
    
    const measure = pattern.measures[measureIndex];
    const oldTimeSignature = measure.timeSignature;

    const newTimeSignature = parseTimeSignature(newTimeSignatureValue, oldTimeSignature);
    
    // Only update if the time signature actually changed
    if (oldTimeSignature === newTimeSignature) return;
    
    // Calculate new action array length
    const newActionLength = getSixteenthPerBeatFromTimeSignature(newTimeSignature) * getBeatsFromTimeSignature(newTimeSignature);
    const oldActionLength = measure.actions.length;
    
    let newActions: (PlayingAction | null)[];
    
    if (newActionLength === oldActionLength) {
      // Same length, keep all actions
      newActions = [...measure.actions];
    } else if (newActionLength > oldActionLength) {
      // Longer, pad with nulls
      newActions = [...measure.actions, ...Array(newActionLength - oldActionLength).fill(null)];
    } else {
      // Shorter, truncate
      newActions = measure.actions.slice(0, newActionLength);
    }
    
    // Create updated measure with immutable copy
    const updatedMeasure: Measure = {
      timeSignature: newTimeSignature,
      actions: newActions
    };
    
    // Create updated pattern with immutable measures array
    const updatedMeasures = [...pattern.measures];
    updatedMeasures[measureIndex] = updatedMeasure;
    
    const updatedPattern: PlayingPattern = {
      ...pattern,
      measures: updatedMeasures
    };
    
    // Reset subdivision display state when time signature changes
    this.measureDisplayStates.set(measureIndex, false);
    
    this.updatePattern(updatedPattern);
  }

  // Helper method to toggle modifier
  toggleModifier(measureIndex: number, originalIndex: number, modifier: PlayingModifier): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (!action) return;
    
    const currentModifiers = action.modifiers || [];
    const index = currentModifiers.indexOf(modifier);
    
    let updatedModifiers: PlayingModifier[];
    if (index > -1) {
      updatedModifiers = currentModifiers.filter(m => m !== modifier);
    } else {
      updatedModifiers = [...currentModifiers, modifier];
    }
    
    const updatedAction: PlayingAction = {
      ...action,
      modifiers: updatedModifiers
    };
    
    const measure = pattern.measures[measureIndex];
    const updatedActions = [...measure.actions];
    updatedActions[originalIndex] = updatedAction;
    
    const updatedMeasure: Measure = {
      ...measure,
      actions: updatedActions
    };
    
    const updatedMeasures = [...pattern.measures];
    updatedMeasures[measureIndex] = updatedMeasure;
    
    const updatedPattern: PlayingPattern = {
      ...pattern,
      measures: updatedMeasures
    };
    
    this.updatePattern(updatedPattern);
  }

  // Helper method to check if modifier is active
  hasModifier(action: PlayingAction, modifier: PlayingModifier): boolean {
    return action.modifiers?.includes(modifier) || false;
  }

  private updateLegato(measureIndex: number, originalIndex: number, patch: Partial<ExplicitLegatoNote>): void {
    const pattern = this.pattern();
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;

    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (!action || !action.legato) return;
    if (this.isRelativeLegato(action.legato)) return;

    const nextLegato: ExplicitLegatoNote = {
      ...action.legato,
      ...patch
    };

    const updatedAction: PlayingAction = {
      ...action,
      legato: nextLegato
    };

    const measure = pattern.measures[measureIndex];
    const updatedActions = [...measure.actions];
    updatedActions[originalIndex] = updatedAction;

    const updatedMeasure: Measure = {
      ...measure,
      actions: updatedActions
    };

    const updatedMeasures = [...pattern.measures];
    updatedMeasures[measureIndex] = updatedMeasure;

    this.updatePattern({
      ...pattern,
      measures: updatedMeasures
    });
  }

  private updateAction(
    measureIndex: number,
    originalIndex: number,
    updater: (action: PlayingAction | null) => PlayingAction | null
  ): void {
    const pattern = this.pattern();
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;

    const measure = pattern.measures[measureIndex];
    const updatedActions = [...measure.actions];
    updatedActions[originalIndex] = updater(updatedActions[originalIndex]);

    const updatedMeasures = [...pattern.measures];
    updatedMeasures[measureIndex] = {
      ...measure,
      actions: updatedActions
    };

    this.updatePattern({
      ...pattern,
      measures: updatedMeasures
    });
  }

  private getDefaultPickNote(pickMode: PickMode): PickingNote {
    return pickMode === 'relative'
      ? { role: 'bass', anchor: 'grip-note', fretOffset: 0 }
      : { string: 0, fret: 0 };
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
        role: 'second-from-bass',
        start: technique === 'pull-off'
          ? { anchor: 'grip-note', fretOffset: 0 }
          : technique === 'slide'
            ? { anchor: 'grip-note', fretOffset: 0 }
            : { anchor: 'base-note' },
        target: technique === 'pull-off'
          ? { anchor: 'base-note' }
          : technique === 'slide'
            ? { anchor: 'grip-note', fretOffset: 2 }
            : { anchor: 'grip-note', fretOffset: 0 }
      };
    }

    return {
      string: 0,
      fromFret: technique === 'pull-off' ? 2 : 0,
      toFret: technique === 'pull-off' ? 0 : 2
    };
  }

  private toRelativePickWithAnchor(
    note: GripRelativePickingNote | BaseRelativePickingNote,
    anchor: RelativeNoteAnchor
  ): GripRelativePickingNote | BaseRelativePickingNote {
    if (anchor === 'base-note') {
      return {
        role: note.role,
        anchor: 'base-note'
      };
    }

    return {
      role: note.role,
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

  private getDefaultRelativeLegatoStartOffset(technique: PlayingAction['technique']): number {
    return technique === 'pull-off' || technique === 'slide' ? 0 : 0;
  }

  private getDefaultRelativeLegatoTargetOffset(technique: PlayingAction['technique']): number {
    return technique === 'slide' ? 2 : 0;
  }

  // Ensure we have display states initialized for all measures
  private ensureDisplayStates(pattern: PlayingPattern): void {
    if (!pattern || !pattern.measures) return;
    
    pattern.measures.forEach((measure, index) => {
      if (!this.measureDisplayStates.has(index)) {
        this.measureDisplayStates.set(index, this.measureRequiresSixteenthSteps(measure));
      }
    });
  }

  getMeasuresForDisplay(pattern: PlayingPattern): { measure: Measure, measureIndex: number, useSixteenthSteps: boolean }[] {
    if (!pattern || !pattern.measures) return [];

    return pattern.measures.map((m, i) => ({ 
      measure: m, 
      measureIndex: i,
      useSixteenthSteps: this.measureRequiresSixteenthSteps(m) || (this.measureDisplayStates.get(i) ?? false)
    }));
  }

  toggleSixteenthSteps(measureIndex: number): void {
    const measure = this.pattern()?.measures[measureIndex];
    if (!measure || this.measureRequiresSixteenthSteps(measure)) {
      return;
    }

    const current = this.measureDisplayStates.get(measureIndex) ?? false;
    this.measureDisplayStates.set(measureIndex, !current);
    
    // Force the computed signal to recalculate by creating a new pattern reference
    const currentPattern = this.pattern();
    this.pattern.set({ ...currentPattern });
  }

  canToggleSixteenthSteps(measureIndex: number): boolean {
    const measure = this.pattern()?.measures[measureIndex];
    return !!measure && !this.measureRequiresSixteenthSteps(measure);
  }

  getBeatIndices(measureIndex: number): number[] {
    const pattern = this.pattern();
    const measure = pattern?.measures[measureIndex];
    if (!measure) {
      return [];
    }

    return Array.from({ length: getBeatsFromTimeSignature(measure.timeSignature) }, (_, index) => index);
  }

  getActionIndices(measureIndex: number): number[] {
    const measure = this.pattern()?.measures[measureIndex];
    if (!measure) {
      return [];
    }

    return measure.actions.map((action, index) => action ? index : -1).filter(index => index >= 0);
  }

  getBeatGrip(measureIndex: number, beatIndex: number): PlayingPatternBeatGrip | undefined {
    return this.pattern()?.beatGrips?.find(grip => grip.measureIndex === measureIndex && grip.beatIndex === beatIndex);
  }

  getActionGrip(measureIndex: number, actionIndex: number): PlayingPatternActionGripOverride | undefined {
    return this.pattern()?.actionGripOverrides?.find(grip => grip.measureIndex === measureIndex && grip.actionIndex === actionIndex);
  }

  async assignBeatGrip(measureIndex: number, beatIndex: number): Promise<void> {
    const pattern = this.pattern();
    if (!pattern) {
      return;
    }

    const selectedGrip = await this.selectGrip(this.getBeatGrip(measureIndex, beatIndex)?.chordName);
    if (selectedGrip === undefined) {
      return;
    }

    this.updatePattern({
      ...pattern,
      beatGrips: selectedGrip ? [
        ...(pattern.beatGrips ?? []).filter(grip => !(grip.measureIndex === measureIndex && grip.beatIndex === beatIndex)),
        {
          measureIndex,
          beatIndex,
          gripId: selectedGrip.gripId,
          chordName: selectedGrip.chordName
        }
      ] : (pattern.beatGrips ?? []).filter(grip => !(grip.measureIndex === measureIndex && grip.beatIndex === beatIndex))
    });
  }

  async assignActionGrip(measureIndex: number, actionIndex: number): Promise<void> {
    const pattern = this.pattern();
    if (!pattern) {
      return;
    }

    const selectedGrip = await this.selectGrip(this.getActionGrip(measureIndex, actionIndex)?.chordName);
    if (selectedGrip === undefined) {
      return;
    }

    this.updatePattern({
      ...pattern,
      actionGripOverrides: selectedGrip ? [
        ...(pattern.actionGripOverrides ?? []).filter(grip => !(grip.measureIndex === measureIndex && grip.actionIndex === actionIndex)),
        {
          measureIndex,
          actionIndex,
          gripId: selectedGrip.gripId,
          chordName: selectedGrip.chordName
        }
      ] : (pattern.actionGripOverrides ?? []).filter(grip => !(grip.measureIndex === measureIndex && grip.actionIndex === actionIndex))
    });
  }

  clearMeasureGrips(measureIndex: number): void {
    const pattern = this.pattern();
    if (!pattern) {
      return;
    }

    this.updatePattern({
      ...pattern,
      beatGrips: (pattern.beatGrips ?? []).filter(grip => grip.measureIndex !== measureIndex),
      actionGripOverrides: (pattern.actionGripOverrides ?? []).filter(grip => grip.measureIndex !== measureIndex)
    });
  }

  getActionsForDisplay(measureData: { measure: Measure, measureIndex: number, useSixteenthSteps: boolean }): { position: string; action: PlayingAction | null; originalIndex: number; isMainPosition: boolean; subdivision: 'quarter' | 'eighth' | 'sixteenth' }[] {
    const measure = measureData.measure;
    if (!measure) return [];

    const numberOfBeats = getBeatsFromTimeSignature(measure.timeSignature);
    const sixteenthPerBeat = getSixteenthPerBeatFromTimeSignature(measure.timeSignature);
    const totalSixteenths = numberOfBeats * sixteenthPerBeat;
    
    const displayActions: { position: string; action: PlayingAction | null; originalIndex: number; isMainPosition: boolean; subdivision: 'quarter' | 'eighth' | 'sixteenth' }[] = [];

    for (let i = 0; i < totalSixteenths; i += measureData.useSixteenthSteps ? 1 : 2) {
      displayActions.push({
        position: (Math.floor(i / numberOfBeats) + 1).toString(),
        action: measure.actions[i] || null,
        originalIndex: i,
        isMainPosition: i % 4 === 0,
        subdivision: this.getActionSubdivision(i)
      });
    }

    return displayActions;
  }

  // Helper method to determine if a action position should be highlighted (main actions)
  isMainAction(actionIndex: number): boolean {
    // Main actions are typically 1, 5, 9, 13 (every 4th action in 16th note subdivision)
    return actionIndex % 4 === 0;
  }

  // Helper method to determine action subdivision level
  getActionSubdivision(actionIndex: number): 'quarter' | 'eighth' | 'sixteenth' {
    if (actionIndex % 4 === 0) return 'quarter';
    if (actionIndex % 2 === 0) return 'eighth';
    return 'sixteenth';
  }

  private measureRequiresSixteenthSteps(measure: Measure): boolean {
    return measure.actions.some((action, index) => index % 2 === 1 && !!action);
  }

  private filterBeatGripsForMeasure(pattern: PlayingPattern, measureIndex: number, updatedMeasure: Measure): PlayingPatternBeatGrip[] {
    return (pattern.beatGrips ?? []).filter(grip => {
      if (grip.measureIndex !== measureIndex) {
        return true;
      }

      return grip.beatIndex >= 0 && grip.beatIndex < getBeatsFromTimeSignature(updatedMeasure.timeSignature);
    });
  }

  private filterActionGripsForMeasure(pattern: PlayingPattern, measureIndex: number, updatedMeasure: Measure): PlayingPatternActionGripOverride[] {
    return (pattern.actionGripOverrides ?? []).filter(grip => {
      if (grip.measureIndex !== measureIndex) {
        return true;
      }

      return grip.actionIndex >= 0 && grip.actionIndex < updatedMeasure.actions.length;
    });
  }

  private normalizeBeatGrips(pattern: PlayingPattern): PlayingPatternBeatGrip[] {
    return (pattern.beatGrips ?? []).filter(grip => {
      const measure = pattern.measures[grip.measureIndex];
      return !!measure && grip.beatIndex >= 0 && grip.beatIndex < getBeatsFromTimeSignature(measure.timeSignature);
    });
  }

  private normalizeActionGripOverrides(pattern: PlayingPattern): PlayingPatternActionGripOverride[] {
    return (pattern.actionGripOverrides ?? []).filter(grip => {
      const measure = pattern.measures[grip.measureIndex];
      return !!measure && grip.actionIndex >= 0 && grip.actionIndex < measure.actions.length;
    });
  }

  private async selectGrip(chordName?: string): Promise<PlayingPatternGripReference | null | undefined> {
    const data: GripSelectorModalData = { chord: chordName };
    const modalRef = this.modalService.show(GripSelectorModalComponent, {
      data,
      width: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: true
    });

    const result = await modalRef.afterClosed();
    if (!result || result.grips.length === 0) {
      return undefined;
    }

    return {
      gripId: serializeGrip(result.grips[0] as TunedGrip),
      chordName: chordToString(result.chord)
    };
  }
}
