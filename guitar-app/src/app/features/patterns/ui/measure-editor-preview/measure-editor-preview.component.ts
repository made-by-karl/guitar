import {
  afterRender, Component, DestroyRef, ElementRef, inject, input, NgZone, signal
} from '@angular/core';
import { Measure } from '@/app/features/patterns/services/playing-patterns.model';
import {
  PlayingActionsComponent, PlayingActionsNotationContext, PlayingActionsNotationHistoryEntry
} from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { chooseExposedMeasure, ViewportRect } from './measure-editor-visibility';

export interface EditorPreviewMeasure {
  label: string;
  measure: Measure;
  context: PlayingActionsNotationContext;
  history: PlayingActionsNotationHistoryEntry[];
}

@Component({
  selector: 'app-measure-editor-preview',
  imports: [PlayingActionsComponent],
  templateUrl: './measure-editor-preview.component.html',
  styleUrl: './measure-editor-preview.component.scss'
})
export class MeasureEditorPreviewComponent {
  readonly measures = input.required<EditorPreviewMeasure[]>();
  // The forms scroll here, in a separate pane below this component.
  readonly content = input.required<HTMLElement>();
  readonly alwaysAvailable = input(false);
  readonly selectedIndex = signal<number | null>(null);
  readonly visibleActions = signal<number[]>([], { equal: (a, b) => a.length === b.length && a.every((value, i) => value === b[i]) });
  readonly collapsed = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private root?: HTMLElement;
  private resizeObserver?: ResizeObserver;
  private observed = new Set<Element>();
  private frame: number | null = null;
  private correctFocus = false;
  private paneHeight = 0;
  private lastScrollTop = 0;
  private measureCount = 0;
  private shownMeasure?: Measure;
  private destroyed = false;
  private cleanups: (() => void)[] = [];

  constructor() {
    afterRender(() => this.zone.runOutsideAngular(() => {
      if (!this.root) this.connect();
      const height = this.host.getBoundingClientRect().height;
      // Preserve the physical form position when the separate pane changes height.
      // This also prevents show/hide feedback at a pattern metadata boundary.
      if (this.root && height !== this.paneHeight) {
        this.root.scrollTop = this.lastScrollTop + height - this.paneHeight;
        this.paneHeight = height;
      }
      this.lastScrollTop = this.root?.scrollTop ?? 0;
      this.observeGeometry();
      this.schedule();
    }));
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.resizeObserver?.disconnect();
      this.cleanups.forEach(cleanup => cleanup());
    });
  }

  get selected(): EditorPreviewMeasure | undefined {
    const index = this.selectedIndex() ?? (this.alwaysAvailable() ? 0 : null);
    return index === null ? undefined : this.measures()[index];
  }

  toggle(): void {
    this.collapsed.update(value => !value);
    this.correctFocus = true;
  }

  private connect(): void {
    let ancestor: HTMLElement | null = this.content();
    while (ancestor && !/(auto|scroll)/.test(getComputedStyle(ancestor).overflowY)) ancestor = ancestor.parentElement;
    this.root = ancestor ?? this.host.ownerDocument.documentElement;
    const root = this.root;
    const anchoring = root.style.overflowAnchor;
    root.style.overflowAnchor = 'none';
    this.cleanups.push(() => { root.style.overflowAnchor = anchoring; });
    this.paneHeight = this.host.getBoundingClientRect().height;
    this.lastScrollTop = root.scrollTop;
    this.resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => this.schedule());
    const listen = (target: EventTarget, type: string, listener: EventListener) => {
      target.addEventListener(type, listener, { passive: true });
      this.cleanups.push(() => target.removeEventListener(type, listener));
    };
    listen(this.root, 'scroll', () => {
      if (this.host.getBoundingClientRect().height === this.paneHeight) this.lastScrollTop = this.root!.scrollTop;
      this.schedule();
    });
    listen(window, 'resize', () => { this.correctFocus = true; this.schedule(); });
    listen(window, 'scroll', () => this.schedule());
    if (window.visualViewport) {
      listen(window.visualViewport, 'resize', () => { this.correctFocus = true; this.schedule(); });
      listen(window.visualViewport, 'scroll', () => this.schedule());
    }
    listen(this.content(), 'focusin', event => this.keepFocusVisible(event.target));
  }

  private observeGeometry(): void {
    if (!this.root || !this.resizeObserver) return;
    const elements = new Set<Element>([this.root, this.host, this.content(),
      ...this.content().querySelectorAll('[data-preview-measure], .action-position, .measure-controls, [data-preview-controls]')]);
    for (const element of this.observed) if (!elements.has(element)) this.resizeObserver.unobserve(element);
    for (const element of elements) if (!this.observed.has(element)) this.resizeObserver.observe(element);
    this.observed = elements;
  }

  private schedule(): void {
    if (this.destroyed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (!this.destroyed) this.refresh();
    });
  }

  private viewport(): ViewportRect {
    const root = this.root!;
    const bounds = root.getBoundingClientRect();
    const visual = window.visualViewport;
    const top = Math.max(bounds.top + root.clientTop, visual?.offsetTop ?? 0);
    const bottom = Math.min(bounds.top + root.clientTop + root.clientHeight, (visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight));
    return {
      top, bottom,
      left: Math.max(bounds.left + root.clientLeft, visual?.offsetLeft ?? 0),
      right: Math.min(bounds.left + root.clientLeft + root.clientWidth, (visual?.offsetLeft ?? 0) + (visual?.width ?? window.innerWidth))
    };
  }

  private refresh(): void {
    if (!this.root) return;
    const viewport = this.viewport();
    const usable = viewport;
    const measures = this.measures();
    let currentIndex = this.selectedIndex();
    if (measures.length !== this.measureCount && this.shownMeasure) {
      const retainedIndex = measures.findIndex(entry => entry.measure === this.shownMeasure);
      currentIndex = retainedIndex >= 0 ? retainedIndex : null;
    }
    const groups = [...this.content().querySelectorAll<HTMLElement>('[data-preview-measure]')];
    const selected = chooseExposedMeasure(groups.map(group => ({
      index: Number(group.dataset['previewMeasure']),
      cards: [...group.querySelectorAll<HTMLElement>('.action-position')].map(card => ({
        index: Number(card.dataset['actionIndex']), bounds: card.getBoundingClientRect()
      })),
      controls: [...group.querySelectorAll<HTMLElement>('.measure-controls, [data-preview-controls]')].map(control => control.getBoundingClientRect())
    })), usable, currentIndex);
    this.measureCount = measures.length;
    this.shownMeasure = selected ? measures[selected.index]?.measure : undefined;
    const nextActions = selected?.actions ?? [];
    if (this.selectedIndex() !== (selected?.index ?? null)
      || this.visibleActions().length !== nextActions.length || this.visibleActions().some((value, index) => value !== nextActions[index])) {
      this.zone.run(() => {
        this.selectedIndex.set(selected?.index ?? null);
        this.visibleActions.set(nextActions);
      });
    }
    // Also handle focus revealed by a viewport/keyboard resize or preview expansion.
    if (this.correctFocus) {
      this.correctFocus = false;
      this.keepFocusVisible(this.host.ownerDocument.activeElement);
    }
  }

  private keepFocusVisible(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement) || !this.root || !this.content().contains(target)
      || this.host.contains(target) || !target.matches('input, select, textarea, button')) return;
    const viewport = this.viewport();
    const top = viewport.top + 4;
    const bounds = target.getBoundingClientRect();
    // Correct the obscured edge only; never move focus or scroll the horizontal drawing here.
    if (bounds.top < top) this.root.scrollTop += bounds.top - top;
    else if (bounds.bottom > viewport.bottom) this.root.scrollTop += bounds.bottom - viewport.bottom + 4;
  }
}
