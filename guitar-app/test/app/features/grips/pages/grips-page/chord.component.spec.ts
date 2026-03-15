import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { ChordComponent } from '@/app/features/grips/pages/grips-page/chord.component';
import { of } from 'rxjs';
import { GripGeneratorService } from '@/app/features/grips/services/grips/grip-generator.service';
import { ChordService } from '@/app/features/grips/services/chords/chord.service';
import { GripScorerService } from '@/app/features/grips/services/grips/grip-scorer.service';
import { ChordProgressionService } from '@/app/features/grips/services/chords/chord-progression.service';

describe('ChordViewerComponent', () => {
  let component: ChordComponent;
  let fixture: ComponentFixture<ChordComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChordComponent],
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

    fixture = TestBed.createComponent(ChordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
