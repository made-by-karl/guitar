import { Component, computed, model, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RhythmPattern, RhythmAction, RhythmModifier, TimeSignature, Measure, getBeatsFromTimeSignature, getSixteenthPerBeatFromTimeSignature } from '../../services/rhythm-patterns.model';
import { PlaybackService } from 'app/services/playback.service';

type TechniqueType = 'strum-down' | 'strum-up' | 'pick' | 'percussive' | 'hammer-on' | 'pull-off' | 'slide' | 'rest';

@Component({
  selector: 'app-rhythm-pattern-editor',
  imports: [CommonModule, FormsModule],
  templateUrl: './rhythm-pattern-editor.component.html',
  styleUrl: './rhythm-pattern-editor.component.scss'
})
export class RhythmPatternEditorComponent implements OnDestroy {

  pattern = model.required<RhythmPattern>();
  
  // Internal display model to manage UI state per measure
  private measureDisplayStates = new Map<number, boolean>();

  // Use a computed signal that recalculates when pattern changes
  measuresForDisplay = computed(() => {
    const pattern = this.pattern();
    // Ensure we have display states for all measures
    this.ensureDisplayStates(pattern);
    return this.getMeasuresForDisplay(pattern);
  });

  constructor(
    private playback: PlaybackService
  ) {}

  playPattern(): void {
    const pattern = this.pattern()
    if (!pattern) return;
    
    this.playback.playRhythmPattern(pattern);
  }

  private updatePattern(updatedPattern: RhythmPattern) {
    // Update the pattern signal
    this.pattern.set({
      ...updatedPattern,
      updatedAt: Date.now()
    });
  }

  ngOnDestroy(): void {
    // Clean up display states
    this.measureDisplayStates.clear();
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
      measures: [...pattern.measures, newMeasure]
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
      measures: updatedMeasures
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
          direction: 'D',
          strum: { strings: 'all' },
          modifiers: []
        };
        break;
      case 'strum-up':
        newAction = {
          technique: 'strum',
          direction: 'U',
          strum: { strings: 'all' },
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
          technique: 'percussive'
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
          direction: 'D',
          strum: { strings: 'all' },
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
      measures: updatedMeasures
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
        updatedAction.strum = { strings: 'all' };
      }
      // Set default direction for strumming
      if (updatedAction.direction !== 'D' && updatedAction.direction !== 'U') {
        updatedAction.direction = 'D';
      }
      // Remove pick array if switching from pick to strum
      delete updatedAction.pick;
    } else if (action.technique === 'pick') {
      // Ensure pick array exists
      if (!updatedAction.pick) {
        updatedAction.pick = [{ string: 0, fret: 0 }];
      }
      // Remove direction for picking
      updatedAction.direction = null;
      // Remove strum pattern if switching from strum to pick
      delete updatedAction.strum;
    } else {
      // For other techniques (rest, percussive), clear direction and patterns
      updatedAction.direction = null;
      delete updatedAction.strum;
      delete updatedAction.pick;
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
    if (action && action.technique === 'strum') {
      const updatedAction: RhythmAction = {
        ...action,
        direction: direction
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
    return [
      { value: '2/4', label: '2/4' },
      { value: '3/4', label: '3/4' },
      { value: '4/4', label: '4/4' },
      { value: '5/4', label: '5/4' },
      { value: '6/8', label: '6/8' },
      { value: '7/8', label: '7/8' },
      { value: '9/8', label: '9/8' },
      { value: '12/8', label: '12/8' }
    ];
  }

  // Change time signature for a specific measure
  changeTimeSignature(measureIndex: number, newTimeSignature: TimeSignature): void {
    const pattern = this.pattern();
    if (!pattern || !pattern.measures[measureIndex]) return;
    
    const measure = pattern.measures[measureIndex];
    const oldTimeSignature = measure.timeSignature;
    
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
}
