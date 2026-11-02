import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GripDiagramComponent } from '@/app/core/ui/grip-diagram/grip-diagram.component';
import { parseGrip } from '@/app/features/grips/services/grips/grip.model';

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

  it.each([
    '1|5|x|x|x|x',
    '8|12|x|x|x|x',
    'o|12|x|o|x|x',
    'o|o|o|o|o|o',
    'x|x|x|x|x|x'
  ])('shows all fretted notes for %s when they fit in five frets', grip => {
    fixture.componentRef.setInput('grip', parseGrip(grip));
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('[role="alert"]')).toBeNull();
    const svg = host.querySelector('svg')!;
    expect(svg).not.toBeNull();
    for (const circle of Array.from(svg.querySelectorAll('circle'))) {
      expect(Number(circle.getAttribute('cy'))).toBeGreaterThan(40);
      expect(Number(circle.getAttribute('cy'))).toBeLessThan(190);
    }
  });

  it.each([
    ['1|6|x|x|x|x', '1–6'],
    ['8|13|x|x|x|x', '8–13'],
    ['[1b&7]|1b|o|x|x|x', '1–7']
  ])('shows a range error over an empty fretboard for %s', (grip, range) => {
    fixture.componentRef.setInput('grip', parseGrip(grip));
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const backdrop = host.querySelector('.diagram-error-backdrop')!;
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
    expect(backdrop.querySelectorAll('svg line')).toHaveLength(12);
    expect(backdrop.querySelectorAll('circle, text')).toHaveLength(0);
    expect(Array.from(backdrop.querySelectorAll('line'), line => line.getAttribute('stroke')))
      .toEqual(Array(12).fill('currentColor'));
    expect(host.querySelector('[role="alert"]')!.textContent).toBe(`Frets ${range} exceed the 5-fret diagram.`);
  });

  it('clears the range error after correcting or removing the grip', () => {
    const host: HTMLElement = fixture.nativeElement;
    fixture.componentRef.setInput('grip', parseGrip('1|6|x|x|x|x'));
    fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    fixture.componentRef.setInput('grip', parseGrip('1|5|x|x|x|x'));
    fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelectorAll('circle')).toHaveLength(2);
    fixture.componentRef.setInput('grip', parseGrip('1|6|x|x|x|x'));
    fixture.detectChanges();
    fixture.componentRef.setInput('grip', undefined);
    fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('svg')).toBeNull();
  });
});
