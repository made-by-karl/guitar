import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PatternsLibraryComponent } from '@/app/features/patterns/pages/patterns-library/patterns-library.component';
import { PlayingPatternsService } from '@/app/features/patterns/services/playing-patterns.service';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { DialogService } from '@/app/core/services/dialog.service';
import { ModalService } from '@/app/core/services/modal.service';

describe('PatternsLibraryComponent', () => {
  it('renders suggested genre and example song for a pattern', async () => {
    const service = {
      getAll: jest.fn().mockResolvedValue([{
        id: 'pattern-1',
        name: 'Folk Strum',
        description: 'Classic campfire groove.',
        category: 'Campfire',
        suggestedGenre: 'Folk Singalong',
        exampleSong: 'Leaving on a Jet Plane',
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
      imports: [PatternsLibraryComponent],
      providers: [
        { provide: PlayingPatternsService, useValue: service },
        { provide: PatternPlaybackService, useValue: patternPlayback },
        { provide: DialogService, useValue: { confirm: jest.fn() } },
        { provide: ModalService, useValue: { show: jest.fn() } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PatternsLibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Genre: Folk Singalong');
    expect(text).toContain('Song: Leaving on a Jet Plane');
  });
});
