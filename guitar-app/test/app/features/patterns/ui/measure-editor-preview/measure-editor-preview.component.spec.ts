import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeasureEditorPreviewComponent } from '@/app/features/patterns/ui/measure-editor-preview/measure-editor-preview.component';

function rectangle(top: number, bottom: number): DOMRect {
  return { top, bottom, left: 0, right: 300, width: 300, height: bottom - top, x: 0, y: top, toJSON: () => ({}) };
}

describe('MeasureEditorPreviewComponent geometry lifecycle', () => {
  it('refreshes resized/replaced cards by original index, clears when none are exposed, and ignores callbacks after destruction', async () => {
    let frame: FrameRequestCallback | undefined;
    let resize: ResizeObserverCallback | undefined;
    const observe = jest.fn();
    const unobserve = jest.fn();
    const disconnect = jest.fn();
    const originalObserver = globalThis.ResizeObserver;
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
    const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { resize ??= callback; }
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    };
    const root = document.createElement('div');
    root.style.overflowY = 'auto';
    const computedStyle = jest.spyOn(window, 'getComputedStyle').mockImplementation(element => ({ overflowY: element === root ? 'auto' : 'visible' }) as CSSStyleDeclaration);
    root.style.overflowAnchor = 'auto';
    root.innerHTML = '<div data-preview-measure="0"><div class="measure-controls"></div><div class="action-position" data-action-index="2"></div></div>';
    document.body.append(root);
    Object.defineProperties(root, { clientHeight: { value: 500 }, clientWidth: { value: 300 } });
    root.getBoundingClientRect = () => rectangle(100, 600);
    const card = root.querySelector<HTMLElement>('.action-position')!;
    card.getBoundingClientRect = () => rectangle(50, 301);
    const controls = root.querySelector<HTMLElement>('.measure-controls')!;
    controls.getBoundingClientRect = () => rectangle(-100, -50);
    const flush = () => { const callback = frame; frame = undefined; callback?.(0); };
    try {
      await TestBed.configureTestingModule({ imports: [MeasureEditorPreviewComponent] }).compileComponents();
      const fixture = TestBed.createComponent(MeasureEditorPreviewComponent);
      TestBed.inject(ApplicationRef).attachView(fixture.componentRef.hostView);
      root.prepend(fixture.nativeElement);
      fixture.nativeElement.getBoundingClientRect = () => rectangle(100, 300);
      fixture.componentRef.setInput('content', root);
      const measure = { timeSignature: '4/4' as const, actions: Array(16).fill(null) };
      fixture.componentRef.setInput('measures', [{ label: 'Measure 1', measure, context: {}, history: [] }]);
      fixture.detectChanges();
      TestBed.inject(ApplicationRef).tick();
      flush();
      expect(raf).toHaveBeenCalled();
      expect(observe).toHaveBeenCalled();
      expect(fixture.componentInstance.visibleActions()).toEqual([2]);

      card.getBoundingClientRect = () => rectangle(50, 100);
      resize?.([], {} as ResizeObserver);
      flush();
      expect(fixture.componentInstance.visibleActions()).toEqual([]);
      expect(fixture.componentInstance.selectedIndex()).toBeNull();
      controls.getBoundingClientRect = () => rectangle(350, 400);
      resize?.([], {} as ResizeObserver);
      flush();
      expect(fixture.componentInstance.selectedIndex()).toBe(0);

      card.dataset['actionIndex'] = '4';
      card.getBoundingClientRect = () => rectangle(300, 800);
      fixture.detectChanges();
      TestBed.inject(ApplicationRef).tick();
      flush();
      expect(fixture.componentInstance.visibleActions()).toEqual([4]);
      fixture.componentInstance.toggle();
      expect(fixture.componentInstance.collapsed()).toBe(true);
      expect(measure.actions.every(action => action === null)).toBe(true);

      resize?.([], {} as ResizeObserver);
      const lateFrame = frame;
      fixture.destroy();
      const calls = raf.mock.calls.length;
      resize?.([], {} as ResizeObserver);
      lateFrame?.(0);
      root.dispatchEvent(new Event('scroll'));
      expect(raf).toHaveBeenCalledTimes(calls);
      expect(disconnect).toHaveBeenCalled();
      expect(cancel).toHaveBeenCalled();
      expect(root.style.overflowAnchor).toBe('auto');
    } finally {
      root.remove();
      globalThis.ResizeObserver = originalObserver;
      raf.mockRestore();
      cancel.mockRestore();
      computedStyle.mockRestore();
    }
  });
});
