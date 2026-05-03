import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MODAL_DATA,
  MODAL_REF,
  ModalComponent,
  ModalDataComponent,
  ModalRef
} from '@/app/core/services/modal.service';
import { GripDiagramComponent } from '@/app/core/ui/grip-diagram/grip-diagram.component';
import { Grip, GripString } from '@/app/features/grips/services/grips/grip.model';

type CustomGripStringMode = 'muted' | 'open' | 'single' | 'barre';

interface CustomGripStringState {
  label: string;
  mode: CustomGripStringMode;
  fret: number;
}

export interface CustomGripEditorModalData {
  title?: string;
  submitLabel?: string;
  initialName?: string;
  initialGrip?: Grip;
}

export interface CustomGripEditorResult {
  name: string;
  grip: Grip;
}

@Component({
  selector: 'app-custom-grip-editor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, GripDiagramComponent],
  templateUrl: './custom-grip-editor-modal.component.html',
  styleUrl: './custom-grip-editor-modal.component.scss'
})
export class CustomGripEditorModalComponent
  implements ModalComponent<CustomGripEditorResult>, ModalDataComponent<CustomGripEditorModalData> {
  readonly modeOptions: { value: CustomGripStringMode; label: string }[] = [
    { value: 'muted', label: 'Muted' },
    { value: 'open', label: 'Open' },
    { value: 'single', label: 'Single Press' },
    { value: 'barre', label: 'Barre' }
  ];

  readonly stringStates: CustomGripStringState[];
  name: string;

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<CustomGripEditorResult>,
    @Inject(MODAL_DATA) public data: CustomGripEditorModalData
  ) {
    this.name = data.initialName ?? '';
    this.stringStates = this.createInitialStates(data.initialGrip);
  }

  get title(): string {
    return this.data.title ?? 'Create Custom Grip';
  }

  get submitLabel(): string {
    return this.data.submitLabel ?? 'Save Grip';
  }

  get previewGrip(): Grip {
    return {
      strings: this.buildGripStrings()
    };
  }

  get canSave(): boolean {
    return this.name.trim().length > 0 &&
      this.stringStates.some(state => state.mode !== 'muted') &&
      this.stringStates.every(state => !this.requiresFret(state.mode) || Number.isInteger(state.fret) && state.fret > 0);
  }

  updateMode(state: CustomGripStringState, mode: CustomGripStringMode): void {
    state.mode = mode;
    if (this.requiresFret(mode) && state.fret < 1) {
      state.fret = 1;
    }
  }

  updateFret(state: CustomGripStringState, fret: number): void {
    state.fret = this.normalizeFret(fret);
  }

  save(): void {
    if (!this.canSave) {
      return;
    }

    this.modalRef.close({
      name: this.name.trim(),
      grip: this.previewGrip
    });
  }

  cancel(): void {
    this.modalRef.close(undefined);
  }

  requiresFret(mode: CustomGripStringMode): boolean {
    return mode === 'single' || mode === 'barre';
  }

  private createInitialStates(grip?: Grip): CustomGripStringState[] {
    const labels = ['Low E', 'A', 'D', 'G', 'B', 'High E'];
    return labels.map((label, index) => this.createStateForString(label, grip?.strings[index]));
  }

  private createStateForString(label: string, stringValue?: GripString): CustomGripStringState {
    if (!stringValue || stringValue === 'x') {
      return { label, mode: 'muted', fret: 1 };
    }

    if (stringValue === 'o') {
      return { label, mode: 'open', fret: 1 };
    }

    const primaryEntry = [...stringValue].sort((a, b) => b.fret - a.fret)[0];
    return {
      label,
      mode: stringValue.some(entry => entry.isPartOfBarre) ? 'barre' : 'single',
      fret: primaryEntry?.fret ?? 1
    };
  }

  private buildGripStrings(): GripString[] {
    const strings = this.stringStates.map(state => {
      if (state.mode === 'muted') {
        return 'x';
      }

      if (state.mode === 'open') {
        return 'o';
      }

      return [{ fret: this.normalizeFret(state.fret) }];
    }) as GripString[];

    const barreIndicesByFret = new Map<number, number[]>();
    this.stringStates.forEach((state, index) => {
      if (state.mode !== 'barre') {
        return;
      }

      const fret = this.normalizeFret(state.fret);
      const indices = barreIndicesByFret.get(fret) ?? [];
      indices.push(index);
      barreIndicesByFret.set(fret, indices);
    });

    barreIndicesByFret.forEach((indices, fret) => {
      for (const group of this.groupContiguousIndices(indices)) {
        if (group.length < 2) {
          continue;
        }

        for (const stringIndex of group) {
          strings[stringIndex] = [{
            fret,
            isPartOfBarre: true
          }];
        }
      }
    });

    return strings;
  }

  private groupContiguousIndices(indices: number[]): number[][] {
    if (indices.length === 0) {
      return [];
    }

    const sorted = [...new Set(indices)].sort((a, b) => a - b);
    const groups: number[][] = [[sorted[0]]];

    for (let index = 1; index < sorted.length; index++) {
      const current = sorted[index];
      const activeGroup = groups[groups.length - 1];
      if (current === activeGroup[activeGroup.length - 1] + 1) {
        activeGroup.push(current);
      } else {
        groups.push([current]);
      }
    }

    return groups;
  }

  private normalizeFret(fret: number): number {
    return Math.max(1, Math.round(Number.isFinite(fret) ? fret : 1));
  }
}
