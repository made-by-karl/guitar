import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimeSignature } from '@/app/core/music/rhythm/time-signature.model';
import { Grip } from '@/app/features/grips/services/grips/grip.model';
import {
  BaseRelativePickingNote,
  ExplicitLegatoNote,
  ExplicitPickingNote,
  GripRelativePickingNote,
  Measure,
  PlayingAction,
  PlayingPatternActionGripOverride,
  PlayingPatternBeatGrip,
  RelativeLegatoNote,
  RelativeString,
  getBeatsFromTimeSignature,
  getLegatoMode,
  getPickMode,
  getStringsForStrum,
  isRelativeLegatoNote,
  isRelativePickingNote,
  isRelativeStrumRange
} from '@/app/features/patterns/services/playing-patterns.model';
import {
  resolveRelativeLegatoEndpointFret,
  resolveRelativePickFret,
  resolveRelativeStringIndex,
  resolveRelativeStrumRange
} from '@/app/features/patterns/services/playing-pattern-notation-resolver';

export interface PlayingActionsNotationContext {
  timeSignature?: TimeSignature;
  beatGrips?: PlayingPatternBeatGrip[];
  actionGripOverrides?: PlayingPatternActionGripOverride[];
  gripById?: Record<string, Grip | undefined>;
  initialGrip?: Grip;
}

interface SlotPickMark {
  x: number;
  y: number;
  label: string;
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
  imports: [CommonModule],
  templateUrl: './playing-actions.component.html',
  styleUrl: './playing-actions.component.scss'
})
export class PlayingActionsComponent {
  readonly strings = [0, 1, 2, 3, 4, 5];
  readonly slotTop = 12;
  readonly gripLabelTopBand = 15;
  readonly baseSvgHeight = 104;
  readonly stringSpacing = 13;
  readonly slotSpacing = 22;
  readonly legatoLineSourceGap = 8;

  measures = input.required<Measure[]>();
  showActionIndex = input<boolean>(false);
  measureWidth = input<string>('100%');
  notationContexts = input<PlayingActionsNotationContext[] | undefined>(undefined);

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
      const compression = this.getSegmentCompression(actions, actionIndex, endIndex, rawSlotsPerBeat);

      segments.push({
        actionIndex,
        actions: this.getSegmentActions(actions, actionIndex, endIndex),
        span,
        compression,
        width: this.slotSpacing * Math.ceil(span / compression)
      });
      actionIndex = endIndex;
    }

    return segments;
  });

  readonly resolvedGripTimeline = computed(() => {
    const timeline = new Map<number, Grip | undefined>();
    let currentGrip = this.getNotationContextForMeasure(0)?.initialGrip;
    let measureStartIndex = 0;

    for (let measureIndex = 0; measureIndex < this.measures().length; measureIndex++) {
      const measure = this.measures()[measureIndex];
      const context = this.getNotationContextForMeasure(measureIndex);
      const beatGrips = context?.beatGrips ?? [];
      const actionOverrides = context?.actionGripOverrides ?? [];
      const gripById = context?.gripById ?? {};

      const beats = getBeatsFromTimeSignature(context?.timeSignature ?? measure.timeSignature);
      const actionsPerBeat = beats > 0 ? measure.actions.length / beats : measure.actions.length;

      for (let actionIndex = 0; actionIndex < measure.actions.length; actionIndex++) {
        const globalActionIndex = measureStartIndex + actionIndex;
        const override = actionOverrides.find(grip => grip.actionIndex === actionIndex);
        if (override?.gripId) {
          currentGrip = gripById[override.gripId] ?? currentGrip;
        } else {
          const beatIndex = Math.floor(actionIndex / Math.max(1, actionsPerBeat));
          const beatGrip = beatGrips.find(grip => grip.beatIndex === beatIndex);
          if (beatGrip?.gripId) {
            currentGrip = gripById[beatGrip.gripId] ?? currentGrip;
          }
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
    const actions = this.getTimelineActions();

    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
      timeline.set(actionIndex, new Map(stringState));

      const action = actions[actionIndex];
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
    return (this.notationContexts() ?? []).some(context => (context.actionGrips ?? []).some(grip => !!grip.chordName));
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

  getActionGripLabelY(): number {
    return this.stringY(5) - 13;
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
      if (actionGrip?.chordName) {
        labels.push({
          actionIndex,
          label: actionGrip.chordName,
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

    if (action.technique === 'strum') {
      const direction = action.strum?.direction === 'D' ? 'down' : 'up';
      return `Action ${actionIndex + 1}: strum ${direction}`;
    }

    if (action.technique === 'pick') {
      return `Action ${actionIndex + 1}: pick`;
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
    return this.hasActionGripLabels() ? this.gripLabelTopBand : 0;
  }

  getStrumMinY(actionIndex: number, action: PlayingAction): number {
    const strings = this.getStrumStringIndices(actionIndex, action);
    return this.stringY(Math.max(...strings));
  }

  getStrumMaxY(actionIndex: number, action: PlayingAction): number {
    const strings = this.getStrumStringIndices(actionIndex, action);
    return this.stringY(Math.min(...strings));
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

    const mode = getPickMode(action);
    const grip = this.resolvedGripTimeline().get(actionIndex);
    const marks: SlotPickMark[] = [];
    const baseX = this.getActionX(actionIndex);

    action.pick.forEach(note => {
      if (mode === 'relative' && isRelativePickingNote(note)) {
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

      const explicit = note as ExplicitPickingNote;
      marks.push({
        x: baseX,
        y: this.stringY(explicit.string),
        label: explicit.fret < 0 ? 'x' : `${explicit.fret}`
      });
    });

    return this.spreadPickMarksOnSameString(marks, baseX);
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

  hasModifier(action: PlayingAction | null, modifier: 'accent' | 'mute' | 'palm-mute'): boolean {
    return !!action?.modifiers?.includes(modifier);
  }

  getModifierMarks(actionIndex: number, action: PlayingAction): ModifierMark[] {
    const modifiers = action.modifiers ?? [];
    const labels = modifiers.map(modifier => {
      switch (modifier) {
        case 'accent':
          return 'A';
        case 'mute':
          return 'M';
        case 'palm-mute':
          return 'PM';
      }
    });

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
    return this.renderableActionSegments().find(segment =>
      actionIndex >= segment.actionIndex && actionIndex < segment.actionIndex + segment.span
    );
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

      if (!this.isLegatoAction(action)) {
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

  private getSegmentCompression(
    actions: (PlayingAction | null)[],
    startIndex: number,
    endIndex: number,
    rawSlotsPerBeat: number
  ): number {
    if (rawSlotsPerBeat < 4 || rawSlotsPerBeat % 2 !== 0) {
      return 1;
    }

    for (let actionIndex = startIndex; actionIndex < endIndex; actionIndex++) {
      const action = actions[actionIndex];
      if (!action) {
        continue;
      }

      const localActionIndex = this.getMeasureInfoForAction(actionIndex)?.localActionIndex ?? actionIndex;
      const isOffEighthGrid = localActionIndex % 2 !== 0;
      if (isOffEighthGrid || this.isLegatoAction(action)) {
        return 1;
      }
    }

    for (let actionIndex = startIndex; actionIndex < endIndex; actionIndex++) {
      const localActionIndex = this.getMeasureInfoForAction(actionIndex)?.localActionIndex ?? actionIndex;
      const isOffEighthGrid = localActionIndex % 2 !== 0;
      if (isOffEighthGrid && this.getActionGripForGlobalAction(actionIndex)) {
        return 1;
      }
    }

    return 2;
  }

  private isLegatoAction(action: PlayingAction): boolean {
    return !!action.legato && (
      action.technique === 'hammer-on'
      || action.technique === 'pull-off'
      || action.technique === 'slide'
    );
  }

  private getTimelineActions(): (PlayingAction | null)[] {
    return this.measures().flatMap(measure => measure.actions);
  }

  private getNotationContextForMeasure(measureIndex: number): PlayingActionsNotationContext | undefined {
    return this.notationContexts()?.[measureIndex];
  }

  private getMeasureInfoForAction(actionIndex: number): {
    measure: Measure;
    measureIndex: number;
    measureStartIndex: number;
    measureEndIndex: number;
    localActionIndex: number;
    context: PlayingActionsNotationContext | undefined;
  } | undefined {
    let measureStartIndex = 0;

    for (let measureIndex = 0; measureIndex < this.measures().length; measureIndex++) {
      const measure = this.measures()[measureIndex];
      const measureEndIndex = measureStartIndex + measure.actions.length;
      if (actionIndex >= measureStartIndex && actionIndex < measureEndIndex) {
        return {
          measure,
          measureIndex,
          measureStartIndex,
          measureEndIndex,
          localActionIndex: actionIndex - measureStartIndex,
          context: this.getNotationContextForMeasure(measureIndex)
        };
      }

      measureStartIndex = measureEndIndex;
    }

    return undefined;
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

  private getStrumStringIndices(actionIndex: number, action: PlayingAction): number[] {
    if (!action.strum) {
      return [0, 1, 2, 3, 4, 5];
    }

    if (isRelativeStrumRange(action.strum.strings)) {
      return resolveRelativeStrumRange(this.resolvedGripTimeline().get(actionIndex), action.strum.strings);
    }

    return getStringsForStrum(action.strum.strings);
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
      const mode = getPickMode(action);
      const grip = this.resolvedGripTimeline().get(actionIndex);

      for (const note of action.pick) {
        if (mode === 'relative' && isRelativePickingNote(note)) {
          const stringIndex = resolveRelativeStringIndex(grip, note.string);
          const fret = resolveRelativePickFret(grip, stringIndex, note as GripRelativePickingNote | BaseRelativePickingNote);
          const label = grip ? `${fret}` : this.getRelativeStringShortLabel(note.string, note as GripRelativePickingNote | BaseRelativePickingNote);
          stringState.set(stringIndex, { fret, label });
          continue;
        }

        const explicit = note as ExplicitPickingNote;
        if (explicit.fret < 0) {
          stringState.delete(explicit.string);
          continue;
        }

        stringState.set(explicit.string, { fret: explicit.fret, label: `${explicit.fret}` });
      }
      return;
    }

    if (action.technique === 'percussive' && action.percussive?.technique === 'string-slap') {
      stringState.clear();
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
