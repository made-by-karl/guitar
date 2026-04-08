import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PatternsLibrarySelectorComponent } from '@/app/features/patterns/ui/patterns-library-selector/patterns-library-selector.component';
import { PlayingPatternsService } from '@/app/features/patterns/services/playing-patterns.service';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';

describe('PatternsLibrarySelectorComponent', () => {
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
        beatGrips: [],
        actionGripOverrides: [],
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
