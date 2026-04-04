import { Component, computed, model, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  RhythmPattern,
  RhythmAction,
  RhythmModifier,
  Measure,
  RhythmPatternActionGripOverride,
  RhythmPatternBeatGrip,
  RhythmPatternGripReference,
  getBeatsFromTimeSignature,
  getSixteenthPerBeatFromTimeSignature
} from '@/app/features/patterns/services/rhythm-patterns.model';
import { parseTimeSignature, TIME_SIGNATURES, TimeSignature, timeSignatureLabel } from '@/app/core/music/rhythm/time-signature.model';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { Subscription } from 'rxjs';
import { ModalService } from '@/app/core/services/modal.service';
import { GripSelectorModalComponent, GripSelectorModalData } from '@/app/features/grips/ui/grip-selector-modal/grip-selector-modal.component';
import { stringifyGrip, TunedGrip } from '@/app/features/grips/services/grips/grip.model';
import { chordToString } from '@/app/core/music/chords';

type TechniqueType = 'strum-down' | 'strum-up' | 'pick' | 'percussive' | 'hammer-on' | 'pull-off' | 'slide' | 'rest';

@Component({
  selector: 'app-rhythm-pattern-editor',
  imports: [CommonModule, FormsModule],
  templateUrl: './rhythm-pattern-editor.component.html',
  styleUrl: './rhythm-pattern-editor.component.scss'
})
export class RhythmPatternEditorComponent implements OnDestroy {

  pattern = model.required<RhythmPattern>();
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

  private updatePattern(updatedPattern: RhythmPattern) {
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
    
    let newAction: RhythmAction;
    
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
          pick: [{ string: 0, fret: 0 }],
          modifiers: []
        };
        break;
      case 'percussive':
        newAction = {
          technique: 'percussive',
          percussive: { technique: 'body-knock' }
        };
        break;
      case 'rest':
        newAction = {
          technique: 'rest'
        };
        break;
      default:
        // For hammer-on, pull-off, slide - use basic strum for now
        newAction = {
          technique: 'strum',
          strum: { direction: 'D', strings: 'all' },
          modifiers: []
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
    
    const updatedPattern: RhythmPattern = {
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
    
    let updatedAction: RhythmAction = { ...action };
    
    if (action.technique === 'strum') {
      // Ensure strum pattern exists
      if (!updatedAction.strum) {
        updatedAction.strum = { direction: 'D', strings: 'all' };
      }

      // Remove pick array and percussive if switching from pick/percussive to strum
      delete updatedAction.pick;
      delete updatedAction.percussive;
    } else if (action.technique === 'pick') {
      // Ensure pick array exists
      if (!updatedAction.pick) {
        updatedAction.pick = [{ string: 0, fret: 0 }];
      }

      // Remove strum pattern and percussive if switching from strum/percussive to pick
      delete updatedAction.strum;
      delete updatedAction.percussive;
    } else if (action.technique === 'percussive') {
      // Ensure percussive object exists
      if (!updatedAction.percussive) {
        updatedAction.percussive = { technique: 'body-knock' };
      }

      // Remove strum and pick for percussive
      delete updatedAction.strum;
      delete updatedAction.pick;
    } else {
      // Remove strum, pick, and percussive for other techniques
      delete updatedAction.strum;
      delete updatedAction.pick;
      delete updatedAction.percussive;
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
    
    const updatedPattern: RhythmPattern = {
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
    
    const updatedPattern: RhythmPattern = {
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
      const updatedAction: RhythmAction = {
        ...action,
        pick: [...currentPick, { string: 0, fret: 0 }]
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
      
      const updatedPattern: RhythmPattern = {
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
      
      const updatedAction: RhythmAction = {
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
      
      const updatedPattern: RhythmPattern = {
        ...pattern,
        measures: updatedMeasures
      };
      
      this.updatePattern(updatedPattern);
    }
  }

  // Update pick note string with immutable pattern update
  updatePickNoteString(measureIndex: number, originalIndex: number, noteIndex: number, stringValue: number): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (action && action.technique === 'pick' && action.pick && action.pick[noteIndex]) {
      const updatedPick = [...action.pick];
      updatedPick[noteIndex] = { ...updatedPick[noteIndex], string: stringValue };
      
      const updatedAction: RhythmAction = {
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
      
      const updatedPattern: RhythmPattern = {
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
      updatedPick[noteIndex] = { ...updatedPick[noteIndex], fret: fretValue };
      
      const updatedAction: RhythmAction = {
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
      
      const updatedPattern: RhythmPattern = {
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
      const updatedAction: RhythmAction = {
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
      
      const updatedPattern: RhythmPattern = {
        ...pattern,
        measures: updatedMeasures
      };
      
      this.updatePattern(updatedPattern);
    }
  }

  // Update strum strings with immutable pattern update
  updateStrumStrings(measureIndex: number, originalIndex: number, strings: string): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (action && action.technique === 'strum' && action.strum) {
      const updatedAction: RhythmAction = {
        ...action,
        strum: {
          ...action.strum,
          strings: strings as any
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
      
      const updatedPattern: RhythmPattern = {
        ...pattern,
        measures: updatedMeasures
      };
      
      this.updatePattern(updatedPattern);
    }
  }

  // Update percussion technique with immutable pattern update
  updatePercussionTechnique(measureIndex: number, originalIndex: number, technique: 'body-knock' | 'string-slap'): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (action && action.technique === 'percussive') {
      const updatedAction: RhythmAction = {
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
      
      const updatedPattern: RhythmPattern = {
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

  // Helper method to get available modifiers
  getAvailableModifiers(): { value: RhythmModifier; label: string }[] {
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
    
    let newActions: (RhythmAction | null)[];
    
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
    
    const updatedPattern: RhythmPattern = {
      ...pattern,
      measures: updatedMeasures
    };
    
    // Reset subdivision display state when time signature changes
    this.measureDisplayStates.set(measureIndex, false);
    
    this.updatePattern(updatedPattern);
  }

  // Helper method to toggle modifier
  toggleModifier(measureIndex: number, originalIndex: number, modifier: RhythmModifier): void {
    const pattern = this.pattern()
    if (!pattern || !pattern.measures[measureIndex] || originalIndex < 0 || originalIndex >= pattern.measures[measureIndex].actions.length) return;
    const action = pattern.measures[measureIndex].actions[originalIndex];
    if (!action) return;
    
    const currentModifiers = action.modifiers || [];
    const index = currentModifiers.indexOf(modifier);
    
    let updatedModifiers: RhythmModifier[];
    if (index > -1) {
      updatedModifiers = currentModifiers.filter(m => m !== modifier);
    } else {
      updatedModifiers = [...currentModifiers, modifier];
    }
    
    const updatedAction: RhythmAction = {
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
    
    const updatedPattern: RhythmPattern = {
      ...pattern,
      measures: updatedMeasures
    };
    
    this.updatePattern(updatedPattern);
  }

  // Helper method to check if modifier is active
  hasModifier(action: RhythmAction, modifier: RhythmModifier): boolean {
    return action.modifiers?.includes(modifier) || false;
  }

  // Ensure we have display states initialized for all measures
  private ensureDisplayStates(pattern: RhythmPattern): void {
    if (!pattern || !pattern.measures) return;
    
    pattern.measures.forEach((_, index) => {
      if (!this.measureDisplayStates.has(index)) {
        this.measureDisplayStates.set(index, false);
      }
    });
  }

  getMeasuresForDisplay(pattern: RhythmPattern): { measure: Measure, measureIndex: number, useSixteenthSteps: boolean }[] {
    if (!pattern || !pattern.measures) return [];

    return pattern.measures.map((m, i) => ({ 
      measure: m, 
      measureIndex: i,
      useSixteenthSteps: this.measureDisplayStates.get(i) ?? false 
    }));
  }

  toggleSixteenthSteps(measureIndex: number): void {
    const current = this.measureDisplayStates.get(measureIndex) ?? false;
    this.measureDisplayStates.set(measureIndex, !current);
    
    // Force the computed signal to recalculate by creating a new pattern reference
    const currentPattern = this.pattern();
    this.pattern.set({ ...currentPattern });
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

  getBeatGrip(measureIndex: number, beatIndex: number): RhythmPatternBeatGrip | undefined {
    return this.pattern()?.beatGrips?.find(grip => grip.measureIndex === measureIndex && grip.beatIndex === beatIndex);
  }

  getActionGrip(measureIndex: number, actionIndex: number): RhythmPatternActionGripOverride | undefined {
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

  getActionsForDisplay(measureData: { measure: Measure, measureIndex: number, useSixteenthSteps: boolean }): { position: string; action: RhythmAction | null; originalIndex: number; isMainPosition: boolean; subdivision: 'quarter' | 'eighth' | 'sixteenth' }[] {
    const measure = measureData.measure;
    if (!measure) return [];

    const numberOfBeats = getBeatsFromTimeSignature(measure.timeSignature);
    const sixteenthPerBeat = getSixteenthPerBeatFromTimeSignature(measure.timeSignature);
    const totalSixteenths = numberOfBeats * sixteenthPerBeat;
    
    const displayActions: { position: string; action: RhythmAction | null; originalIndex: number; isMainPosition: boolean; subdivision: 'quarter' | 'eighth' | 'sixteenth' }[] = [];

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

  private filterBeatGripsForMeasure(pattern: RhythmPattern, measureIndex: number, updatedMeasure: Measure): RhythmPatternBeatGrip[] {
    return (pattern.beatGrips ?? []).filter(grip => {
      if (grip.measureIndex !== measureIndex) {
        return true;
      }

      return grip.beatIndex >= 0 && grip.beatIndex < getBeatsFromTimeSignature(updatedMeasure.timeSignature);
    });
  }

  private filterActionGripsForMeasure(pattern: RhythmPattern, measureIndex: number, updatedMeasure: Measure): RhythmPatternActionGripOverride[] {
    return (pattern.actionGripOverrides ?? []).filter(grip => {
      if (grip.measureIndex !== measureIndex) {
        return true;
      }

      return grip.actionIndex >= 0 && grip.actionIndex < updatedMeasure.actions.length;
    });
  }

  private normalizeBeatGrips(pattern: RhythmPattern): RhythmPatternBeatGrip[] {
    return (pattern.beatGrips ?? []).filter(grip => {
      const measure = pattern.measures[grip.measureIndex];
      return !!measure && grip.beatIndex >= 0 && grip.beatIndex < getBeatsFromTimeSignature(measure.timeSignature);
    });
  }

  private normalizeActionGripOverrides(pattern: RhythmPattern): RhythmPatternActionGripOverride[] {
    return (pattern.actionGripOverrides ?? []).filter(grip => {
      const measure = pattern.measures[grip.measureIndex];
      return !!measure && grip.actionIndex >= 0 && grip.actionIndex < measure.actions.length;
    });
  }

  private async selectGrip(chordName?: string): Promise<RhythmPatternGripReference | null | undefined> {
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
      gripId: stringifyGrip(result.grips[0] as TunedGrip),
      chordName: chordToString(result.chord)
    };
  }
}
