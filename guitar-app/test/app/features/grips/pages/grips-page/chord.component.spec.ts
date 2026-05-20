import { fakeAsync, ComponentFixture, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { ChordComponent } from '@/app/features/grips/pages/chord-page/chord.component';
import { GripGeneratorService } from '@/app/features/grips/services/grips/grip-generator.service';
import { ChordService } from '@/app/features/grips/services/chords/chord.service';
import { GripScorerService } from '@/app/features/grips/services/grips/grip-scorer.service';
import { ChordProgressionService } from '@/app/features/grips/services/chords/chord-progression.service';
import { HarmonicFunctionsService } from '@/app/features/grips/services/chords/harmonic-functions.service';
import { PlaybackService } from '@/app/core/services/playback.service';
import { ModalService } from '@/app/core/services/modal.service';
import type { ChordWithNotes } from '@/app/features/grips/services/chords/chord.service';
import type { TunedGrip } from '@/app/features/grips/services/grips/grip.model';

describe('ChordViewerComponent', () => {
  let component: ChordComponent;
  let fixture: ComponentFixture<ChordComponent>;

  const chord: ChordWithNotes = {
    root: 'C',
    notes: ['C', 'E', 'G', 'D'],
    modifiers: ['add9']
  };

  const grips: TunedGrip[] = [
    {
      strings: ['x', [{ fret: 3 }], [{ fret: 2 }], 'o', [{ fret: 3 }], 'o'],
      notes: [null, 'C3', 'E3', 'G3', 'D4', 'E4'],
      inversion: '1st',
      isIncomplete: true,
      omittedToneRoles: ['fifth']
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChordComponent],
      providers: [
        {
          provide: GripGeneratorService,
          useValue: {
            generateGrips: jest.fn(() => grips)
          }
        },
        {
          provide: ChordService,
          useValue: {
            calculateNotes: jest.fn((input: string | { root: 'C'; modifiers: string[] }) => {
              if (typeof input === 'string') {
                return chord;
              }

              return {
                root: input.root,
                notes: ['C', 'E', 'G', 'D'],
                modifiers: input.modifiers,
                bass: undefined
              };
            })
          }
        },
        { provide: GripScorerService, useValue: { scoreGrip: jest.fn(() => 0) } },
        { provide: ChordProgressionService, useValue: { getProgression: jest.fn(() => []) } },
        { provide: HarmonicFunctionsService, useValue: { find: jest.fn(() => []) } },
        { provide: PlaybackService, useValue: { playChordFromNotes: jest.fn(async () => undefined) } },
        { provide: ModalService, useValue: { show: jest.fn() } },
        { provide: Router, useValue: { navigate: jest.fn() } },
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
              get: (_param: string) => null
            })
          }
        }
      ]
    }).compileComponents();
  });

  beforeEach(fakeAsync(() => {
    fixture = TestBed.createComponent(ChordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    tick(10);
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render badges for incomplete grips and inversions', () => {
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Incomplete: fifth');
    expect(text).toContain('Inversion: 1st');
  });
});
