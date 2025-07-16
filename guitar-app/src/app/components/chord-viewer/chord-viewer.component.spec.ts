import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { ChordViewerComponent } from './chord-viewer.component';
import { of } from 'rxjs';
import { GripGeneratorService } from 'app/services/grips/grip-generator.service';
import { ChordService } from 'app/services/chords/chord.service';
import { GripScorerService } from 'app/services/grips/grip-scorer.service';
import { ChordProgressionService } from 'app/services/chords/chord-progression.service';

describe('ChordViewerComponent', () => {
  let component: ChordViewerComponent;
  let fixture: ComponentFixture<ChordViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChordViewerComponent],
      providers: [
        { provide: GripGeneratorService, useValue: {} },
        { provide: ChordService, useValue: {} },
        { provide: GripScorerService, useValue: {} },
        { provide: ChordProgressionService, useValue: {} },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (param: string) => param === 'chord' ? 'test-chord' : null
              }
            },
            params: of({ chord: 'test-chord' }),
            queryParamMap: of({
              get: (param: string) => null
            })
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChordViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
