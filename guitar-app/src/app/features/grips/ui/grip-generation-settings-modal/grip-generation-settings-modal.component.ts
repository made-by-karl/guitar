import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MODAL_REF, ModalComponent, ModalRef } from '@/app/core/services/modal.service';
import type { DissonanceProfile, GripGeneratorOptions } from '@/app/features/grips/services/grips/grip-generator.service';

export interface GripGenerationSettingsModalData {
  settings: GripGeneratorOptions;
  dissonanceProfiles: { value: DissonanceProfile; label: string }[];
}

@Component({
  selector: 'app-grip-generation-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './grip-generation-settings-modal.component.html',
  styleUrls: ['./grip-generation-settings-modal.component.scss']
})
export class GripGenerationSettingsModalComponent implements ModalComponent<GripGeneratorOptions | undefined> {
  settings: GripGeneratorOptions = {
    minFretToConsider: 1,
    maxFretToConsider: 12,
    minimalPlayableStrings: 3,
    allowBarre: true,
    allowInversions: false,
    allowIncompleteChords: false,
    allowMutedStringsInside: false,
    allowDuplicateNotes: false,
    dissonanceProfile: 'neutral'
  };

  dissonanceProfiles: { value: DissonanceProfile; label: string }[] = [];

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<GripGeneratorOptions | undefined>
  ) {}

  initialize(data: GripGenerationSettingsModalData) {
    this.settings = { ...data.settings };
    this.dissonanceProfiles = data.dissonanceProfiles;
  }

  onCancel() {
    this.modalRef.close(undefined);
  }

  onApply() {
    this.modalRef.close({ ...this.settings });
  }
}
