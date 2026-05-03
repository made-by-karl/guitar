import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayingPatternEditorComponent } from '@/app/features/patterns/ui/playing-pattern-editor/playing-pattern-editor.component';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { BehaviorSubject } from 'rxjs';
import { ModalService } from '@/app/core/services/modal.service';
import { DialogService } from '@/app/core/services/dialog.service';
import { NotificationService } from '@/app/core/services/notification.service';

describe('PlayingPatternEditorComponent', () => {
  let component: PlayingPatternEditorComponent;
  let fixture: ComponentFixture<PlayingPatternEditorComponent>;
  let mockPatternPlaybackService: jest.Mocked<Pick<PatternPlaybackService, 'getSnapshot' | 'togglePatternPreview' | 'stopPatternPreview'>> & {
    state$: BehaviorSubject<ReturnType<PatternPlaybackService['getSnapshot']>>;
  };
  let mockModalService: jest.Mocked<Pick<ModalService, 'show'>>;
  let mockDialogService: jest.Mocked<Pick<DialogService, 'confirm'>>;
  let mockNotificationService: jest.Mocked<Pick<NotificationService, 'success'>>;

  beforeEach(async () => {
    mockPatternPlaybackService = {
      getSnapshot: jest.fn(() => ({ status: 'idle' })),
      togglePatternPreview: jest.fn().mockResolvedValue(undefined),
      stopPatternPreview: jest.fn(),
      state$: new BehaviorSubject({ status: 'idle' } as ReturnType<PatternPlaybackService['getSnapshot']>)
    };
    mockModalService = {
      show: jest.fn()
    };
    mockDialogService = {
      confirm: jest.fn().mockResolvedValue(false)
    };
    mockNotificationService = {
      success: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [PlayingPatternEditorComponent],
      providers: [
        { provide: PatternPlaybackService, useValue: mockPatternPlaybackService },
        { provide: ModalService, useValue: mockModalService },
        { provide: DialogService, useValue: mockDialogService },
        { provide: NotificationService, useValue: mockNotificationService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlayingPatternEditorComponent);
    component = fixture.componentInstance;
    
    // Set the required pattern model
    const testPattern: PlayingPattern = {
      id: 'test-pattern',
      name: 'Test Pattern',
      description: 'Test pattern for unit testing',
      category: 'Test',
      suggestedGenre: 'Test Genre',
      exampleSong: 'Test Song',
      measures: [{
        timeSignature: '4/4',
        actions: [null, null, null, null]
      }],
      actionGrips: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCustom: true
    };
    
    component.pattern.set(testPattern);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('delegates preview playback to the pattern playback service', async () => {
    await component.playPattern();

    expect(mockPatternPlaybackService.togglePatternPreview).toHaveBeenCalledWith(component.pattern());
  });

  it('edits pattern genre and example song metadata', async () => {
    const suggestedGenreInput = fixture.nativeElement.querySelector('input[name="suggestedGenre"]') as HTMLInputElement;
    const exampleSongInput = fixture.nativeElement.querySelector('input[name="exampleSong"]') as HTMLInputElement;

    expect(suggestedGenreInput.value).toBe('Test Genre');
    expect(exampleSongInput.value).toBe('Test Song');

    suggestedGenreInput.value = 'Campfire Folk';
    suggestedGenreInput.dispatchEvent(new Event('input'));
    exampleSongInput.value = 'Wagon Wheel';
    exampleSongInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.pattern().suggestedGenre).toBe('Campfire Folk');
    expect(component.pattern().exampleSong).toBe('Wagon Wheel');
  });

  it('creates a hammer-on action with legato defaults', () => {
    component.addAction(0, 1, 'hammer-on');

    expect(component.pattern().measures[0].actions[1]).toEqual({
      technique: 'hammer-on',
      legatoMode: 'relative',
      legato: {
        string: 'second-from-bass',
        target: { anchor: 'grip-note', fretOffset: 0 }
      }
    });
  });

  it('switches legato target independently', () => {
    component.addAction(0, 0, 'slide');
    component.setLegatoMode(0, 0, 'relative');
    component.updateLegatoTargetAnchor(0, 0, 'grip-note');

    component.updateLegatoTargetFretOffset(0, 0, 7);

    expect(component.pattern().measures[0].actions[0]).toEqual({
      technique: 'slide',
      legatoMode: 'relative',
      legato: {
        string: 'second-from-bass',
        target: { anchor: 'grip-note', fretOffset: 7 }
      }
    });
  });

  it('switches pick actions between relative and explicit modes', () => {
    component.addAction(0, 0, 'pick');
    component.setPickMode(0, 0, 'explicit');

    expect(component.pattern().measures[0].actions[0]).toEqual({
      technique: 'pick',
      pickMode: 'explicit',
      pick: [{ string: 0, fret: 0 }],
      modifiers: []
    });
  });

  it('switches a strum action to relative range mode with defaults', () => {
    component.addAction(0, 0, 'strum-down');
    component.updateStrumStringsMode(0, 0, 'range');

    expect(component.pattern().measures[0].actions[0]).toEqual({
      technique: 'strum',
      strum: {
        direction: 'D',
        strings: { from: 'bass', to: 'top' }
      },
      modifiers: []
    });
  });

  it('updates the endpoints of a relative strum range independently', () => {
    component.addAction(0, 0, 'strum-up');
    component.updateStrumStringsMode(0, 0, 'range');
    component.updateStrumRangeFrom(0, 0, 'second-from-bass');
    component.updateStrumRangeTo(0, 0, 'second-from-top');

    expect(component.pattern().measures[0].actions[0]).toEqual({
      technique: 'strum',
      strum: {
        direction: 'U',
        strings: { from: 'second-from-bass', to: 'second-from-top' }
      },
      modifiers: []
    });
  });

  it('removes pick offsets when switching to base-note anchor', () => {
    component.addAction(0, 0, 'pick');
    component.updatePickNoteOffset(0, 0, 0, 3);
    component.updatePickNoteAnchor(0, 0, 0, 'base-note');

    expect(component.pattern().measures[0].actions[0]).toEqual({
      technique: 'pick',
      pickMode: 'relative',
      pick: [{ string: 'bass', anchor: 'base-note' }],
      modifiers: []
    });
  });

  it('forces sixteenth subdivision display when a measure contains a sixteenth action', () => {
    component.addAction(0, 1, 'hammer-on');

    const measureData = component.getMeasuresForDisplay(component.pattern())[0];

    expect(measureData.useSixteenthSteps).toBe(true);
    expect(component.canToggleSixteenthSteps(0)).toBe(false);
  });

  it('does not allow switching back to eighth subdivision while a sixteenth action exists', () => {
    component.toggleSixteenthSteps(0);
    expect(component.getMeasuresForDisplay(component.pattern())[0].useSixteenthSteps).toBe(true);

    component.addAction(0, 1, 'hammer-on');
    component.toggleSixteenthSteps(0);

    expect(component.getMeasuresForDisplay(component.pattern())[0].useSixteenthSteps).toBe(true);
  });

  it('renders action grip controls with rhythm labels in action slots', () => {
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('1 Q');
    expect(text).toContain('1 E');
    expect(text).toContain('Grip');
    expect(text).not.toContain('Beat Grips');
    expect(text).not.toContain('Advanced timing overrides');
  });

  it('adds a blank measure at the end when no copied measure is stored', async () => {
    component.pattern.set(createMultiMeasurePattern());

    await component.addMeasure();

    const pattern = component.pattern();
    expect(pattern.measures).toHaveLength(3);
    expect(pattern.measures[2]).toEqual({
      timeSignature: '3/4',
      actions: Array(12).fill(null)
    });
    expect(pattern.actionGrips).toEqual([
      { measureIndex: 0, actionIndex: 0, gripId: 'g', name: 'G' },
      { measureIndex: 1, actionIndex: 0, gripId: 'c', name: 'C' }
    ]);
    expect(mockDialogService.confirm).not.toHaveBeenCalled();
  });

  it('stores a copied measure without inserting it immediately', () => {
    component.pattern.set(createMultiMeasurePattern());

    component.copyMeasure(0);

    const pattern = component.pattern();
    expect(pattern.measures).toHaveLength(2);
    expect(pattern.actionGrips).toEqual([
      { measureIndex: 0, actionIndex: 0, gripId: 'g', name: 'G' },
      { measureIndex: 1, actionIndex: 0, gripId: 'c', name: 'C' }
    ]);
    expect(mockNotificationService.success).toHaveBeenCalledWith('Copied measure 1');
  });

  it('asks whether to use a copied measure when adding a measure', async () => {
    component.pattern.set(createMultiMeasurePattern());
    component.copyMeasure(0);
    mockDialogService.confirm.mockResolvedValue(false);

    await component.addMeasure();

    expect(mockDialogService.confirm).toHaveBeenCalledWith(
      'Use the copied measure, or create a new empty measure?',
      'Add Measure',
      'Use Copy',
      'New Measure'
    );
    expect(component.pattern().measures[2]).toEqual({
      timeSignature: '3/4',
      actions: Array(12).fill(null)
    });
  });

  it('adds the copied measure with actions and grips when confirmed', async () => {
    component.pattern.set(createMultiMeasurePattern());
    component.copyMeasure(0);
    mockDialogService.confirm.mockResolvedValue(true);

    await component.addMeasure();

    const pattern = component.pattern();
    expect(pattern.measures).toHaveLength(3);
    expect(pattern.measures[2]).toEqual(pattern.measures[0]);
    expect(pattern.measures[2]).not.toBe(pattern.measures[0]);
    expect(pattern.actionGrips).toEqual([
      { measureIndex: 0, actionIndex: 0, gripId: 'g', name: 'G' },
      { measureIndex: 1, actionIndex: 0, gripId: 'c', name: 'C' },
      { measureIndex: 2, actionIndex: 0, gripId: 'g', name: 'G' }
    ]);
  });

  it('keeps the private moveMeasure helper for measure reordering behavior', () => {
    component.pattern.set(createMultiMeasurePattern());

    (component as unknown as { moveMeasure(fromIndex: number, toIndex: number): void }).moveMeasure(0, 1);

    const pattern = component.pattern();
    expect(pattern.measures[0].timeSignature).toBe('3/4');
    expect(pattern.measures[1].timeSignature).toBe('4/4');
    expect(pattern.actionGrips).toEqual([
      { measureIndex: 1, actionIndex: 0, gripId: 'g', name: 'G' },
      { measureIndex: 0, actionIndex: 0, gripId: 'c', name: 'C' }
    ]);
  });

  it('removes a measure and shifts later grip assignments', () => {
    component.pattern.set(createMultiMeasurePattern());

    component.removeMeasure(0);

    const pattern = component.pattern();
    expect(pattern.measures).toHaveLength(1);
    expect(pattern.measures[0].timeSignature).toBe('3/4');
    expect(pattern.actionGrips).toEqual([
      { measureIndex: 0, actionIndex: 0, gripId: 'c', name: 'C' }
    ]);
  });
});

function createMultiMeasurePattern(): PlayingPattern {
  return {
    id: 'multi-measure-pattern',
    name: 'Multi Measure',
    description: 'Pattern with two measures.',
    category: 'Test',
    suggestedGenre: 'Test Genre',
    exampleSong: 'Test Song',
    measures: [
      {
        timeSignature: '4/4',
        actions: [
          { technique: 'strum', strum: { direction: 'D', strings: 'all' }, modifiers: [] },
          null,
          null,
          null
        ]
      },
      {
        timeSignature: '3/4',
        actions: [
          { technique: 'pick', pickMode: 'relative', pick: [{ string: 'bass', anchor: 'grip-note', fretOffset: 0 }], modifiers: [] },
          null,
          null
        ]
      }
    ],
    actionGrips: [
      { measureIndex: 0, actionIndex: 0, gripId: 'g', name: 'G' },
      { measureIndex: 1, actionIndex: 0, gripId: 'c', name: 'C' }
    ],
    createdAt: 1,
    updatedAt: 1,
    isCustom: true
  };
}
