import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RhythmAction } from '@/app/features/patterns/services/rhythm-patterns.model';

@Component({
  selector: 'app-rhythm-actions',
  imports: [CommonModule],
  templateUrl: './rhythm-actions.component.html',
  styleUrl: './rhythm-actions.component.scss'
})
export class RhythmActionsComponent {
  actions = input.required<(RhythmAction | null)[]>();
  showActionIndex = input<boolean>(false);
}
