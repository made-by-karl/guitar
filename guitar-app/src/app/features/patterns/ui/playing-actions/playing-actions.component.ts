import {
  afterRenderEffect, ChangeDetectionStrategy, Component, computed, ElementRef, forwardRef, input,
  signal, viewChild, viewChildren
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimeSignature } from '@/app/core/music/rhythm/time-signature.model';
import { Grip } from '@/app/features/grips/services/grips/grip.model';
import {
  BaseRelativePickingNote,
  ExplicitLegatoNote,
  GripRelativePickingNote,
  Measure,
  PlayingAction,
  PlayingPatternActionGrip,
  RelativeLegatoNote,
  RelativeString,
  getBeatsFromTimeSignature,
  getLegatoMode,
  getStringsForStrum,
  isRelativeLegatoNote,
  isRelativePickingNote,
  isRelativeStrumRange
} from '@/app/features/patterns/services/playing-patterns.model';
import {
  resolveSlideTargets,
  resolveNotationGrip,
  resolveRelativeLegatoEndpointFret,
  resolveRelativePickFret,
  resolveRelativeStringIndex,
  resolveRelativeStrumRange
} from '@/app/features/patterns/services/playing-pattern-notation-resolver';
import { layoutGripLabels, MeasuredGripLabel } from './grip-label-layout';

import { PlaybackHighlight, PlaybackHighlightView } from '@/app/core/services/playback-highlight';
import { PLAYBACK_HIGHLIGHT_VIEW } from '@/app/core/ui/playback-highlight/playback-highlight.directive';

export interface PlayingActionsNotationContext {
  timeSignature?: TimeSignature;
  actionGrips?: PlayingPatternActionGrip[];
  gripById?: Record<string, Grip | undefined>;
  initialGrip?: Grip;
}

export interface PlayingActionsNotationHistoryEntry {
  measure: Measure;
  context?: PlayingActionsNotationContext;
}

interface NotationMeasureSlot {
  measure: Measure;
  measureIndex: number;
  measureStartIndex: number;
  measureEndIndex: number;
  localActionIndex: number;
  context: PlayingActionsNotationContext | undefined;
}

interface SlotPickMark {
  x: number;
  y: number;
  label: string;
}

interface SlideMark extends SlotPickMark {
  startX: number;
  startY: number;
  endY: number;
}

interface ModifierMark {
  label: string;
  x: number;
  y: number;
}

interface RhythmMarker {
  actionIndex: number;
  label: string;
}

interface MeasureDivider {
  actionIndex: number;
  x: number;
}

interface ActionGripLabel {
  actionIndex: number;
  label: string;
  x: number;
}

interface ActionGripLabelPosition {
  left: number;
  top: number;
  leader: string | null;
}

interface RenderableActionSlot {
  actionIndex: number;
  action: PlayingAction | null;
}

interface RenderableActionSegment {
  actionIndex: number;
  actions: RenderableActionSlot[];
  span: number;
  compression: number;
  width: number;
}

interface NotationStringState {
  fret: number;
  label: string;
}

interface ResolvedLegatoRender {
  string: number;
  targetFret: number;
  targetLabel: string;
  sourceLabel?: string;
}

@Component({
  selector: 'app-playing-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: PLAYBACK_HIGHLIGHT_VIEW, useExisting: forwardRef(() => PlayingActionsComponent) }],
  imports: [CommonModule],
  templateUrl: './playing-actions.component.html',
  styleUrl: './playing-actions.component.scss'
})
export class PlayingActionsComponent implements PlaybackHighlightView {
  readonly strings = [0, 1, 2, 3, 4, 5];
  readonly slotTop = 12;
  readonly gripLabelTopBand = 15;
  readonly baseSvgHeight = 104;
  readonly stringSpacing = 13;
  readonly slotSpacing = 22;
  readonly legatoLineSourceGap = 8;

  measures = input.required<Measure[]>();
  readonly playbackPosition = signal<PlaybackHighlight | undefined>(undefined);

  highlightPlayback(position: PlaybackHighlight | undefined): void { this.playbackPosition.set(position); }
  readonly playbackSlot = computed(() => {
    const position = this.playbackPosition();
    return position ? (this.measureStarts()[position.measureIndex] ?? 0) + position.actionIndex : undefined;
  });
  // Editor-only layout and orientation; independent of any playback position.
  compact = input(false);
  /** Opt-in keyboard access to the contained notation scroller. */
  scrollLabel = input<string | undefined>();
  visibleActionIndices = input<readonly number[]>([]);
  showActionIndex = input<boolean>(false);
  measureWidth = input<string>('100%');
  notationContexts = input<PlayingActionsNotationContext[] | undefined>(undefined);
  // Replay earlier measures for note/grip state without drawing them.
  notationHistory = input<PlayingActionsNotationHistoryEntry[]>([]);

  // Continuous scores keep their notation data mounted. Index immutable inputs
  // once so moving a marker does not flatten/search the full score per SVG mark.
  private readonly timelineActions = computed(() => this.measures().flatMap(measure => measure.actions));
  private readonly measureStarts = computed(() => {
    let start = 0;
    return this.measures().map(measure => { const current = start; start += measure.actions.length; return current; });
  });
  private readonly measureSlots = computed(() => this.measures().flatMap((measure, measureIndex) => {
    const measureStartIndex = this.measureStarts()[measureIndex];
    const context = this.getNotationContextForMeasure(measureIndex);
    return measure.actions.map((_, localActionIndex): NotationMeasureSlot => ({
      measure, measureIndex, measureStartIndex, measureEndIndex: measureStartIndex + measure.actions.length, localActionIndex, context
    }));
  }));
  private readonly segmentBySlot = computed(() => {
    const segments: RenderableActionSegment[] = [];
    for (const segment of this.renderableActionSegments()) {
      for (let index = segment.actionIndex; index < segment.actionIndex + segment.span; index++) segments[index] = segment;
    }
    return segments;
  });

  private readonly notationElement = viewChild<ElementRef<HTMLDivElement>>('notation');
  private readonly segmentElements = viewChildren<ElementRef<SVGSVGElement>>('notationSegment');
  private readonly labelElements = viewChildren<ElementRef<HTMLSpanElement>>('gripLabel');
  private readonly layoutRevision = signal(0);
  private readonly labelBandHeight = signal(this.gripLabelTopBand);
  private readonly gripLabelsPresent = computed(() => (this.notationContexts() ?? [])
    .some(context => (context.actionGrips ?? []).some(grip => !!grip.name)));
  readonly labelPositions = signal(new Map<number, ActionGripLabelPosition>(), {
    // Parents can supply fresh context objects on each check. Identical geometry must
    // not request another render (and another set of those objects).
    equal: (previous, next) => previous.size === next.size && [...previous].every(([index, position]) => {
      const candidate = next.get(index);
      return candidate?.left === position.left && candidate.top === position.top && candidate.leader === position.leader;
    })
  });
  readonly actionGripLabels = computed(() => this.renderableActionSegments()
    .flatMap(segment => this.getSegmentActionGripLabels(segment)));

  constructor() {
    // Observe width, including changes caused by a sidebar/dialog rather than a window resize.
    afterRenderEffect(onCleanup => {
      if (!this.hasActionGripLabels() && !this.compact()) return;
      const notation = this.notationElement()?.nativeElement;
      const element = this.compact() ? notation?.parentElement : notation;
      if (!element || typeof ResizeObserver === 'undefined') return;
      let previousWidth = -1;
      const observer = new ResizeObserver(entries => {
        const width = entries[0]?.contentRect.width ?? 0;
        if (width !== previousWidth) {
          previousWidth = width;
          this.layoutRevision.update(revision => revision + 1);
        }
      });
      observer.observe(element);
      onCleanup(() => observer.disconnect());
    });
    afterRenderEffect({ read: () => this.measureGripLabels() });
    afterRenderEffect({ read: () => this.revealVisibleActions() });
    afterRenderEffect({ read: () => this.revealPlaybackPosition() });

    // A newly loaded font can change text bounds without changing the container width.
    afterRenderEffect(onCleanup => {
      if (!this.hasActionGripLabels()) return;
      const fontSet = this.notationElement()?.nativeElement.ownerDocument.fonts;
      if (!fontSet) return;
      let active = true;
      const refresh = () => {
        if (active) this.layoutRevision.update(revision => revision + 1);
      };
      void fontSet.ready.then(refresh);
      fontSet.addEventListener('loadingdone', refresh);
      onCleanup(() => {
        active = false;
        fontSet.removeEventListener('loadingdone', refresh);
      });
    });
  }

  getSegmentSlotIndices(segment: RenderableActionSegment): number[] {
    return Array.from({ length: segment.span }, (_, index) => segment.actionIndex + index);
  }

  getPlaybackMeasureBand(segment: RenderableActionSegment): { x: number; width: number } | undefined {
    const position = this.playbackPosition();
    if (!position) return undefined;
    const first = this.measureStarts()[position.measureIndex] ?? 0;
    const end = first + (this.measures()[position.measureIndex]?.actions.length ?? 0);
    const left = Math.max(first, segment.actionIndex);
    const right = Math.min(end, segment.actionIndex + segment.span);
    return right > left ? { x: this.getActionSlotLeft(left), width: (right - left) * this.slotSpacing / segment.compression } : undefined;
  }

  private revealPlaybackPosition(): void {
    // Resume reanchors a score browsed while paused, even within the same slot.
    this.playbackPosition();
    this.playbackSlot();
    if (!this.compact()) return;
    const scroller = this.notationElement()?.nativeElement.parentElement;
    const marker = scroller?.querySelector<SVGRectElement>('.playback-action-slot');
    if (!scroller || !marker || scroller.clientWidth === 0) return;
    const bounds = marker.getBoundingClientRect();
    const viewport = scroller.getBoundingClientRect();
    // Only move this drawing's horizontal viewport. Never scroll the page or an
    // editor's forms, even when the user has moved away from the playing view.
    if (bounds.left < viewport.left || bounds.right > viewport.right) {
      scroller.scrollLeft += bounds.left - viewport.left - scroller.clientWidth * 0.6;
    }
  }

  private revealVisibleActions(): void {
    const indices = this.visibleActionIndices();
    if (this.playbackPosition()) return;
    this.layoutRevision();
    this.renderableActionSegments();
    this.labelBandHeight();
    if (!this.compact() || indices.length === 0) return;
    const element = this.notationElement()?.nativeElement.parentElement;
    if (!element || element.clientWidth === 0) return;
    const marks = Array.from(element.querySelectorAll<SVGRectElement>('.visible-action-slot.in-view'));
    if (marks.length === 0) return;
    const viewport = element.getBoundingClientRect();
    const bounds = marks.map(mark => mark.getBoundingClientRect());
    const left = Math.min(...bounds.map(bound => bound.left)) - viewport.left + element.scrollLeft;
    const right = Math.max(...bounds.map(bound => bound.right)) - viewport.left + element.scrollLeft;
    if (right - left > element.clientWidth || left < element.scrollLeft) {
      element.scrollLeft = left;
    } else if (right > element.scrollLeft + element.clientWidth) {
      element.scrollLeft = right - element.clientWidth;
    }
  }

  private measureGripLabels(): void {
    this.layoutRevision();
    const bandHeight = this.labelBandHeight();
    const labels = this.actionGripLabels();
    const labelElements = this.labelElements();
    const segments = this.renderableActionSegments();
    const segmentElements = this.segmentElements();
    const element = this.notationElement()?.nativeElement;
    if (labels.length === 0) {
      this.labelBandHeight.set(this.gripLabelTopBand);
      this.labelPositions.set(new Map());
      return;
    }
    if (!element || element.clientWidth === 0) return;

    const container = element.getBoundingClientRect();
    const segmentBounds = segmentElements.map(segment => segment.nativeElement.getBoundingClientRect());
    const rowTops = [...new Set(segmentBounds.map(bounds => bounds.top))];
    const measured: MeasuredGripLabel[] = [];
    for (let index = 0; index < labels.length; index++) {
      const label = labels[index];
      const segmentIndex = segments.findIndex(segment => label.actionIndex >= segment.actionIndex
        && label.actionIndex < segment.actionIndex + segment.span);
      const bounds = segmentBounds[segmentIndex];
      const text = labelElements[index]?.nativeElement.getBoundingClientRect();
      if (!bounds || !text) continue;
      measured.push({
        actionIndex: label.actionIndex,
        row: rowTops.indexOf(bounds.top),
        anchorX: bounds.left - container.left - element.clientLeft + label.x,
        width: text.width,
        height: text.height
      });
    }

    const layout = layoutGripLabels(measured, element.clientWidth);
    const positions = new Map<number, ActionGripLabelPosition>();
    for (const label of layout.placements) {
      const rowTop = rowTops[label.row] - container.top - element.clientTop;
      const bottom = rowTop + bandHeight - label.bottom;
      const anchorY = rowTop + bandHeight + this.slotTop - 3;
      positions.set(label.actionIndex, {
        left: label.left,
        top: bottom - label.height,
        leader: label.leader
          ? `${label.left + label.width / 2},${bottom + 1} ${label.anchorX},${anchorY - 3} ${label.anchorX},${anchorY}`
          : null
      });
    }
    // Re-measure after changing the band: wrapped rows will have new vertical positions.
    this.labelBandHeight.set(layout.bandHeight);
    this.labelPositions.set(positions);
  }

  private readonly historySlotCount = computed(() =>
    this.notationHistory().reduce((count, entry) => count + entry.measure.actions.length, 0));
  private readonly notationTimeline = computed<PlayingActionsNotationHistoryEntry[]>(() => [
    ...this.notationHistory(),
    ...this.measures().map((measure, index) => ({ measure, context: this.getNotationContextForMeasure(index) }))
  ]);

  private readonly notationSlotsPerBeat = computed(() => {
    let slotsPerBeat = 1;
    for (let measureIndex = 0; measureIndex < this.measures().length; measureIndex++) {
      const measure = this.measures()[measureIndex];
      const context = this.getNotationContextForMeasure(measureIndex);
      const beats = getBeatsFromTimeSignature(context?.timeSignature ?? measure.timeSignature);
      const rawSlotsPerBeat = measure.actions.length / beats;
      if (rawSlotsPerBeat < 1) continue;

      const fitsEighthGrid = !this.compact() && rawSlotsPerBeat >= 4 && rawSlotsPerBeat % 2 === 0
        && measure.actions.every((action, index) => !action || index % 2 === 0)
        && (context?.actionGrips ?? []).every(grip => grip.actionIndex % 2 === 0);
      slotsPerBeat = Math.max(slotsPerBeat, fitsEighthGrid ? rawSlotsPerBeat / 2 : rawSlotsPerBeat);
    }
    return slotsPerBeat;
  });

  readonly renderableActionSegments = computed<RenderableActionSegment[]>(() => {
    const actions = this.getTimelineActions();
    if (actions.length === 0) {
      return [{
        actionIndex: 0,
        actions: [],
        span: 1,
        compression: 1,
        width: this.slotSpacing
      }];
    }

    const segments: RenderableActionSegment[] = [];
    for (let actionIndex = 0; actionIndex < actions.length;) {
      const minimumSegmentSpan = this.getMinimumSegmentSpan(actionIndex);
      const rawSlotsPerBeat = this.getRawSlotsPerBeat(actionIndex);
      const endIndex = this.getSegmentEndIndex(actions, actionIndex, minimumSegmentSpan);
      const span = endIndex - actionIndex;
      const compression = rawSlotsPerBeat >= 1 ? rawSlotsPerBeat / this.notationSlotsPerBeat() : 1;

      segments.push({
        actionIndex,
        actions: this.getSegmentActions(actions, actionIndex, endIndex),
        span,
        compression,
        width: this.slotSpacing * span / compression
      });
      actionIndex = endIndex;
    }

    return segments;
  });

  readonly resolvedGripTimeline = computed(() => {
    const timeline = new Map<number, Grip | undefined>();
    let currentGrip = this.notationTimeline()[0]?.context?.initialGrip;
    let measureStartIndex = -this.historySlotCount();

    for (const { measure, context } of this.notationTimeline()) {
      const actionGrips = context?.actionGrips ?? [];
      const gripById = context?.gripById ?? {};

      for (let actionIndex = 0; actionIndex < measure.actions.length; actionIndex++) {
        const globalActionIndex = measureStartIndex + actionIndex;
        const actionGrip = actionGrips.find(grip => grip.actionIndex === actionIndex);
        if (actionGrip?.gripId) {
          currentGrip = resolveNotationGrip(actionGrip.gripId, gripById) ?? currentGrip;
        }

        timeline.set(globalActionIndex, currentGrip);
      }

      measureStartIndex += measure.actions.length;
    }

    return timeline;
  });

  readonly resolvedStringStateTimeline = computed(() => {
    const timeline = new Map<number, Map<number, NotationStringState>>();
    const stringState = new Map<number, NotationStringState>();
    const actions = this.notationTimeline().flatMap(entry => entry.measure.actions);

    for (let index = 0; index < actions.length; index++) {
      const actionIndex = index - this.historySlotCount();
      timeline.set(actionIndex, new Map(stringState));

      const action = actions[index];
      if (action) {
        this.applyActionToStringState(actionIndex, action, stringState);
      }
    }

    return timeline;
  });

  getSlotCount(): number {
    return Math.max(1, this.getTimelineActions().length);
  }

  getRenderableSegments(): RenderableActionSegment[] {
    return this.renderableActionSegments();
  }

  getActionSvgViewBox(actionIndex: number): string {
    return `0 0 ${this.getActionSvgWidth(actionIndex)} ${this.getActionSvgHeight()}`;
  }

  getActionSvgWidth(actionIndex: number): number {
    return this.findSegmentForAction(actionIndex)?.width ?? (this.slotSpacing * 0.55);
  }

  getActionSvgHeight(): number {
    return this.baseSvgHeight + this.getGripLabelTopOffset();
  }

  getActionSvgPixelWidth(actionIndex: number): number {
    return this.getActionSvgWidth(actionIndex);
  }

  hasActionGripLabels(): boolean {
    return this.gripLabelsPresent();
  }

  getActionX(actionIndex: number): number {
    const segment = this.findSegmentForAction(actionIndex);
    if (!segment) {
      return this.getActionSvgWidth(actionIndex) / 2;
    }

    const action = this.getTimelineActions()[actionIndex];
    if (action && this.isLegatoAction(action)) {
      return this.getLegatoTargetX(actionIndex);
    }

    return this.getActionSlotLeft(actionIndex) + (this.getActionSlotWidth(actionIndex) / 2);
  }

  getActionSlotLeft(actionIndex: number): number {
    const segment = this.findSegmentForAction(actionIndex);
    if (!segment) {
      return 0;
    }

    return ((actionIndex - segment.actionIndex) / segment.compression) * this.slotSpacing;
  }

  getActionSlotRight(actionIndex: number): number {
    return this.getActionSlotLeft(actionIndex) + this.getActionSlotWidth(actionIndex);
  }

  getActionSlotCenterX(actionIndex: number): number {
    return this.getActionSlotLeft(actionIndex) + (this.getActionSlotWidth(actionIndex) / 2);
  }

  getSlotSeparatorX(actionIndex: number): number {
    return Math.max(0, this.getActionSvgWidth(actionIndex) - 0.4);
  }

  getSlotStartSeparatorX(): number {
    return 0.4;
  }

  getRhythmMarkerY(): number {
    return this.stringY(0) + 14;
  }

  getRhythmMarker(actionIndex: number): string | null {
    const measureInfo = this.getMeasureInfoForAction(actionIndex);
    if (!measureInfo) {
      return null;
    }

    const beats = getBeatsFromTimeSignature(measureInfo.context?.timeSignature ?? measureInfo.measure.timeSignature);
    if (measureInfo.measure.actions.length === 0 || beats <= 0) {
      return null;
    }

    const actionsPerBeat = measureInfo.measure.actions.length / beats;
    if (!Number.isFinite(actionsPerBeat) || actionsPerBeat < 1) {
      return null;
    }

    const beatPosition = measureInfo.localActionIndex / actionsPerBeat;
    const nearestBeat = Math.round(beatPosition);
    if (Math.abs(beatPosition - nearestBeat) < 0.001) {
      return `${nearestBeat + 1}`;
    }

    const nearestHalfBeat = Math.round(beatPosition * 2) / 2;
    const isHalfBeat = Math.abs(beatPosition - nearestHalfBeat) < 0.001 && Math.abs(nearestHalfBeat % 1 - 0.5) < 0.001;
    if (isHalfBeat) {
      return '&';
    }

    if (this.compact()) {
      const sixteenth = Math.round(beatPosition * 4) % 4;
      return sixteenth === 1 ? 'e' : sixteenth === 3 ? 'a' : null;
    }
    return null;
  }

  getSegmentRhythmMarkers(segment: RenderableActionSegment): RhythmMarker[] {
    const markers: RhythmMarker[] = [];
    const endIndex = Math.min(this.getTimelineActions().length, segment.actionIndex + segment.span);

    for (let actionIndex = segment.actionIndex; actionIndex < endIndex; actionIndex++) {
      const marker = this.getRhythmMarker(actionIndex);
      if (marker) {
        markers.push({ actionIndex, label: marker });
      }
    }

    return markers;
  }

  getSegmentMeasureDividers(segment: RenderableActionSegment): MeasureDivider[] {
    const segmentEndIndex = segment.actionIndex + segment.span;

    return this.getMeasureBoundaryActionIndices()
      .filter(actionIndex => actionIndex > segment.actionIndex && actionIndex <= segmentEndIndex)
      .map(actionIndex => ({
        actionIndex,
        x: Math.min(
          segment.width - 0.4,
          ((actionIndex - segment.actionIndex) / segment.compression) * this.slotSpacing
        )
      }));
  }

  getSegmentActionGripLabels(segment: RenderableActionSegment): ActionGripLabel[] {
    const labels: ActionGripLabel[] = [];
    const endIndex = Math.min(this.getTimelineActions().length, segment.actionIndex + segment.span);

    for (let actionIndex = segment.actionIndex; actionIndex < endIndex; actionIndex++) {
      const actionGrip = this.getActionGripForGlobalAction(actionIndex);
      if (actionGrip?.name) {
        labels.push({
          actionIndex,
          label: actionGrip.name,
          x: this.getActionSlotCenterX(actionIndex)
        });
      }
    }

    return labels;
  }

  hasMeasureDividerAtSegmentEnd(segment: RenderableActionSegment): boolean {
    return this.getMeasureBoundaryActionIndices().includes(segment.actionIndex + segment.span);
  }

  isFirstSegment(segment: RenderableActionSegment): boolean {
    return segment.actionIndex === 0;
  }

  isLastSegment(segment: RenderableActionSegment): boolean {
    return segment.actionIndex + segment.span >= this.getSlotCount();
  }

  getActionTitle(action: PlayingAction | null, actionIndex: number): string {
    if (!action) {
      return `Action ${actionIndex + 1}: rest`;
    }

    const articulation = action.articulation && action.articulation !== 'normal' ? `${action.articulation} ` : '';
    if (action.technique === 'strum') {
      const direction = action.strum?.direction === 'D' ? 'down' : 'up';
      return `Action ${actionIndex + 1}: ${articulation}strum ${direction}`;
    }

    if (action.technique === 'pick') {
      return `Action ${actionIndex + 1}: ${articulation}pick`;
    }

    if (action.technique === 'percussive') {
      return `Action ${actionIndex + 1}: ${action.percussive?.technique ?? 'body-knock'}`;
    }

    return `Action ${actionIndex + 1}: ${action.technique}`;
  }

  getTechniqueTag(action: PlayingAction | null): string {
    if (!action) {
      return '';
    }

    if (action.technique === 'hammer-on') return 'H';
    if (action.technique === 'pull-off') return 'P';
    if (action.technique === 'slide') return '/';
    if (action.technique === 'percussive') return 'X';
    return '';
  }

  stringY(stringIndex: number): number {
    return this.slotTop + this.getGripLabelTopOffset() + (5 - stringIndex) * this.stringSpacing;
  }

  private getGripLabelTopOffset(): number {
    return this.hasActionGripLabels() ? this.labelBandHeight() : 0;
  }

  getStrumMinY(actionIndex: number, action: PlayingAction): number {
    const strings = this.getStrumStringIndices(actionIndex, action);
    return this.stringY(strings.length > 0 ? Math.max(...strings) : 2);
  }

  getStrumMaxY(actionIndex: number, action: PlayingAction): number {
    const strings = this.getStrumStringIndices(actionIndex, action);
    return this.stringY(strings.length > 0 ? Math.min(...strings) : 2);
  }

  getStrumArrowY(actionIndex: number, action: PlayingAction): number {
    return action.strum?.direction === 'U'
      ? this.getStrumMinY(actionIndex, action) + 5
      : this.getStrumMaxY(actionIndex, action) - 5;
  }

  getStrumHeadPoints(actionIndex: number, action: PlayingAction): string {
    const x = this.getActionX(actionIndex);
    const size = 4.8;
    if (action.strum?.direction === 'U') {
      const y = this.getStrumMinY(actionIndex, action) - 1.2;
      return `${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}`;
    }

    const y = this.getStrumMaxY(actionIndex, action) + 1.2;
    return `${x},${y + size} ${x - size},${y - size} ${x + size},${y - size}`;
  }

  getStrumStemTop(actionIndex: number, action: PlayingAction): number {
    if (action.strum?.direction === 'U') {
      return this.getStrumMinY(actionIndex, action) + 3.5;
    }

    return this.getStrumMinY(actionIndex, action);
  }

  getStrumStemBottom(actionIndex: number, action: PlayingAction): number {
    if (action.strum?.direction === 'U') {
      return this.getStrumMaxY(actionIndex, action);
    }

    return this.getStrumMaxY(actionIndex, action) - 3.5;
  }

  getPickMarks(actionIndex: number, action: PlayingAction): SlotPickMark[] {
    if (!action.pick || action.pick.length === 0) {
      return [];
    }

    const grip = this.resolvedGripTimeline().get(actionIndex);
    const marks: SlotPickMark[] = [];
    const baseX = this.getActionX(actionIndex);

    action.pick.forEach(note => {
      if (isRelativePickingNote(note)) {
        const stringIndex = resolveRelativeStringIndex(grip, note.string);
        const y = this.stringY(stringIndex);

        if (!grip) {
          marks.push({ x: baseX, y, label: this.getRelativeStringShortLabel(note.string, note as GripRelativePickingNote | BaseRelativePickingNote) });
          return;
        }

        const fret = resolveRelativePickFret(grip, stringIndex, note as GripRelativePickingNote | BaseRelativePickingNote);
        marks.push({ x: baseX, y, label: `${fret}` });
        return;
      }

      marks.push({
        x: baseX,
        y: this.stringY(note.string),
        label: note.fret < 0 ? 'x' : `${note.fret}`
      });
    });

    return this.spreadPickMarksOnSameString(marks, baseX);
  }

  getSlideMarks(actionIndex: number, action: PlayingAction): SlideMark[] {
    const state = this.resolvedStringStateTimeline().get(actionIndex) ?? new Map<number, NotationStringState>();
    const target = this.resolveLegatoTarget(actionIndex, action);
    const targets = action.slide
      ? resolveSlideTargets(action.slide, state).map(note => ({ ...note, label: `${note.toFret}` }))
      : target ? [{
        string: target.string,
        fromFret: state.get(target.string)?.fret,
        toFret: target.targetFret,
        label: target.targetLabel
      }] : [];
    return targets.map(note => {
      const x = this.getLegatoTargetX(actionIndex);
      const y = this.stringY(note.string);
      const direction = note.toFret < (note.fromFret ?? note.toFret) ? -1 : 1;
      const startX = Math.max(1, x - 14);
      return {
        x, y, label: note.label, startX,
        startY: y + direction * 2.5,
        endY: y - direction * 2.5
      };
    });
  }

  getLegatoStringY(actionIndex: number, action: PlayingAction): number {
    const resolved = this.resolveLegato(actionIndex, action);
    return resolved ? this.stringY(resolved.string) : this.stringY(2);
  }

  getLegatoTargetLabel(actionIndex: number, action: PlayingAction): string {
    const resolved = this.resolveLegato(actionIndex, action);
    return resolved?.targetLabel ?? '';
  }

  hasLegatoLine(actionIndex: number, action: PlayingAction): boolean {
    if (!this.hasLegatoSource(actionIndex, action)) {
      return false;
    }

    const previousActionIndex = this.getPreviousRenderableActionIndex(this.getTimelineActions(), actionIndex);
    return previousActionIndex !== null && this.findSegmentForAction(previousActionIndex) === this.findSegmentForAction(actionIndex);
  }

  getModifierMarks(actionIndex: number, action: PlayingAction): ModifierMark[] {
    const labels: string[] = [];
    if (action.articulation === 'mute') labels.push('M');
    if (action.articulation === 'palm-mute') labels.push('PM');
    if (action.modifiers?.includes('accent')) labels.push('A');

    if (action.technique === 'strum' && action.strum) {
      const baseX = this.getActionX(actionIndex);
      const arrowStartY = action.strum.direction === 'U'
        ? this.getStrumMaxY(actionIndex, action)
        : this.getStrumMinY(actionIndex, action);

      return labels.map((label, index) => ({
        label,
        x: baseX,
        y: action.strum!.direction === 'U'
          ? arrowStartY + 9 + (index * 8)
          : arrowStartY - 4 - ((labels.length - 1 - index) * 8)
      }));
    }

    const baseX = this.getActionX(actionIndex) + 8;
    const baseY = this.stringY(0) + 8;

    return labels.map((label, index) => ({
      label,
      x: baseX,
      y: baseY + ((index - ((labels.length - 1) / 2)) * 8)
    }));
  }

  getPercussiveLabel(action: PlayingAction): string {
    return action.percussive?.technique === 'string-slap' ? 'S' : 'B';
  }

  getLegatoStartX(actionIndex: number): number {
    const previousActionIndex = this.getPreviousRenderableActionIndex(this.getTimelineActions(), actionIndex);
    return previousActionIndex === null
      ? this.getActionSlotCenterX(actionIndex)
      : this.getActionX(previousActionIndex) + this.legatoLineSourceGap;
  }

  getLegatoTargetX(actionIndex: number): number {
    return this.getActionSlotCenterX(actionIndex);
  }

  private getActionSlotWidth(actionIndex: number): number {
    return this.slotSpacing;
  }

  private getSegmentActions(
    actions: (PlayingAction | null)[],
    startIndex: number,
    endIndex: number
  ): RenderableActionSlot[] {
    const segmentActions: RenderableActionSlot[] = [];

    for (let actionIndex = startIndex; actionIndex < endIndex; actionIndex++) {
      const action = actions[actionIndex];
      if (action) {
        segmentActions.push({ actionIndex, action });
      }
    }

    return segmentActions;
  }

  private findSegmentForAction(actionIndex: number): RenderableActionSegment | undefined {
    return this.segmentBySlot()[actionIndex];
  }

  private getMinimumSegmentSpan(actionIndex: number): number {
    return Math.max(1, Math.round(this.getRawSlotsPerBeat(actionIndex)));
  }

  private getRawSlotsPerBeat(actionIndex: number): number {
    const measureInfo = this.getMeasureInfoForAction(actionIndex);
    if (!measureInfo) {
      return 1;
    }

    const beats = getBeatsFromTimeSignature(measureInfo.context?.timeSignature ?? measureInfo.measure.timeSignature);
    return beats > 0 && measureInfo.measure.actions.length > 0
      ? measureInfo.measure.actions.length / beats
      : 1;
  }

  private getSegmentEndIndex(
    actions: (PlayingAction | null)[],
    startIndex: number,
    minimumSegmentSpan: number
  ): number {
    const measureEndIndex = Math.min(actions.length, this.getMeasureEndActionIndex(startIndex));
    let endIndex = Math.min(measureEndIndex, startIndex + minimumSegmentSpan);

    while (true) {
      const connectedLegatoEndIndex = this.getConnectedLegatoEndIndex(actions, startIndex, endIndex, measureEndIndex);
      if (connectedLegatoEndIndex <= endIndex) {
        return endIndex;
      }

      endIndex = connectedLegatoEndIndex;
    }
  }

  private getConnectedLegatoEndIndex(
    actions: (PlayingAction | null)[],
    startIndex: number,
    endIndex: number,
    measureEndIndex: number
  ): number {
    for (let actionIndex = endIndex; actionIndex < measureEndIndex; actionIndex++) {
      const action = actions[actionIndex];
      if (!action) {
        continue;
      }

      if (!this.isLegatoAction(action) || action.technique === 'slide') {
        return endIndex;
      }

      const previousActionIndex = this.getPreviousRenderableActionIndex(actions, actionIndex);
      if (previousActionIndex !== null && previousActionIndex >= startIndex && previousActionIndex < endIndex) {
        return actionIndex + 1;
      }

      return endIndex;
    }

    return endIndex;
  }

  private getPreviousRenderableActionIndex(actions: (PlayingAction | null)[], actionIndex: number): number | null {
    for (let previousIndex = actionIndex - 1; previousIndex >= 0; previousIndex--) {
      if (actions[previousIndex]) {
        return previousIndex;
      }
    }

    return null;
  }

  private hasLegatoSource(actionIndex: number, action: PlayingAction): boolean {
    return !!this.resolveLegato(actionIndex, action)?.sourceLabel;
  }

  private isLegatoAction(action: PlayingAction): boolean {
    return !!(action.legato || action.slide) && (
      action.technique === 'hammer-on'
      || action.technique === 'pull-off'
      || action.technique === 'slide'
    );
  }

  private getTimelineActions(): (PlayingAction | null)[] {
    return this.timelineActions();
  }

  private getNotationContextForMeasure(measureIndex: number): PlayingActionsNotationContext | undefined {
    return this.notationContexts()?.[measureIndex];
  }

  private getMeasureInfoForAction(actionIndex: number): NotationMeasureSlot | undefined {
    return this.measureSlots()[actionIndex];
  }

  private getMeasureEndActionIndex(actionIndex: number): number {
    return this.getMeasureInfoForAction(actionIndex)?.measureEndIndex ?? this.getTimelineActions().length;
  }

  private getActionGripForGlobalAction(actionIndex: number): PlayingPatternActionGrip | undefined {
    const measureInfo = this.getMeasureInfoForAction(actionIndex);
    if (!measureInfo) {
      return undefined;
    }

    return measureInfo.context?.actionGrips?.find(grip => grip.actionIndex === measureInfo.localActionIndex);
  }

  private getMeasureBoundaryActionIndices(): number[] {
    const boundaries: number[] = [];
    let actionIndex = 0;

    for (let measureIndex = 0; measureIndex < this.measures().length - 1; measureIndex++) {
      const measure = this.measures()[measureIndex];
      actionIndex += measure.actions.length;
      boundaries.push(actionIndex);
    }

    return boundaries;
  }

  getStrumStringIndices(actionIndex: number, action: PlayingAction): number[] {
    if (!action.strum) {
      return [0, 1, 2, 3, 4, 5];
    }

    if (isRelativeStrumRange(action.strum.strings)) {
      return resolveRelativeStrumRange(this.resolvedGripTimeline().get(actionIndex), action.strum.strings, action.articulation === 'dead-note');
    }

    const grip = this.resolvedGripTimeline().get(actionIndex);
    return getStringsForStrum(action.strum.strings).filter(index => action.articulation === 'dead-note' || !grip || (grip.strings[index] !== undefined && grip.strings[index] !== 'x'));
  }

  private spreadPickMarksOnSameString(marks: SlotPickMark[], baseX: number): SlotPickMark[] {
    const sameStringCounts = new Map<number, number>();

    return marks.map(mark => {
      const count = sameStringCounts.get(mark.y) ?? 0;
      sameStringCounts.set(mark.y, count + 1);
      const sameStringTotal = marks.filter(candidate => candidate.y === mark.y).length;
      if (sameStringTotal <= 1) {
        return mark;
      }

      return {
        ...mark,
        x: baseX + ((count - ((sameStringTotal - 1) / 2)) * 8)
      };
    });
  }

  private getRelativeStringShortLabel(string: RelativeString, note: GripRelativePickingNote | BaseRelativePickingNote): string {
    if (note.anchor === 'base-note') {
      return `b`;
    }

    if (note.fretOffset === 0) {
      return `g`;
    }

    return `${note.fretOffset > 0 ? '+' : ''}${note.fretOffset}`;
  }

  private applyActionToStringState(
    actionIndex: number,
    action: PlayingAction,
    stringState: Map<number, NotationStringState>
  ): void {
    if (action.technique === 'strum' && action.strum) {
      if (action.articulation === 'dead-note') { stringState.clear(); return; }
      const grip = this.resolvedGripTimeline().get(actionIndex);
      if (!grip) {
        return;
      }

      for (const stringIndex of this.getStrumStringIndices(actionIndex, action)) {
        const entry = grip.strings[stringIndex];
        if (entry === 'x') {
          stringState.delete(stringIndex);
          continue;
        }

        const fret = entry === 'o' ? 0 : Math.max(...entry.map(value => value.fret));
        stringState.set(stringIndex, { fret, label: `${fret}` });
      }
      return;
    }

    if (action.technique === 'pick' && action.pick) {
      const grip = this.resolvedGripTimeline().get(actionIndex);

      for (const note of action.pick) {
        if (isRelativePickingNote(note)) {
          const stringIndex = resolveRelativeStringIndex(grip, note.string);
          const fret = resolveRelativePickFret(grip, stringIndex, note as GripRelativePickingNote | BaseRelativePickingNote);
          const label = grip ? `${fret}` : this.getRelativeStringShortLabel(note.string, note as GripRelativePickingNote | BaseRelativePickingNote);
          stringState.set(stringIndex, { fret, label });
          continue;
        }

        if (note.fret < 0) {
          stringState.delete(note.string);
          continue;
        }

        stringState.set(note.string, { fret: note.fret, label: `${note.fret}` });
      }
      return;
    }

    if (action.technique === 'percussive' && action.percussive?.technique === 'string-slap') {
      stringState.clear();
      return;
    }

    if (action.technique === 'slide' && action.slide) {
      for (const target of resolveSlideTargets(action.slide, stringState)) {
        stringState.set(target.string, { fret: target.toFret, label: `${target.toFret}` });
      }
      return;
    }

    if (this.isLegatoAction(action)) {
      const target = this.resolveLegatoTarget(actionIndex, action);
      if (!target) {
        return;
      }

      const source = stringState.get(target.string);
      if (source || action.technique === 'hammer-on') {
        stringState.set(target.string, {
          fret: target.targetFret,
          label: target.targetLabel
        });
      }
    }
  }

  private resolveLegato(actionIndex: number, action: PlayingAction): ResolvedLegatoRender | undefined {
    const target = this.resolveLegatoTarget(actionIndex, action);
    if (!target) {
      return undefined;
    }

    const source = this.resolvedStringStateTimeline().get(actionIndex)?.get(target.string);
    return {
      ...target,
      sourceLabel: source?.label
    };
  }

  private resolveLegatoTarget(actionIndex: number, action: PlayingAction): Omit<ResolvedLegatoRender, 'sourceLabel'> | undefined {
    if (!action.legato) {
      return undefined;
    }

    if (getLegatoMode(action) === 'explicit' || !isRelativeLegatoNote(action.legato)) {
      const explicit = action.legato as ExplicitLegatoNote;
      return {
        string: explicit.string,
        targetFret: explicit.toFret,
        targetLabel: `${explicit.toFret}`
      };
    }

    const legato = action.legato as RelativeLegatoNote;
    const grip = this.resolvedGripTimeline().get(actionIndex);
    const stringIndex = resolveRelativeStringIndex(grip, legato.string);

    if (!grip) {
      return {
        string: stringIndex,
        targetFret: resolveRelativeLegatoEndpointFret(grip, stringIndex, legato.target),
        targetLabel: legato.target.anchor === 'base-note' ? 'b' : (legato.target.fretOffset === 0 ? 'g' : `${legato.target.fretOffset >= 0 ? '+' : ''}${legato.target.fretOffset}`)
      };
    }

    const targetFret = resolveRelativeLegatoEndpointFret(grip, stringIndex, legato.target);
    return {
      string: stringIndex,
      targetFret,
      targetLabel: `${targetFret}`
    };
  }
}
