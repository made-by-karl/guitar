import { Directive, ElementRef, HostListener, inject, OnDestroy, output } from '@angular/core';

/** Preserve native touch scrolling; movement, scroll and cancellation abort the hold. */
@Directive({ selector: '[appMeasureHold]', standalone: true })
export class MeasureHoldDirective implements OnDestroy {
  readonly measureHold = output<void>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private timer?: ReturnType<typeof setTimeout>;
  private start?: { x: number; y: number };
  private suppressClick = false;
  private readonly cancel = () => { clearTimeout(this.timer); this.start = undefined; };
  private readonly click = (event: Event) => {
    if (this.suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); this.suppressClick = false; }
  };
  constructor() {
    this.host.addEventListener('click', this.click, true);
    window.addEventListener('scroll', this.cancel, true);
  }
  @HostListener('pointerdown', ['$event']) down(event: PointerEvent): void {
    this.cancel();
    this.suppressClick = false;
    if (event.pointerType !== 'touch' || (event.target as HTMLElement).closest('button, input, select, textarea, a, [cdkDragHandle]')) return;
    this.start = { x: event.clientX, y: event.clientY };
    this.timer = setTimeout(() => { this.suppressClick = true; this.measureHold.emit(); this.cancel(); }, 500);
  }
  @HostListener('pointermove', ['$event']) move(event: PointerEvent): void {
    if (this.start && Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) > 10) this.cancel();
  }
  @HostListener('pointerup') up(): void { this.cancel(); }
  @HostListener('pointercancel') pointerCancel(): void { this.cancel(); }
  @HostListener('contextmenu', ['$event']) menu(event: Event): void { if (this.start || this.suppressClick) event.preventDefault(); }
  ngOnDestroy(): void { this.cancel(); this.host.removeEventListener('click', this.click, true); window.removeEventListener('scroll', this.cancel, true); }
}
