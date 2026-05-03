import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GripDiagramComponent } from '@/app/core/ui/grip-diagram/grip-diagram.component';

describe('GripDiagramComponent', () => {
  let component: GripDiagramComponent;
  let fixture: ComponentFixture<GripDiagramComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GripDiagramComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GripDiagramComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a barre line only across contiguous barred strings', () => {
    component.grip = {
      strings: [
        [{ fret: 1, isPartOfBarre: true }],
        [{ fret: 1, isPartOfBarre: true }],
        'o',
        [{ fret: 1, isPartOfBarre: true }],
        [{ fret: 1, isPartOfBarre: true }],
        'x'
      ]
    };

    component.updateSvg(component.grip);
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    const heavyLines = Array.from(svg.querySelectorAll('line')).filter(line => line.getAttribute('stroke-width') === '12');

    expect(heavyLines).toHaveLength(2);
    expect(heavyLines.map(line => [line.getAttribute('x1'), line.getAttribute('x2')])).toEqual([
      ['20', '40'],
      ['80', '100']
    ]);
  });
});
