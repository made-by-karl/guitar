import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { PlayingPatternsService } from '@/app/features/patterns/services/playing-patterns.service';
import { PlayingPatternEditorComponent } from '@/app/features/patterns/ui/playing-pattern-editor/playing-pattern-editor.component';

@Component({
  selector: 'app-patterns-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PlayingPatternEditorComponent],
  templateUrl: './patterns-editor.component.html',
  styleUrls: ['./patterns-editor.component.scss']
})
export class PatternsEditorComponent {
  pattern?: PlayingPattern;

  constructor(
    private patternsService: PlayingPatternsService,
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
