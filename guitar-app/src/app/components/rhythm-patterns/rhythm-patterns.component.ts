import { Component } from '@angular/core';
import { CommonModule, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RhythmPatternsService } from '../../services/rhythm-patterns.service';
import { RhythmPattern } from '../../services/rhythm-patterns.model';
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
  selectedPattern: RhythmPattern | null = null;
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
    // Ensure all step.strings are arrays of numbers
    this.draftPattern.steps = this.draftPattern.steps.map(step => {
      let strings: any = step.strings;
      if (typeof strings === 'string') {
        strings = (strings as string).split(/[\s,]+/).map((s: string) => parseInt(s, 10)).filter((n: number) => !isNaN(n));
      } else if (typeof strings === 'number') {
        strings = [strings];
      }
      return { ...step, strings };
    });
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
    this.draftPattern.steps.push({ technique: 'strum', direction: 'D', strings: [6,5,4,3,2,1] });
  }

  onStepTechniqueChange(i: number) {
    if (!this.draftPattern) return;
    const step = this.draftPattern.steps[i];
    if (step.technique !== 'strum') {
      step.direction = null;
    } else if (step.direction !== 'D' && step.direction !== 'U') {
      step.direction = 'D';
    }
  }

  removeStep(idx: number) {
    if (!this.draftPattern) return;
    this.draftPattern.steps.splice(idx, 1);
  }

  selectPattern(pattern: RhythmPattern) {
    this.selectedPattern = pattern;
  }

  clearSelection() {
    this.selectedPattern = null;
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
      if (step.technique === 'strum' || step.technique === 'pick') {
        // For demo: play a chord, but only on the specified strings
        // (In a real app, you'd play the actual notes for the selected strings)
        // Here, we just play E major open, muting all but the selected strings
        const all = ['0', '0', '1', '2', '2', '0'];
        const positions = all.map((f, i) => step.strings.includes(6 - i) ? f : 'x');
        await this.midi.generateAndPlayChord(positions);
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
      if (this.selectedPattern?.id === pattern.id) {
        this.selectedPattern = null;
      }
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
}
