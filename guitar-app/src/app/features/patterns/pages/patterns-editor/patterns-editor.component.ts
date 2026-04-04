import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { RhythmPattern } from '@/app/features/patterns/services/rhythm-patterns.model';
import { RhythmPatternsService } from '@/app/features/patterns/services/rhythm-patterns.service';
import { RhythmPatternEditorComponent } from '@/app/features/patterns/ui/rhythm-pattern-editor/rhythm-pattern-editor.component';

@Component({
  selector: 'app-patterns-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, RhythmPatternEditorComponent],
  templateUrl: './patterns-editor.component.html',
  styleUrls: ['./patterns-editor.component.scss']
})
export class PatternsEditorComponent {
  pattern?: RhythmPattern;

  constructor(
    private patternsService: RhythmPatternsService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    void this.load();
  }

  private async load() {
    const id = this.route.snapshot.queryParamMap.get('id');

    if (id) {
      const existing = await this.patternsService.getById(id);
      if (existing) {
        this.pattern = structuredClone(existing);
        return;
      }
    }

    this.pattern = {
      id: Date.now().toString(),
      name: '',
      description: '',
      category: '',
      measures: [
        {
          timeSignature: '4/4',
          actions: Array(16).fill(null)
        }
      ],
      beatGrips: [],
      actionGripOverrides: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCustom: true
    };
  }

  async save() {
    if (!this.pattern) return;

    const edited = this.pattern;

    const existing = await this.patternsService.getById(edited.id);
    if (existing) {
      await this.patternsService.update(edited);
    } else {
      await this.patternsService.add(edited);
    }

    await this.router.navigate(['/patterns']);
  }

  async cancel() {
    await this.router.navigate(['/patterns']);
  }
}
