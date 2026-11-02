import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PatternsLibrarySelectorComponent } from '@/app/features/patterns/ui/patterns-library-selector/patterns-library-selector.component';
import { PlayingPatternsService } from '@/app/features/patterns/services/playing-patterns.service';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { SelectionMode } from '@/app/core/ui/selection-mode';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';

describe('PatternsLibrarySelectorComponent', () => {
  async function create(mode: SelectionMode) {
    const patterns: PlayingPattern[] = ['First', 'Second'].map((name, index) => ({
      id: `p-${index}`, name, description: '', category: '', suggestedGenre: '', exampleSong: '',
      createdAt: 0, updatedAt: 0, measures: [{ timeSignature: '4/4', actions: [null, null, null, null] }]
    }));
    await TestBed.configureTestingModule({ imports: [PatternsLibrarySelectorComponent], providers: [
      { provide: PlayingPatternsService, useValue: { getAll: async () => patterns } },
      { provide: PatternPlaybackService, useValue: { state$: of({ status: 'idle' }), getSnapshot: () => ({ status: 'idle' }), stopPatternPreview: jest.fn(), togglePatternPreview: jest.fn() } }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(PatternsLibrarySelectorComponent);
    fixture.componentRef.setInput('selectionMode', mode);
    const emit = jest.spyOn(fixture.componentInstance.selectedPatternsChange, 'emit');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, patterns, emit, cards: Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.pattern-item')) };
  }

  it('replaces the previous pattern in single mode and supports radio keyboard navigation', async () => {
    const { fixture, patterns, cards, emit } = await create('single');
    cards[0].click(); cards[1].click(); fixture.detectChanges();
    expect(emit).toHaveBeenLastCalledWith({ patterns: [patterns[1]] });
    cards[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); fixture.detectChanges();
    expect(cards[1].getAttribute('aria-checked')).toBe('true');
    cards[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); fixture.detectChanges();
    expect(cards.map(card => card.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    cards[1].querySelector('button')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(emit).toHaveBeenLastCalledWith({ patterns: [patterns[0]] });
  });

  it('keeps independent checkbox selections for bulk imports', async () => {
    const { fixture, patterns, cards, emit } = await create('multiple');
    cards[0].click(); cards[1].click(); fixture.detectChanges();
    expect(emit).toHaveBeenLastCalledWith({ patterns });
    cards[0].click(); fixture.detectChanges();
    expect(emit).toHaveBeenLastCalledWith({ patterns: [patterns[1]] });
  });

  it('retains only the last selected pattern when the mode changes to single', async () => {
    const { fixture, patterns, cards, emit } = await create('multiple');
    cards[0].click(); cards[1].click();
    fixture.componentRef.setInput('selectionMode', 'single'); fixture.detectChanges();
    expect(emit).toHaveBeenLastCalledWith({ patterns: [patterns[1]] });
    expect(cards.map(card => card.getAttribute('role'))).toEqual(['radio', 'radio']);
  });

  it('renders suggested genre and example song for selectable patterns', async () => {
    const service = {
      getAll: jest.fn().mockResolvedValue([{
        id: 'pattern-1',
        name: 'Soft Ballad Brush',
        description: 'Soft verse brush.',
        category: 'Campfire',
        suggestedGenre: 'Singer-Songwriter Ballad',
        exampleSong: 'Let It Be',
        measures: [{ timeSignature: '4/4', actions: Array(16).fill(null) }],
        actionGrips: [],
        createdAt: 1,
        updatedAt: 1,
        isCustom: false
      }])
    };
    const patternPlayback = {
      state$: of({ status: 'idle' }),
      getSnapshot: jest.fn().mockReturnValue({ status: 'idle' }),
      stopPatternPreview: jest.fn(),
      togglePatternPreview: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [PatternsLibrarySelectorComponent],
      providers: [
        { provide: PlayingPatternsService, useValue: service },
        { provide: PatternPlaybackService, useValue: patternPlayback }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PatternsLibrarySelectorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Genre: Singer-Songwriter Ballad');
    expect(text).toContain('Song: Let It Be');
  });
});
