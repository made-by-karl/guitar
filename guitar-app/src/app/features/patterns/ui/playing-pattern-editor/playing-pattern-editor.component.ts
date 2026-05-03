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
  PlayingPatternActionGrip,
  PlayingPatternGripReference,
  RelativeNoteAnchor,
  RelativeStrumRange,
  RelativeString,
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
import { DialogService } from '@/app/core/services/dialog.service';
import { NotificationService } from '@/app/core/services/notification.service';
import {
  CustomGripEditorModalComponent,
  CustomGripEditorResult
} from '@/app/features/grips/ui/custom-grip-editor-modal/custom-grip-editor-modal.component';
import {
  GripSourceSelectorModalComponent,
  GripSourceSelectorResult
} from '@/app/features/grips/ui/grip-source-selector-modal/grip-source-selector-modal.component';

type TechniqueType = 'strum-down' | 'strum-up' | 'pick' | 'percussive' | 'hammer-on' | 'pull-off' | 'slide';
type ActionSubdivision = 'quarter' | 'eighth' | 'sixteenth';
interface ActionDisplayData {
  position: string;
  action: PlayingAction | null;
  originalIndex: number;
  isMainPosition: boolean;
  subdivision: ActionSubdivision;
}

interface CopiedMeasure {
  measure: Measure;
  actionGrips: PlayingPatternActionGrip[];
  useSixteenthSteps: boolean;
}

@Component({
  selector: 'app-playing-pattern-editor',
  imports: [CommonModule, FormsModule],
  templateUrl: './playing-pattern-editor.component.html',
  styleUrl: './playing-pattern-editor.component.scss'
})
export class PlayingPatternEditorComponent implements OnDestroy {
  readonly relativeStrings: RelativeString[] = ['bass', 'second-from-bass', 'middle', 'second-from-top', 'top'];
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
  private copiedMeasure?: CopiedMeasure;
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
    private modalService: ModalService,
    private dialogService: DialogService,
    private notificationService: NotificationService
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
      actionGrips: this.normalizeActionGrips(updatedPattern),
      updatedAt: Date.now()
    });
  }

  ngOnDestroy(): void {
    // Clean up display states
    this.measureDisplayStates.clear();
    this.playbackStateSubscription.unsubscribe();
    this.patternPlayback.stopPatternPreview();
  }

  async addMeasure(): Promise<void> {
    const useCopiedMeasure = this.copiedMeasure
      ? await this.dialogService.confirm(
        'Use the copied measure, or create a new empty measure?',
        'Add Measure',
        'Use Copy',
        'New Measure'
      )
      : false;

    this.insertMeasureAtEnd(useCopiedMeasure);
  }

  copyMeasure(measureIndex: number): void {
    const pattern = this.pattern();
    const measure = pattern?.measures[measureIndex];
    if (!pattern || !measure) return;

    this.copiedMeasure = {
      measure: this.cloneMeasure(measure),
      actionGrips: (pattern.actionGrips ?? [])
        .filter(grip => grip.measureIndex === measureIndex)
        .map(grip => ({ ...grip, measureIndex: 0 })),
      useSixteenthSteps: this.measureDisplayStates.get(measureIndex) ?? this.measureRequiresSixteenthSteps(measure)
    };
    this.notificationService.success(`Copied measure ${measureIndex + 1}`);
  }

  private insertMeasureAtEnd(useCopiedMeasure: boolean): void {
    const pattern = this.pattern()
    if (!pattern) return;
    
    const insertIndex = pattern.measures.length;
    const referenceMeasure = pattern.measures[pattern.measures.length - 1];
    const timeSignature: TimeSignature = referenceMeasure?.timeSignature || '4/4';
    const copiedMeasure = useCopiedMeasure ? this.copiedMeasure : undefined;
    const newMeasure = copiedMeasure ? this.cloneMeasure(copiedMeasure.measure) : this.createEmptyMeasure(timeSignature);
    
    const updatedMeasures = [...pattern.measures];
    updatedMeasures.splice(insertIndex, 0, newMeasure);

    const updatedPattern = {
      ...pattern,
      measures: updatedMeasures,
      actionGrips: [
        ...this.shiftMeasureReferencesForInsert(pattern.actionGrips ?? [], insertIndex),
        ...(copiedMeasure?.actionGrips ?? []).map(grip => ({ ...grip, measureIndex: insertIndex }))
      ]
    };
    
    this.measureDisplayStates = this.shiftDisplayStatesForInsert(insertIndex);
    this.measureDisplayStates.set(insertIndex, copiedMeasure?.useSixteenthSteps ?? false);
    
    this.updatePattern(updatedPattern);
  }

  private moveMeasure(fromIndex: number, toIndex: number): void {
    const pattern = this.pattern();
    if (!pattern || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= pattern.measures.length || toIndex >= pattern.measures.length) {
      return;
    }

    const updatedMeasures = [...pattern.measures];
    const [movedMeasure] = updatedMeasures.splice(fromIndex, 1);
    updatedMeasures.splice(toIndex, 0, movedMeasure);

    this.measureDisplayStates = this.moveDisplayState(fromIndex, toIndex);

    this.updatePattern({
      ...pattern,
      measures: updatedMeasures,
      actionGrips: (pattern.actionGrips ?? []).map(grip => ({
        ...grip,
        measureIndex: this.remapMeasureIndexForMove(grip.measureIndex, fromIndex, toIndex)
      }))
    });
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
      actionGrips: (pattern.actionGrips ?? []).flatMap(grip => {
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
          pick: [{ string: 'bass', anchor: 'grip-note', fretOffset: 0 }],
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
      actionGrips: this.filterActionGripsForMeasure(pattern, measureIndex, updatedMeasure)
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
        updatedAction.pick = [{ string: 'bass', anchor: 'grip-note', fretOffset: 0 }];
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
        updatedAction.legato = this.getDefaultLegato(action.technique, 'relative');
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

  // Update pick note relative string with immutable pattern update
  updatePickNoteRelativeString(measureIndex: number, originalIndex: number, noteIndex: number, string: RelativeString): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (action && action.technique === 'pick' && action.pick && action.pick[noteIndex]) {
      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = { ...(updatedPick[noteIndex] as GripRelativePickingNote | BaseRelativePickingNote), string };
      
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

  updateStrumRangeFrom(measureIndex: number, originalIndex: number, from: RelativeString): void {
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

  updateStrumRangeTo(measureIndex: number, originalIndex: number, to: RelativeString): void {
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

  getRelativeStringLabel(string: RelativeString): string {
    switch (string) {
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

  getPickModeForAction(action: PlayingAction): PickMode {
    return getPickMode(action);
  }

  getLegatoModeForAction(action: PlayingAction): LegatoMode {
    return getLegatoMode(action);
  }

  isRelativePickNote(note: PickingNote): note is GripRelativePickingNote | BaseRelativePickingNote {
    return typeof note.string === 'string';
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

  updateLegatoRelativeString(measureIndex: number, originalIndex: number, string: RelativeString): void {
    this.updateAction(measureIndex, originalIndex, action => {
      if (!action || !action.legato || !this.isRelativeLegato(action.legato)) return action;
      return { ...action, legato: { ...action.legato, string } };
    });
  }

  updateLegatoString(measureIndex: number, originalIndex: number, stringValue: number): void {
    this.updateAction(measureIndex, originalIndex, action => {
      if (!action || !action.legato || this.isRelativeLegato(action.legato)) return action;
      return { ...action, legato: { ...action.legato, string: stringValue } };
    });
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

  updateLegatoTargetFretOffset(measureIndex: number, originalIndex: number, fretOffset: number): void {
    this.updateAction(measureIndex, originalIndex, action => {
      if (!action || !action.legato || !this.isRelativeLegato(action.legato) || action.legato.target.anchor !== 'grip-note') return action;
      return { ...action, legato: { ...action.legato, target: { ...action.legato.target, fretOffset } } };
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
      ? { string: 'bass', anchor: 'grip-note', fretOffset: 0 }
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
        string: note.string,
        anchor: 'base-note'
      };
    }

    return {
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

  getActionGrip(measureIndex: number, actionIndex: number): PlayingPatternActionGrip | undefined {
    return this.pattern()?.actionGrips?.find(grip => grip.measureIndex === measureIndex && grip.actionIndex === actionIndex);
  }

  async assignActionGrip(measureIndex: number, actionIndex: number): Promise<void> {
    const pattern = this.pattern();
    if (!pattern) {
      return;
    }

    const selectedGrip = await this.selectGrip(this.getActionGrip(measureIndex, actionIndex)?.name);
    if (selectedGrip === undefined) {
      return;
    }

    this.updatePattern({
      ...pattern,
      actionGrips: selectedGrip ? [
        ...(pattern.actionGrips ?? []).filter(grip => !(grip.measureIndex === measureIndex && grip.actionIndex === actionIndex)),
        {
          measureIndex,
          actionIndex,
          gripId: selectedGrip.gripId,
          name: selectedGrip.name
        }
      ] : (pattern.actionGrips ?? []).filter(grip => !(grip.measureIndex === measureIndex && grip.actionIndex === actionIndex))
    });
  }

  clearMeasureGrips(measureIndex: number): void {
    const pattern = this.pattern();
    if (!pattern) {
      return;
    }

    this.updatePattern({
      ...pattern,
      actionGrips: (pattern.actionGrips ?? []).filter(grip => grip.measureIndex !== measureIndex)
    });
  }

  getActionsForDisplay(measureData: { measure: Measure, measureIndex: number, useSixteenthSteps: boolean }): ActionDisplayData[] {
    const measure = measureData.measure;
    if (!measure) return [];

    const numberOfBeats = getBeatsFromTimeSignature(measure.timeSignature);
    const sixteenthPerBeat = getSixteenthPerBeatFromTimeSignature(measure.timeSignature);
    const totalSixteenths = numberOfBeats * sixteenthPerBeat;
    
    const displayActions: ActionDisplayData[] = [];

    for (let i = 0; i < totalSixteenths; i += measureData.useSixteenthSteps ? 1 : 2) {
      displayActions.push({
        position: (Math.floor(i / sixteenthPerBeat) + 1).toString(),
        action: measure.actions[i] || null,
        originalIndex: i,
        isMainPosition: i % 4 === 0,
        subdivision: this.getActionSubdivision(i)
      });
    }

    return displayActions;
  }

  getActionPositionLabel(actionData: Pick<ActionDisplayData, 'position' | 'subdivision'>): string {
    return `${actionData.position} ${actionData.subdivision.substring(0, 1).toUpperCase()}`;
  }

  // Helper method to determine if a action position should be highlighted (main actions)
  isMainAction(actionIndex: number): boolean {
    // Main actions are typically 1, 5, 9, 13 (every 4th action in 16th note subdivision)
    return actionIndex % 4 === 0;
  }

  // Helper method to determine action subdivision level
  getActionSubdivision(actionIndex: number): ActionSubdivision {
    if (actionIndex % 4 === 0) return 'quarter';
    if (actionIndex % 2 === 0) return 'eighth';
    return 'sixteenth';
  }

  private measureRequiresSixteenthSteps(measure: Measure): boolean {
    return measure.actions.some((action, index) => index % 2 === 1 && !!action);
  }

  private filterActionGripsForMeasure(pattern: PlayingPattern, measureIndex: number, updatedMeasure: Measure): PlayingPatternActionGrip[] {
    return (pattern.actionGrips ?? []).filter(grip => {
      if (grip.measureIndex !== measureIndex) {
        return true;
      }

      return grip.actionIndex >= 0 && grip.actionIndex < updatedMeasure.actions.length;
    });
  }

  private normalizeActionGrips(pattern: PlayingPattern): PlayingPatternActionGrip[] {
    return (pattern.actionGrips ?? []).filter(grip => {
      const measure = pattern.measures[grip.measureIndex];
      return !!measure && grip.actionIndex >= 0 && grip.actionIndex < measure.actions.length;
    });
  }

  private createEmptyMeasure(timeSignature: TimeSignature): Measure {
    const actionLength = getSixteenthPerBeatFromTimeSignature(timeSignature) * getBeatsFromTimeSignature(timeSignature);
    return {
      timeSignature,
      actions: Array(actionLength).fill(null)
    };
  }

  private cloneMeasure(measure: Measure): Measure {
    return {
      ...measure,
      actions: measure.actions.map(action => this.cloneAction(action))
    };
  }

  private cloneAction(action: PlayingAction | null): PlayingAction | null {
    if (!action) {
      return null;
    }

    return {
      ...action,
      modifiers: action.modifiers ? [...action.modifiers] : undefined,
      strum: action.strum ? {
        ...action.strum,
        strings: this.cloneStrumRange(action.strum.strings)
      } : undefined,
      pick: action.pick ? action.pick.map(note => ({ ...note })) : undefined,
      legato: action.legato ? this.cloneLegato(action.legato) : undefined,
      percussive: action.percussive ? { ...action.percussive } : undefined
    };
  }

  private cloneStrumRange(strings: StrumRange): StrumRange {
    if (Array.isArray(strings)) {
      return [...strings];
    }

    if (isRelativeStrumRange(strings)) {
      return { ...strings };
    }

    return strings;
  }

  private cloneLegato(legato: LegatoNote): LegatoNote {
    if (this.isRelativeLegato(legato)) {
      return {
        ...legato,
        target: { ...legato.target }
      };
    }

    return { ...legato };
  }

  private shiftMeasureReferencesForInsert<T extends { measureIndex: number }>(references: T[], insertIndex: number): T[] {
    return references.map(reference => ({
      ...reference,
      measureIndex: reference.measureIndex >= insertIndex ? reference.measureIndex + 1 : reference.measureIndex
    }));
  }

  private shiftDisplayStatesForInsert(insertIndex: number): Map<number, boolean> {
    const updatedDisplayStates = new Map<number, boolean>();
    this.measureDisplayStates.forEach((value, key) => {
      updatedDisplayStates.set(key >= insertIndex ? key + 1 : key, value);
    });
    return updatedDisplayStates;
  }

  private moveDisplayState(fromIndex: number, toIndex: number): Map<number, boolean> {
    const updatedDisplayStates = new Map<number, boolean>();
    this.measureDisplayStates.forEach((value, key) => {
      updatedDisplayStates.set(this.remapMeasureIndexForMove(key, fromIndex, toIndex), value);
    });
    return updatedDisplayStates;
  }

  private remapMeasureIndexForMove(currentIndex: number, fromIndex: number, toIndex: number): number {
    if (currentIndex === fromIndex) {
      return toIndex;
    }

    if (fromIndex < toIndex && currentIndex > fromIndex && currentIndex <= toIndex) {
      return currentIndex - 1;
    }

    if (fromIndex > toIndex && currentIndex >= toIndex && currentIndex < fromIndex) {
      return currentIndex + 1;
    }

    return currentIndex;
  }

  private async selectGrip(name?: string): Promise<PlayingPatternGripReference | null | undefined> {
    const source = await this.openGripSourceSelector();
    if (!source || source.kind === 'cancel') {
      return undefined;
    }

    if (source.kind === 'clear') {
      return null;
    }

    if (source.kind === 'custom') {
      return this.openCustomGripEditor(name);
    }

    const data: GripSelectorModalData = {};
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
      name: chordToString(result.chord)
    };
  }

  private async openGripSourceSelector(): Promise<GripSourceSelectorResult | undefined> {
    const modalRef = this.modalService.show(GripSourceSelectorModalComponent, {
      data: {
        title: 'Set Grip',
        allowSavedGripSelection: false,
        allowClear: true
      },
      width: '420px',
      maxWidth: '95vw',
      closeOnBackdropClick: true
    });

    return modalRef.afterClosed();
  }

  private async openCustomGripEditor(name?: string): Promise<PlayingPatternGripReference | undefined> {
    const modalRef = this.modalService.show(CustomGripEditorModalComponent, {
      data: {
        title: 'Create Custom Grip',
        submitLabel: 'Use Grip',
        initialName: name
      },
      width: '95vw',
      maxWidth: '720px',
      maxHeight: '90vh',
      closeOnBackdropClick: true
    });

    const result = await modalRef.afterClosed();
    if (!result) {
      return undefined;
    }

    return this.toGripReference(result);
  }

  private toGripReference(result: CustomGripEditorResult): PlayingPatternGripReference {
    return {
      gripId: serializeGrip(result.grip),
      name: result.name
    };
  }
}
