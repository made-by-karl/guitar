import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RhythmPatternEditorComponent } from '@/app/features/patterns/ui/rhythm-pattern-editor/rhythm-pattern-editor.component';
import { RhythmPattern } from '@/app/features/patterns/services/rhythm-patterns.model';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { BehaviorSubject } from 'rxjs';
import { ModalService } from '@/app/core/services/modal.service';

describe('RhythmPatternEditorComponent', () => {
  let component: RhythmPatternEditorComponent;
  let fixture: ComponentFixture<RhythmPatternEditorComponent>;
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
      imports: [RhythmPatternEditorComponent],
      providers: [
        { provide: PatternPlaybackService, useValue: mockPatternPlaybackService },
        { provide: ModalService, useValue: mockModalService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RhythmPatternEditorComponent);
    component = fixture.componentInstance;
    
    // Set the required pattern model
    const testPattern: RhythmPattern = {
      id: 'test-pattern',
      name: 'Test Pattern',
      description: 'Test pattern for unit testing',
      category: 'Test',
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

  it('creates a hammer-on action with legato defaults', () => {
    component.addAction(0, 1, 'hammer-on');

    expect(component.pattern().measures[0].actions[1]).toEqual({
      technique: 'hammer-on',
      legato: { string: 0, fromFret: 0, toFret: 2 }
    });
  });

  it('updates legato frets immutably', () => {
    component.addAction(0, 0, 'slide');

    component.updateLegatoFromFret(0, 0, 5);
    component.updateLegatoToFret(0, 0, 7);

    expect(component.pattern().measures[0].actions[0]).toEqual({
      technique: 'slide',
      legato: { string: 0, fromFret: 5, toFret: 7 }
    });
  });
});
