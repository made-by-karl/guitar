import { CommonModule } from '@angular/common';
import { Component, TemplateRef, ViewChild, ViewContainerRef, forwardRef } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Chord } from 'app/common/chords';
import {
  canAddModifier,
  getModifierDescription,
  isModifierSubset,
  Modifier,
  MODIFIERS,
  sortChordModifiers,
} from 'app/common/modifiers';
import { Semitone, SEMITONES } from 'app/common/semitones';
import { ModalRef, ModalService } from 'app/services/modal.service';

@Component({
  selector: 'app-chord-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chord-selector.component.html',
  styleUrls: ['./chord-selector.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ChordSelectorComponent),
      multi: true,
    },
  ],
})
export class ChordSelectorComponent implements ControlValueAccessor {
  @ViewChild('modifierModal') modifierModalTemplate!: TemplateRef<any>;

  readonly modifiers: Modifier[] = [...MODIFIERS];
  readonly bassNotes: Semitone[] = [...SEMITONES];
  readonly roots: Semitone[] = [...SEMITONES];

  selectedRoot: Semitone | null = null;
  selectedModifiers: Modifier[] = [];
  selectedBass: Semitone | null = null;

  disabled = false;

  private modifierModalRef: ModalRef | null = null;

  private onChange: (value: Chord | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private modalService: ModalService,
    private viewContainerRef: ViewContainerRef
  ) {}

  writeValue(value: Chord | null | undefined): void {
    if (!value) {
      this.selectedRoot = null;
      this.selectedBass = null;
      this.selectedModifiers = [];
      return;
    }

    this.selectedRoot = value.root ?? null;
    this.selectedBass = value.bass ?? null;
    this.selectedModifiers = Array.isArray(value.modifiers)
      ? sortChordModifiers([...value.modifiers])
      : [];
  }

  registerOnChange(fn: (value: Chord | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onRootChange(root: Semitone | null): void {
    this.onTouched();

    if (!root || root === ('null' as any) || root === ('undefined' as any)) {
      this.selectedRoot = null;
      this.selectedBass = null;
      this.selectedModifiers = [];
      this.commit();
      return;
    }

    this.selectedRoot = root;
    this.commit();
  }

  onBassChange(bass: Semitone | null): void {
    this.onTouched();

    const bassValue = bass as any;
    if (!bassValue || bassValue === 'null' || bassValue === 'undefined' || bassValue === '') {
      this.selectedBass = null;
      this.commit();
      return;
    }

    this.selectedBass = bass;
    this.commit();
  }

  clearSelection(): void {
    if (this.disabled) {
      return;
    }

    this.onTouched();
    this.selectedRoot = null;
    this.selectedBass = null;
    this.selectedModifiers = [];
    this.commit();
  }

  openModifierModal(): void {
    if (this.disabled || !this.selectedRoot) {
      return;
    }

    this.onTouched();
    this.modifierModalRef = this.modalService.showTemplate(
      this.modifierModalTemplate,
      this.viewContainerRef,
      {
        width: '800px',
        maxHeight: '90vh',
        closeOnBackdropClick: true,
      }
    );
  }

  closeModifierModal(): void {
    if (!this.modifierModalRef) return;

    this.modifierModalRef.close();
    this.modifierModalRef = null;
  }

  toggleModifier(modifier: Modifier): void {
    if (this.disabled || !this.selectedRoot) {
      return;
    }

    if (this.selectedModifiers.includes(modifier)) {
      this.selectedModifiers = this.selectedModifiers.filter((m) => m !== modifier);
    } else {
      this.selectedModifiers.push(modifier);
      this.selectedModifiers = this.selectedModifiers.filter((m) => {
        if (isModifierSubset(m, modifier)) {
          return modifier === m;
        }
        return true;
      });
    }

    this.onTouched();
    this.commit();
  }

  resetModifiers(): void {
    if (this.disabled || !this.selectedRoot) {
      return;
    }

    this.selectedModifiers = [];
    this.onTouched();
    this.commit();
  }

  getModifierState(modifier: Modifier) {
    const isChecked = this.isModifierChecked(modifier);
    const isSubset = this.isModifierSubset(modifier);
    const isConflict = this.isModifierConflict(modifier);
    const isDisabled = this.disabled || !this.selectedRoot || isConflict || isSubset;

    return { isChecked, isDisabled, isConflict, isSubset };
  }

  isModifierChecked(modifier: Modifier): boolean {
    return this.selectedModifiers.includes(modifier);
  }

  isModifierSubset(modifier: Modifier): boolean {
    const otherModifiers = this.selectedModifiers.filter((m) => m !== modifier);
    if (otherModifiers.length === 0) return false;

    return otherModifiers.some((m) => isModifierSubset(modifier, m));
  }

  isModifierConflict(modifier: Modifier): boolean {
    const canAdd = canAddModifier(this.selectedModifiers, modifier) === true;
    return !canAdd;
  }

  getModifierDescription(modifier: Modifier): string {
    return getModifierDescription(modifier);
  }

  private commit(): void {
    if (!this.selectedRoot) {
      this.onChange(null);
      return;
    }

    const chord: Chord = {
      root: this.selectedRoot,
      modifiers: sortChordModifiers(this.selectedModifiers),
      ...(this.selectedBass ? { bass: this.selectedBass } : {}),
    };

    this.onChange(chord);
  }
}
