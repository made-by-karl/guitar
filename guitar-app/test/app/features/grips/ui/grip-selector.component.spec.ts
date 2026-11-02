import { TestBed } from '@angular/core/testing';
import { SelectionMode } from '@/app/core/ui/selection-mode';
import { GripSelectorComponent } from '@/app/features/grips/ui/grip-selector/grip-selector.component';
import { GripGeneratorService } from '@/app/features/grips/services/grips/grip-generator.service';
import { GripScorerService } from '@/app/features/grips/services/grips/grip-scorer.service';
import { parseGrip, TunedGrip } from '@/app/features/grips/services/grips/grip.model';
import { PlaybackService } from '@/app/core/services/playback.service';
import { ModalService } from '@/app/core/services/modal.service';

describe('GripSelectorComponent selection modes', () => {
  async function create(mode: SelectionMode) {
    const grips: TunedGrip[] = ['x|3|2|o|1|o', 'x|x|o|2|3|2'].map(value => ({
      ...parseGrip(value), notes: [], inversion: 'root', isIncomplete: false, omittedToneRoles: []
    }));
    await TestBed.configureTestingModule({ imports: [GripSelectorComponent], providers: [
      { provide: GripGeneratorService, useValue: { generateGrips: () => grips } },
      { provide: GripScorerService, useValue: { scoreGrip: () => 1 } },
      { provide: PlaybackService, useValue: { playChordFromNotes: jest.fn() } },
      { provide: ModalService, useValue: { show: jest.fn() } }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(GripSelectorComponent);
    fixture.componentRef.setInput('chord', { root: 'C', modifiers: [] });
    fixture.componentRef.setInput('selectionMode', mode);
    const emit = jest.spyOn(fixture.componentInstance.selectedGripsChange, 'emit');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, grips, emit, cards: Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.grip-item')) };
  }

  it('replaces the selected grip in single mode and keeps an already-selected radio checked', async () => {
    const { fixture, grips, cards, emit } = await create('single');
    cards[0].click(); cards[1].click(); fixture.detectChanges();
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ grips: [grips[1]] }));
    expect(cards.map(card => card.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    cards[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); fixture.detectChanges();
    expect(cards[1].getAttribute('aria-checked')).toBe('true');
    cards[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); fixture.detectChanges();
    expect(cards.map(card => card.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    cards[1].querySelector('button')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ grips: [grips[0]] }));
  });

  it('adds and removes multiple grips independently in multiple mode', async () => {
    const { fixture, grips, cards, emit } = await create('multiple');
    cards[0].click(); cards[1].click(); fixture.detectChanges();
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ grips }));
    expect(cards.every(card => card.getAttribute('role') === 'checkbox')).toBe(true);
    cards[0].click(); fixture.detectChanges();
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ grips: [grips[1]] }));
  });

  it('reduces an existing multiple selection to the last choice when switched to single mode', async () => {
    const { fixture, grips, cards, emit } = await create('multiple');
    cards[0].click(); cards[1].click();
    fixture.componentRef.setInput('selectionMode', 'single'); fixture.detectChanges();
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ grips: [grips[1]] }));
    expect(cards.every(card => card.getAttribute('role') === 'radio')).toBe(true);
  });
});
