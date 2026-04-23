import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PatternsLibraryComponent } from '@/app/features/patterns/pages/patterns-library/patterns-library.component';
import { PlayingPatternsService } from '@/app/features/patterns/services/playing-patterns.service';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { DialogService } from '@/app/core/services/dialog.service';
import { ModalService } from '@/app/core/services/modal.service';
import { NotificationService } from '@/app/core/services/notification.service';

describe('PatternsLibraryComponent', () => {
  let originalIntersectionObserver: typeof IntersectionObserver | undefined;
  let observerCallback: IntersectionObserverCallback | undefined;

  beforeEach(() => {
    originalIntersectionObserver = globalThis.IntersectionObserver;
    observerCallback = undefined;

    globalThis.IntersectionObserver = class MockIntersectionObserver implements IntersectionObserver {
      readonly root: Element | Document | null;
      readonly rootMargin = '';
      readonly thresholds = [0.1];

      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observerCallback = callback;
        this.root = options?.root ?? null;
      }

      disconnect(): void {}
      observe(): void {}
      unobserve(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    };

    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'app-content-container';
    document.body.appendChild(scrollContainer);
  });

  afterEach(() => {
    document.querySelector('.app-content-container')?.remove();

    if (originalIntersectionObserver) {
      globalThis.IntersectionObserver = originalIntersectionObserver;
    } else {
      delete (globalThis as Partial<typeof globalThis>).IntersectionObserver;
    }
  });

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
      imports: [PatternsLibraryComponent],
      providers: [
        { provide: PlayingPatternsService, useValue: service },
        { provide: PatternPlaybackService, useValue: patternPlayback },
        { provide: DialogService, useValue: { confirm: jest.fn() } },
        { provide: ModalService, useValue: { show: jest.fn() } },
        { provide: NotificationService, useValue: { success: jest.fn() } }
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

  it('provides a toolbar create button only after the header scrolls out of view', async () => {
    const service = {
      getAll: jest.fn().mockResolvedValue([]),
      createClone: jest.fn(),
      restoreMissingDefaults: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [PatternsLibraryComponent],
      providers: [
        { provide: PlayingPatternsService, useValue: service },
        { provide: PatternPlaybackService, useValue: createPatternPlaybackMock() },
        { provide: DialogService, useValue: { confirm: jest.fn(), alert: jest.fn() } },
        { provide: ModalService, useValue: { show: jest.fn() } },
        { provide: NotificationService, useValue: { success: jest.fn() } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PatternsLibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.toolbarTemplate).toBeTruthy();
    expect(fixture.componentInstance.showToolbarCreateButton).toBe(false);
    expect(observerCallback).toBeDefined();

    observerCallback?.(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      {} as IntersectionObserver
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.showToolbarCreateButton).toBe(true);
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
        { provide: ModalService, useValue: { show: jest.fn() } },
        { provide: NotificationService, useValue: { success: jest.fn() } }
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
        { provide: ModalService, useValue: { show: jest.fn() } },
        { provide: NotificationService, useValue: { success: jest.fn() } }
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
        { provide: ModalService, useValue: { show: jest.fn() } },
        { provide: NotificationService, useValue: { success: jest.fn() } }
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

  it('shows a success notification after saving a cloned pattern', async () => {
    const clonedPattern = createPattern({ id: 'pattern-2', isCustom: true, name: 'Folk Strum Copy' });
    const service = {
      getAll: jest.fn().mockResolvedValue([createPattern({ id: 'pattern-1', isCustom: false })]),
      createClone: jest.fn().mockReturnValue(clonedPattern),
      restoreMissingDefaults: jest.fn(),
      add: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined)
    };
    const notificationService = { success: jest.fn() };
    const modalService = {
      show: jest.fn().mockReturnValue({
        componentInstance: {},
        afterClosed: jest.fn().mockResolvedValue(clonedPattern)
      })
    };

    await TestBed.configureTestingModule({
      imports: [PatternsLibraryComponent],
      providers: [
        { provide: PlayingPatternsService, useValue: service },
        { provide: PatternPlaybackService, useValue: createPatternPlaybackMock() },
        { provide: DialogService, useValue: { confirm: jest.fn(), alert: jest.fn() } },
        { provide: ModalService, useValue: modalService },
        { provide: NotificationService, useValue: notificationService }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PatternsLibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.startClone(createPattern({ id: 'pattern-1', isCustom: false }));

    expect(service.add).toHaveBeenCalledWith(clonedPattern);
    expect(notificationService.success).toHaveBeenCalledWith('Cloned pattern "Folk Strum Copy"');
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
    actionGrips: [],
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
