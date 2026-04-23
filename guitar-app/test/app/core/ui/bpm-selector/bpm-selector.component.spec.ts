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
});
