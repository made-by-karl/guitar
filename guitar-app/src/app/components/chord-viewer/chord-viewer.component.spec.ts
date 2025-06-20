import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { ChordViewerComponent } from './chord-viewer.component';

describe('ChordViewerComponent', () => {
  let component: ChordViewerComponent;
  let fixture: ComponentFixture<ChordViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChordViewerComponent],
      providers: [{
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: {
              get: (param: string) => param === 'id' ? 'test-chord' : null
            }
          }
        }
      }]
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
