import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-measure-selection-bar', standalone: true,
  template: `
    <div class="app-selection-actions" role="region" aria-label="Selected measures actions">
      <div class="app-selection-header">
        <strong class="app-selection-label" role="status">{{ count() }} {{ count() === 1 ? 'measure' : 'measures' }} selected</strong>
        <button class="btn app-icon-button app-selection-close" type="button" aria-label="Exit measure selection" title="Exit measure selection" (click)="exitSelection.emit()"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
      </div>
      <div class="app-selection-buttons">
        <div class="app-selection-commands"><button class="btn btn-outline-secondary app-icon-button" type="button" aria-label="Copy selected measures" title="Copy selected measures" (click)="copySelection.emit()"><i class="bi bi-copy" aria-hidden="true"></i></button></div>
        <button class="btn btn-outline-danger app-icon-button" type="button" aria-label="Delete selected measures" title="Delete selected measures" [disabled]="locked()" (click)="deleteSelection.emit()"><i class="bi bi-trash" aria-hidden="true"></i></button>
      </div>
    </div>`,
  styles: [':host { display: block; position: sticky; bottom: .5rem; z-index: 5; width: 100%; }']
})
export class MeasureSelectionBarComponent {
  readonly count = input.required<number>();
  readonly locked = input(false);
  readonly copySelection = output<void>();
  readonly deleteSelection = output<void>();
  readonly exitSelection = output<void>();
}
