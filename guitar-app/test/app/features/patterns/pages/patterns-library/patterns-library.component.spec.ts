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

  it('offers clone and delete for default patterns without edit', async () => {
    const service = {
      getAll: jest.fn().mockResolvedValue([createPattern({ isCustom: false })]),
      createClone: jest.fn(),
      restoreMissingDefaults: jest.fn()
    };
    const patternPlayback = createPatternPlaybackMock();

    await TestBed.configureTestingModule({
      imports: [PatternsLibraryComponent],
      providers: [
        { provide: PlayingPatternsService, useValue: service },
        { provide: PatternPlaybackService, useValue: patternPlayback },
        { provide: DialogService, useValue: { confirm: jest.fn(), alert: jest.fn() } },
        { provide: ModalService, useValue: { show: jest.fn() } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PatternsLibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Clone');
    expect(text).toContain('Delete');
    expect(text).not.toContain('Edit');
  });

  it('offers edit, clone, and delete for custom patterns', async () => {
    const service = {
      getAll: jest.fn().mockResolvedValue([createPattern({ isCustom: true })]),
      createClone: jest.fn(),
      restoreMissingDefaults: jest.fn()
    };
    const patternPlayback = createPatternPlaybackMock();

    await TestBed.configureTestingModule({
      imports: [PatternsLibraryComponent],
      providers: [
        { provide: PlayingPatternsService, useValue: service },
        { provide: PatternPlaybackService, useValue: patternPlayback },
        { provide: DialogService, useValue: { confirm: jest.fn(), alert: jest.fn() } },
        { provide: ModalService, useValue: { show: jest.fn() } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PatternsLibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Edit');
    expect(text).toContain('Clone');
    expect(text).toContain('Delete');
  });

  it('restores default patterns from the library menu action', async () => {
    const service = {
      getAll: jest.fn().mockResolvedValue([]),
      createClone: jest.fn(),
      restoreMissingDefaults: jest.fn().mockResolvedValue(2)
    };
    const dialog = { confirm: jest.fn(), alert: jest.fn().mockResolvedValue(undefined) };

    await TestBed.configureTestingModule({
      imports: [PatternsLibraryComponent],
      providers: [
        { provide: PlayingPatternsService, useValue: service },
        { provide: PatternPlaybackService, useValue: createPatternPlaybackMock() },
        { provide: DialogService, useValue: dialog },
        { provide: ModalService, useValue: { show: jest.fn() } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PatternsLibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.restoreDefaultPatterns();

    expect(service.restoreMissingDefaults).toHaveBeenCalledTimes(1);
    expect(service.getAll).toHaveBeenCalledTimes(2);
    expect(dialog.alert).toHaveBeenCalledWith(
      'Restored 2 default patterns.',
      'Restore Defaults',
      'OK',
      { variant: 'success' }
    );
  });
});

function createPattern(overrides: Partial<ReturnType<typeof createPatternBase>> = {}) {
  return {
    ...createPatternBase(),
    ...overrides
  };
}

function createPatternBase() {
  return {
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
  };
}

function createPatternPlaybackMock() {
  return {
    state$: of({ status: 'idle' }),
    getSnapshot: jest.fn().mockReturnValue({ status: 'idle' }),
    stopPatternPreview: jest.fn(),
    togglePatternPreview: jest.fn()
  };
}
