import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RhythmPatternEditorComponent } from './rhythm-pattern-editor.component';
import { RhythmPattern } from '../../services/rhythm-patterns.model';
import { PlaybackService } from '../../services/playback.service';

describe('RhythmPatternEditorComponent', () => {
  let component: RhythmPatternEditorComponent;
  let fixture: ComponentFixture<RhythmPatternEditorComponent>;
  let mockPlaybackService: jest.Mocked<PlaybackService>;

  beforeEach(async () => {
    // Create mock services
    mockPlaybackService = {
      playRhythmPattern: jest.fn().mockResolvedValue(undefined)
    } as any;

    await TestBed.configureTestingModule({
      imports: [RhythmPatternEditorComponent],
      providers: [
        { provide: PlaybackService, useValue: mockPlaybackService }
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
        actions: []
      }],
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
});
