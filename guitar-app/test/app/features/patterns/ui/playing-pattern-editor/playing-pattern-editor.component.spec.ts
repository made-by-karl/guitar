import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayingPatternEditorComponent } from '@/app/features/patterns/ui/playing-pattern-editor/playing-pattern-editor.component';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { BehaviorSubject } from 'rxjs';
import { ModalService } from '@/app/core/services/modal.service';

describe('PlayingPatternEditorComponent', () => {
  let component: PlayingPatternEditorComponent;
  let fixture: ComponentFixture<PlayingPatternEditorComponent>;
  let mockPatternPlaybackService: jest.Mocked<Pick<PatternPlaybackService, 'getSnapshot' | 'togglePatternPreview' | 'stopPatternPreview'>> & {
    state$: BehaviorSubject<ReturnType<PatternPlaybackService['getSnapshot']>>;
  };
  let mockModalService: jest.Mocked<Pick<ModalService, 'show'>>;

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

    await TestBed.configureTestingModule({
      imports: [PlayingPatternEditorComponent],
      providers: [
        { provide: PatternPlaybackService, useValue: mockPatternPlaybackService },
        { provide: ModalService, useValue: mockModalService }
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
      beatGrips: [],
      actionGripOverrides: [],
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
        role: 'second-from-bass',
        start: { anchor: 'base-note' },
        target: { anchor: 'grip-note', fretOffset: 0 }
      }
    });
  });

  it('switches legato start and target independently', () => {
    component.addAction(0, 0, 'slide');
    component.setLegatoMode(0, 0, 'relative');
    component.updateLegatoStartAnchor(0, 0, 'base-note');
    component.updateLegatoTargetAnchor(0, 0, 'grip-note');

    component.updateLegatoTargetFretOffset(0, 0, 7);

    expect(component.pattern().measures[0].actions[0]).toEqual({
      technique: 'slide',
      legatoMode: 'relative',
      legato: {
        role: 'second-from-bass',
        start: { anchor: 'base-note' },
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
      pick: [{ role: 'bass', anchor: 'base-note' }],
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
});
