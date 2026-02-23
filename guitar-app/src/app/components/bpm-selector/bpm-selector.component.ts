import { CommonModule } from '@angular/common';
import { Component, forwardRef } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

type BpmMode = 'tempo' | 'custom';

type BpmPreset = {
  id: string;
  label: string;
  bpm: number;
};

const BPM_PRESETS: readonly BpmPreset[] = [
  { id: 'very-slow', label: 'Very slow (60)', bpm: 60 },
  { id: 'slow', label: 'Slow (85)', bpm: 85 },
  { id: 'moderate', label: 'Moderate (120)', bpm: 120 },
  { id: 'fast', label: 'Fast (140)', bpm: 140 },
  { id: 'very-fast', label: 'Very fast (180)', bpm: 180 }
];

@Component({
  selector: 'app-bpm-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bpm-selector.component.html',
  styleUrls: ['./bpm-selector.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => BpmSelectorComponent),
      multi: true
    }
  ]
})
export class BpmSelectorComponent implements ControlValueAccessor {
  readonly presets = BPM_PRESETS;

  mode: BpmMode = 'tempo';
  selectedPresetId: string = BPM_PRESETS[0].id;

  customText = '';
  disabled = false;

  private value = BPM_PRESETS[0].bpm;

  private onChange: (value: number) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: number | null): void {
    if (typeof value === 'number') {
      const sanitized = this.sanitizeBpm(value);
      if (sanitized !== null) {
        this.setInternalValue(sanitized);
      }
    }

    if (this.mode === 'tempo') {
      const preset = this.findPresetByBpm(this.value);
      if (preset) {
        this.selectedPresetId = preset.id;
      } else {
        this.mode = 'custom';
      }
    }
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onModeChange(mode: BpmMode): void {
    this.mode = mode;
    this.onTouched();

    if (mode === 'custom') {
      this.customText = this.value ? String(this.value) : '';
      return;
    }

    const presetFromValue = this.findNearestPresetByBpm(this.value);
    if (presetFromValue) {
      this.selectedPresetId = presetFromValue.id;
      this.commitValue(presetFromValue.bpm);
      return;
    }

    const fallbackPreset = this.findPresetById(this.selectedPresetId) ?? this.presets[0];
    this.selectedPresetId = fallbackPreset.id;
    this.commitValue(fallbackPreset.bpm);
  }

  onPresetChange(presetId: string): void {
    this.selectedPresetId = presetId;
    const preset = this.findPresetById(presetId);
    if (!preset) return;
    this.onTouched();
    this.commitValue(preset.bpm);
  }

  onCustomInput(text: string): void {
    const sanitized = text.replace(/[^0-9]/g, '');
    this.customText = sanitized;

    if (!sanitized) {
      return;
    }

    const parsed = Number.parseInt(sanitized, 10);
    if (!Number.isFinite(parsed)) return;

    this.onTouched();
    this.commitValue(parsed);
  }

  onCustomBlur(): void {
    this.onTouched();
    if (!this.customText) {
      this.customText = this.value ? String(this.value) : '';
    }
  }

  private commitValue(nextValue: number): void {
    const integer = this.sanitizeBpm(nextValue);
    if (integer === null) return;

    this.setInternalValue(integer);
    this.onChange(integer);
  }

  private setInternalValue(value: number): void {
    this.value = value;
    this.customText = value ? String(value) : '';
  }

  private sanitizeBpm(value: number): number | null {
    const integer = Math.trunc(value);
    return Number.isFinite(integer) ? integer : null;
  }

  private findPresetById(id: string): BpmPreset | undefined {
    return this.presets.find(p => p.id === id);
  }

  private findPresetByBpm(bpm: number): BpmPreset | undefined {
    return this.presets.find(p => p.bpm === bpm);
  }

  private findNearestPresetByBpm(bpm: number): BpmPreset | undefined {
    if (!this.presets.length) return undefined;

    let bestPreset = this.presets[0];
    let bestDistance = Math.abs(bestPreset.bpm - bpm);

    for (const preset of this.presets.slice(1)) {
      const distance = Math.abs(preset.bpm - bpm);
      if (distance < bestDistance) {
        bestPreset = preset;
        bestDistance = distance;
        continue;
      }

      if (distance === bestDistance && preset.bpm < bestPreset.bpm) {
        bestPreset = preset;
      }
    }

    return bestPreset;
  }
}
