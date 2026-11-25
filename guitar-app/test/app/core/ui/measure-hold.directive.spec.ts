import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MeasureHoldDirective } from '@/app/core/ui/music-clipboard/measure-hold.directive';

@Component({ standalone: true, imports: [MeasureHoldDirective], template: '<div appMeasureHold (measureHold)="holds = holds + 1" (click)="clicks = clicks + 1"><span>Measure</span><button>Action</button></div>' })
class Host { holds = 0; clicks = 0; }
function pointer(target: Element, type: string, x = 0, y = 0): void {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerType: 'touch', clientX: x, clientY: y });
  target.dispatchEvent(event);
}

describe('MeasureHoldDirective', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [Host] }));
  it('emits after a hold and consumes the following synthetic click without activating the measure', fakeAsync(() => {
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('div');
    pointer(row, 'pointerdown'); tick(501); pointer(row, 'pointerup'); row.click();
    expect(fixture.componentInstance.holds).toBe(1);
    expect(fixture.componentInstance.clicks).toBe(0);
    pointer(row, 'pointerdown'); pointer(row, 'pointerup'); row.click();
    expect(fixture.componentInstance.clicks).toBe(1);
  }));
  it('cancels on movement, scroll, pointer cancellation and destruction, and ignores action buttons', fakeAsync(() => {
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('div');
    pointer(row, 'pointerdown'); pointer(row, 'pointermove', 1, 15); tick(600);
    pointer(row, 'pointerdown'); window.dispatchEvent(new Event('scroll')); tick(600);
    pointer(row, 'pointerdown'); pointer(row, 'pointercancel'); tick(600);
    pointer(row.querySelector('button'), 'pointerdown'); tick(600);
    pointer(row, 'pointerdown'); fixture.destroy(); tick(600);
    expect(fixture.componentInstance.holds).toBe(0);
  }));
});
