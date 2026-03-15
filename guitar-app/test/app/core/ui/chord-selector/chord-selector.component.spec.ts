import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Chord } from '@/app/core/music/chords';
import { ModalService } from '@/app/core/services/modal.service';

import { ChordSelectorComponent } from '@/app/core/ui/chord-selector/chord-selector.component';

describe('ChordSelectorComponent', () => {
  let component: ChordSelectorComponent;
  let fixture: ComponentFixture<ChordSelectorComponent>;

  const modalService = {
    showTemplate: jest.fn(() => ({
      close: jest.fn(),
      afterClosed: () => Promise.resolve(undefined),
    })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChordSelectorComponent],
      providers: [{ provide: ModalService, useValue: modalService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ChordSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('clears state on writeValue(null)', () => {
    const value: Chord = { root: 'C', bass: 'E', modifiers: ['m'] };
    component.writeValue(value);

    component.writeValue(null);

    expect(component.selectedRoot).toBeNull();
    expect(component.selectedBass).toBeNull();
    expect(component.selectedModifiers).toEqual([]);
  });

  it('clears state on writeValue(undefined)', () => {
    const value: Chord = { root: 'C', bass: 'E', modifiers: ['m'] };
    component.writeValue(value);

    component.writeValue(undefined);

    expect(component.selectedRoot).toBeNull();
    expect(component.selectedBass).toBeNull();
    expect(component.selectedModifiers).toEqual([]);
  });

  it('emits null when clearing the root', () => {
    const changes: Array<Chord | null> = [];
    component.registerOnChange((value) => changes.push(value));

    component.onRootChange('C');
    component.onRootChange(null);

    expect(changes.at(-1)).toBeNull();
    expect(component.selectedBass).toBeNull();
    expect(component.selectedModifiers).toEqual([]);
  });

  it('emits chord on each change (root, bass, modifier)', () => {
    const changes: Array<Chord | null> = [];
    component.registerOnChange((value) => changes.push(value));

    component.onRootChange('C');
    expect(changes.at(-1)).toMatchObject({ root: 'C', modifiers: [] });
    expect((changes.at(-1) as Chord).bass).toBeUndefined();

    component.onBassChange('E');
    expect(changes.at(-1)).toMatchObject({ root: 'C', modifiers: [], bass: 'E' });

    component.toggleModifier('m');
    expect(changes.at(-1)).toMatchObject({ root: 'C', modifiers: ['m'], bass: 'E' });

    component.onBassChange(null);
    expect(changes.at(-1)).toMatchObject({ root: 'C', modifiers: ['m'] });
    expect((changes.at(-1) as Chord).bass).toBeUndefined();
  });

  it('clears the whole selection and emits null', () => {
    const changes: Array<Chord | null> = [];
    component.registerOnChange((value) => changes.push(value));

    component.onRootChange('C');
    component.onBassChange('E');
    component.toggleModifier('m');

    component.clearSelection();

    expect(changes.at(-1)).toBeNull();
    expect(component.selectedRoot).toBeNull();
    expect(component.selectedBass).toBeNull();
    expect(component.selectedModifiers).toEqual([]);
  });

  it('removes subset modifiers when selecting a superset', () => {
    const changes: Array<Chord | null> = [];
    component.registerOnChange((value) => changes.push(value));

    component.onRootChange('C');
    component.toggleModifier('maj7');
    expect(changes.at(-1)).toMatchObject({ root: 'C', modifiers: ['maj7'] });

    component.toggleModifier('maj9');
    expect(changes.at(-1)).toMatchObject({ root: 'C', modifiers: ['maj9'] });
  });

  it('emits modifiers in canonical order (not selection order)', () => {
    const changes: Array<Chord | null> = [];
    component.registerOnChange((value) => changes.push(value));

    component.onRootChange('C');

    // Select in “wrong” order
    component.toggleModifier('maj7');
    component.toggleModifier('m');

    expect(changes.at(-1)).toMatchObject({ root: 'C', modifiers: ['m', 'maj7'] });
  });

  it('opens modifier modal via ModalService', () => {
    modalService.showTemplate.mockClear();

    component.onRootChange('C');
    component.openModifierModal();

    expect(modalService.showTemplate).toHaveBeenCalled();
  });
});
