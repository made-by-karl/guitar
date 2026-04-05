import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayingAction } from '@/app/features/patterns/services/playing-patterns.model';

@Component({
  selector: 'app-playing-actions',
  imports: [CommonModule],
  templateUrl: './playing-actions.component.html',
  styleUrl: './playing-actions.component.scss'
})
export class PlayingActionsComponent {
  actions = input.required<(PlayingAction | null)[]>();
  showActionIndex = input<boolean>(false);
}
