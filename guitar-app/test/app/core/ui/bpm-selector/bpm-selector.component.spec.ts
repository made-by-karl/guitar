import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BpmSelectorComponent } from '@/app/core/ui/bpm-selector/bpm-selector.component';

describe('BpmSelectorComponent', () => {
  let component: BpmSelectorComponent;
  let fixture: ComponentFixture<BpmSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BpmSelectorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BpmSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('selects the nearest tempo preset when switching to tempo mode', () => {
    const changes: number[] = [];
    component.registerOnChange(value => changes.push(value));

    component.writeValue(103);
    component.onModeChange('tempo');

    expect(component.selectedPresetId).toBe('fast');
    expect(changes.at(-1)).toBe(110);
  });

  it('breaks ties toward the slower preset', () => {
    const changes: number[] = [];
    component.registerOnChange(value => changes.push(value));

    component.writeValue(125);
    component.onModeChange('tempo');

    expect(component.selectedPresetId).toBe('fast');
    expect(changes.at(-1)).toBe(110);
  });

  it('applies the provided control id to the active BPM field across modes', () => {
    fixture.componentRef.setInput('controlId', 'bpm');
    fixture.detectChanges();

    let activeField = fixture.nativeElement.querySelector('#bpm') as HTMLSelectElement | HTMLInputElement | null;
    expect(activeField?.tagName).toBe('SELECT');

    component.onModeChange('custom');
    fixture.detectChanges();

    activeField = fixture.nativeElement.querySelector('#bpm') as HTMLSelectElement | HTMLInputElement | null;
    expect(activeField?.tagName).toBe('INPUT');
  });

  it('assigns stable names to the BPM mode and value fields', () => {
    fixture.componentRef.setInput('controlId', 'metronome-bpm');
    fixture.detectChanges();

    let modeField = fixture.nativeElement.querySelector('select.bpm-mode') as HTMLSelectElement | null;
    let valueField = fixture.nativeElement.querySelector('#metronome-bpm') as HTMLSelectElement | HTMLInputElement | null;

    expect(modeField?.getAttribute('name')).toBe('metronome-bpm-mode');
    expect(valueField?.getAttribute('name')).toBe('metronome-bpm-value');

    component.onModeChange('custom');
    fixture.detectChanges();

    modeField = fixture.nativeElement.querySelector('select.bpm-mode') as HTMLSelectElement | null;
    valueField = fixture.nativeElement.querySelector('#metronome-bpm') as HTMLSelectElement | HTMLInputElement | null;

    expect(modeField?.getAttribute('name')).toBe('metronome-bpm-mode');
    expect(valueField?.getAttribute('name')).toBe('metronome-bpm-value');
  });
});
