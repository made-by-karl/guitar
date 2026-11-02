import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MODAL_DATA, MODAL_REF } from '@/app/core/services/modal.service';
import { PlaybackService } from '@/app/core/services/playback.service';
import { parseGrip } from '@/app/features/grips/services/grips/grip.model';
import {
  CustomGripEditorModalComponent,
  CustomGripEditorModalData
} from '@/app/features/grips/ui/custom-grip-editor-modal/custom-grip-editor-modal.component';

describe('CustomGripEditorModalComponent preview', () => {
  let fixture: ComponentFixture<CustomGripEditorModalComponent>;
  let component: CustomGripEditorModalComponent;
  let data: CustomGripEditorModalData;
  let playChordFromNotes: jest.Mock;
  let close: jest.Mock;

  beforeEach(async () => {
    data = {};
    playChordFromNotes = jest.fn().mockResolvedValue(undefined);
    close = jest.fn();
    await TestBed.configureTestingModule({
      imports: [CustomGripEditorModalComponent],
      providers: [
        { provide: MODAL_DATA, useValue: data },
        { provide: MODAL_REF, useValue: { close } },
        { provide: PlaybackService, useValue: { playChordFromNotes } }
      ]
    }).compileComponents();
  });

  async function createEditor(initialData: CustomGripEditorModalData = {}): Promise<void> {
    Object.assign(data, initialData);
    fixture = TestBed.createComponent(CustomGripEditorModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows muted strings and disables playback when nothing can sound', async () => {
    await createEditor();
    const host: HTMLElement = fixture.nativeElement;
    expect(Array.from(host.querySelectorAll('.preview-notes .note'), note => note.textContent?.trim()))
      .toEqual(['x,', 'x,', 'x,', 'x,', 'x,', 'x']);
    expect(host.querySelector<HTMLButtonElement>('.preview-details button')!.disabled).toBe(true);
    await component.playGrip();
    expect(playChordFromNotes).not.toHaveBeenCalled();
  });

  it('updates note names and octaves when string modes and frets change', async () => {
    await createEditor({
      initialGrip: { strings: ['x', [{ fret: 3 }], [{ fret: 2 }], 'o', [{ fret: 1 }], 'o'] }
    });
    expect(component.previewNotes).toEqual([null, 'C3', 'E3', 'G3', 'C4', 'E4']);
    component.updateMode(component.stringStates[0], 'open');
    component.updateMode(component.stringStates[5], 'single');
    component.updateFret(component.stringStates[5], 13);
    fixture.detectChanges();
    expect(component.previewNotes).toEqual(['E2', 'C3', 'E3', 'G3', 'C4', 'F5']);
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.preview-notes')!.textContent).toContain('F5');
  });

  it('plays the displayed notes, keeping doubled notes and omitting muted strings, before naming the grip', async () => {
    await createEditor({ initialGrip: { strings: ['o', 'x', 'x', 'x', [{ fret: 5 }], 'o'] } });
    expect(component.canSave).toBe(false);
    const host: HTMLElement = fixture.nativeElement;
    host.querySelector<HTMLButtonElement>('.preview-details button')!.click();
    await fixture.whenStable();
    expect(playChordFromNotes).toHaveBeenCalledWith(['E2', 'E4', 'E4']);
  });

  it('uses the supplied tuning and capo for barre and open notes', async () => {
    await createEditor({
      tuning: [
        { semitone: 'D', octave: 2 }, { semitone: 'A', octave: 2 },
        { semitone: 'D', octave: 3 }, { semitone: 'G', octave: 3 },
        { semitone: 'B', octave: 3 }, { semitone: 'E', octave: 4 }
      ],
      capodaster: 2,
      initialName: 'Barre',
      initialGrip: { strings: [[{ fret: 1, isPartOfBarre: true }], [{ fret: 1, isPartOfBarre: true }], 'o', 'x', 'x', 'o'] }
    });
    expect(component.previewNotes).toEqual(['F2', 'C3', 'E3', null, null, 'F#4']);
    await component.playGrip();
    expect(playChordFromNotes).toHaveBeenCalledWith(['F2', 'C3', 'E3', 'F#4']);
    component.save();
    expect(close).toHaveBeenCalledWith({ name: 'Barre', grip: component.previewGrip });
  });

  it('prevents playback for an invalid fret', async () => {
    await createEditor({ initialGrip: { strings: [[{ fret: 1 }], 'x', 'x', 'x', 'x', 'x'] } });
    component.stringStates[0].fret = NaN;
    fixture.detectChanges();
    expect(component.canPlay).toBe(false);
    await component.playGrip();
    expect(playChordFromNotes).not.toHaveBeenCalled();
  });

  it('only shows fret fields for pressed strings and remembers the fret when switching modes', async () => {
    await createEditor({ initialGrip: parseGrip('x|o|3|1b|1b|o') });
    const host: HTMLElement = fixture.nativeElement;
    expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[type="number"]'), input => input.id))
      .toEqual(['customGripFret2', 'customGripFret3', 'customGripFret4']);

    component.updateMode(component.stringStates[2], 'open');
    fixture.detectChanges();
    expect(host.querySelector('#customGripFret2')).toBeNull();
    component.updateMode(component.stringStates[2], 'muted');
    fixture.detectChanges();
    expect(host.querySelector('#customGripFret2')).toBeNull();
    component.updateMode(component.stringStates[2], 'single');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelector<HTMLInputElement>('#customGripFret2')!.value).toBe('3');
  });

  it.each([
    ['o|2|2|o|o|o', '022000'],
    ['x|3|2|o|1|o', 'x32010'],
    ['1b|3|3|2|1b|1b', '133211'],
    ['x|x|x|x|x|x', 'xxxxxx']
  ])('links %s to the name %s until unlinked', async (grip, expectedName) => {
    await createEditor({ initialName: 'Old name', initialGrip: parseGrip(grip) });
    const host: HTMLElement = fixture.nativeElement;
    const toggle = host.querySelector<HTMLButtonElement>('button[aria-label="Link grip name to frets"]')!;
    const nameInput = host.querySelector<HTMLInputElement>('#customGripName')!;
    expect(nameInput.disabled).toBe(false);
    expect(nameInput.value).toBe('Old name');
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(nameInput.value).toBe(expectedName);
    expect(nameInput.disabled).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(nameInput.disabled).toBe(false);
    expect(nameInput.value).toBe(expectedName);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    component.name = 'My custom name';
    component.updateMode(component.stringStates[0], 'open');
    expect(component.name).toBe('My custom name');
  });

  it('follows mode and fret changes while linked and keeps the last name when unlinked', async () => {
    await createEditor({ initialName: 'Custom', initialGrip: parseGrip('x|3|2|o|1|o') });
    component.toggleNameLink();
    expect(component.name).toBe('x32010');
    component.updateMode(component.stringStates[0], 'open');
    component.updateFret(component.stringStates[1], 5);
    fixture.detectChanges();
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector<HTMLInputElement>('#customGripName')!.value).toBe('052010');

    component.toggleNameLink();
    component.updateFret(component.stringStates[1], 7);
    expect(component.name).toBe('052010');
    component.toggleNameLink();
    expect(component.name).toBe('072010');
    component.save();
    expect(close).toHaveBeenCalledWith({ name: '072010', grip: component.previewGrip });
  });
});
