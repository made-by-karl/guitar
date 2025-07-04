import { Component } from '@angular/core';
import { CommonModule, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RhythmPatternsService } from '../../services/rhythm-patterns.service';
import { RhythmPattern, RhythmStep, PickingNote, BeatTiming, RhythmModifier } from '../../services/rhythm-patterns.model';
import { MidiService } from '../../services/midi.service';
import { SongSheetsService } from '../../services/song-sheets.service';

@Component({
  selector: 'app-rhythm-patterns',
  standalone: true,
  imports: [CommonModule, FormsModule, NgForOf, NgIf],
  templateUrl: './rhythm-patterns.component.html',
  styleUrls: ['./rhythm-patterns.component.scss']
})
export class RhythmPatternsComponent {
  patterns: RhythmPattern[] = [];
  search = '';
  editing: boolean = false;
  draftPattern: RhythmPattern | null = null;
  isNew: boolean = false;

  constructor(
    public service: RhythmPatternsService,
    private midi: MidiService,
    public songSheets: SongSheetsService
  ) {
    this.load();
  }

  load() {
    this.patterns = this.service.getAll();
  }

  startCreate() {
    this.editing = true;
    this.isNew = true;
    this.draftPattern = {
      id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      name: '',
      description: '',
      category: '',
      timeSignature: '4/4',
      tempo: 100,
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCustom: true
    };
  }

  startEdit(pattern: RhythmPattern) {
    this.editing = true;
    this.isNew = false;
    this.draftPattern = { ...pattern, steps: pattern.steps.map(s => ({ ...s })) };
  }

  cancelEdit() {
    this.editing = false;
    this.draftPattern = null;
    this.isNew = false;
  }

  saveDraft() {
    if (!this.draftPattern) return;
    this.draftPattern.updatedAt = Date.now();
    if (this.isNew) {
      this.service.add(this.draftPattern);
    } else {
      this.service.update(this.draftPattern);
    }
    this.load();
    this.editing = false;
    this.draftPattern = null;
    this.isNew = false;
  }

  async previewDraft() {
    if (this.draftPattern) {
      await this.playPattern(this.draftPattern);
    }
  }

  addStep() {
    if (!this.draftPattern) return;
    this.draftPattern.steps.push({ 
      technique: 'strum', 
      direction: 'D', 
      beat: 1, 
      timing: 'on-beat', 
      strum: { strings: 'all' },
      modifiers: []
    });
  }

  onStepTechniqueChange(i: number) {
    if (!this.draftPattern) return;
    const step = this.draftPattern.steps[i];
    
    if (step.technique === 'strum') {
      // Ensure strum pattern exists
      if (!step.strum) {
        step.strum = { strings: 'all' };
      }
      // Set default direction for strumming
      if (step.direction !== 'D' && step.direction !== 'U') {
        step.direction = 'D';
      }
      // Remove pick array if switching from pick to strum
      delete step.pick;
    } else if (step.technique === 'pick') {
      // Ensure pick array exists
      if (!step.pick) {
        step.pick = [{ string: 0, fret: 0 }];
      }
      // Remove direction for picking
      step.direction = null;
      // Remove strum pattern if switching from strum to pick
      delete step.strum;
    } else {
      // For other techniques (rest, percussive), clear direction and patterns
      step.direction = null;
      delete step.strum;
      delete step.pick;
    }
    
    // Ensure modifiers array exists for strum and pick
    if (step.technique === 'strum' || step.technique === 'pick') {
      if (!step.modifiers) {
        step.modifiers = [];
      }
    } else {
      // Remove modifiers for non-applicable techniques
      delete step.modifiers;
    }
  }

  removeStep(idx: number) {
    if (!this.draftPattern) return;
    this.draftPattern.steps.splice(idx, 1);
  }

  get filteredPatterns() {
    if (!this.search.trim()) return this.patterns;
    const q = this.search.toLowerCase();
    return this.patterns.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }

  get pinnedSheet() {
    return this.songSheets.getPinnedSongSheet();
  }

  async playPattern(pattern: RhythmPattern) {
    if (!pattern.steps) {
      console.error('Pattern has no steps:', pattern);
      return;
    }
    const interval = 60000 / pattern.tempo;
    for (const step of pattern.steps) {
      if (step.technique === 'strum' && step.strum) {
        // For demo: play a chord on the specified string range
        const all = ['0', '0', '1', '2', '2', '0'];
        let positions: string[];
        
        if (typeof step.strum.strings === 'string') {
          // Handle named string ranges
          switch (step.strum.strings) {
            case 'all': positions = all; break;
            case 'bass': positions = all.map((f, i) => i < 3 ? f : 'x'); break;
            case 'treble': positions = all.map((f, i) => i >= 3 ? f : 'x'); break;
            case 'middle': positions = all.map((f, i) => i >= 1 && i <= 4 ? f : 'x'); break;
            case 'power': positions = all.map((f, i) => i <= 3 ? f : 'x'); break;
            default: positions = all;
          }
        } else if (Array.isArray(step.strum.strings)) {
          // Handle specific string indices
          positions = all.map((f, i) => (step.strum!.strings as number[]).includes(5 - i) ? f : 'x');
        } else {
          positions = all;
        }
        
        // Apply modifiers for playback (could adjust volume, timbre, etc.)
        // For now, just play the chord normally
        await this.midi.generateAndPlayChord(positions);
      } else if (step.technique === 'pick' && step.pick) {
        // For picking, play individual notes
        for (const note of step.pick) {
          const positions = Array(6).fill('x');
          positions[5 - note.string] = note.fret.toString();
          await this.midi.generateAndPlayChord(positions);
        }
      }
      // Wait for next step
      await new Promise(res => setTimeout(res, interval));
    }
  }

  addToPinnedSheet(pattern: RhythmPattern) {
    const pinned = this.pinnedSheet;
    if (!pinned) return;
    const already = pinned.patterns?.find(p => p.pattern.id === pattern.id);
    if (already) return;
    this.songSheets.addPattern({
      id: 'pattern-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      pattern,
      section: '',
      chordName: ''
    });
    this.songSheets.getById(pinned.id); // refresh
  }

  removeFromPinnedSheet(pattern: RhythmPattern) {
    const pinned = this.pinnedSheet;
    if (!pinned) return;
    const entry = pinned.patterns?.find(p => p.pattern.id === pattern.id);
    if (entry) {
      this.songSheets.removePattern(pinned.id, entry.id);
      this.songSheets.getById(pinned.id); // refresh
    }
  }

  isPatternInPinnedSheet(pattern: RhythmPattern): boolean {
    const pinned = this.pinnedSheet;
    return !!(pinned && pinned.patterns?.some(p => p.pattern.id === pattern.id));
  }

  deletePattern(pattern: RhythmPattern) {
    if (confirm('Delete this pattern?')) {
      this.service.delete(pattern.id);
      this.load();
    }
  }

  moveStepUp(i: number) {
    if (!this.draftPattern || i <= 0) return;
    // Swap steps and create a new array for change detection
    const steps = [...this.draftPattern.steps];
    [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
    this.draftPattern.steps = steps;
  }

  moveStepDown(i: number) {
    if (!this.draftPattern || i >= this.draftPattern.steps.length - 1) return;
    // Swap steps and create a new array for change detection
    const steps = [...this.draftPattern.steps];
    [steps[i], steps[i + 1]] = [steps[i + 1], steps[i]];
    this.draftPattern.steps = steps;
  }

  trackByStepIndex(index: number, step: any) {
    return index;
  }

  // Methods for handling picking notes
  addPickingNote(stepIndex: number) {
    if (!this.draftPattern) return;
    const step = this.draftPattern.steps[stepIndex];
    if (step.technique === 'pick') {
      if (!step.pick) {
        step.pick = [];
      }
      step.pick.push({ string: 0, fret: 0 });
    }
  }

  removePickingNote(stepIndex: number, noteIndex: number) {
    if (!this.draftPattern) return;
    const step = this.draftPattern.steps[stepIndex];
    if (step.technique === 'pick' && step.pick) {
      step.pick.splice(noteIndex, 1);
    }
  }

  // Helper method to get available timing options
  getTimingOptions(): { value: BeatTiming; label: string }[] {
    return [
      { value: 'on-beat', label: 'On Beat' },
      { value: 'quarter-past', label: '1/4 Past' },
      { value: 'half-past', label: '1/2 Past (&)' },
      { value: 'three-quarter-past', label: '3/4 Past' }
    ];
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

  // Helper method to toggle modifier
  toggleModifier(stepIndex: number, modifier: RhythmModifier) {
    if (!this.draftPattern) return;
    const step = this.draftPattern.steps[stepIndex];
    if (!step.modifiers) {
      step.modifiers = [];
    }
    
    const index = step.modifiers.indexOf(modifier);
    if (index > -1) {
      step.modifiers.splice(index, 1);
    } else {
      step.modifiers.push(modifier);
    }
  }

  // Helper method to check if modifier is active
  hasModifier(step: RhythmStep, modifier: RhythmModifier): boolean {
    return step.modifiers?.includes(modifier) || false;
  }
}
