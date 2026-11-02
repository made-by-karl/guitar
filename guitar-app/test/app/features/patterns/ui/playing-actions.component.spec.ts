import { TestBed } from '@angular/core/testing';
import { PlayingActionsComponent } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { Measure, PlayingAction } from '@/app/features/patterns/services/playing-patterns.model';

function createMeasure(actions: (PlayingAction | null)[]): Measure {
  return {
    timeSignature: '4/4',
    actions
  };
}

describe('PlayingActionsComponent', () => {
  it.each([false, true])('keeps a beat-four slide beside its fret number instead of connecting back to beat two (group: %s)', async group => {
    await TestBed.configureTestingModule({ imports: [PlayingActionsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const actions: (PlayingAction | null)[] = Array(16).fill(null);
    actions[4] = { technique: 'pick', pick: [{ mode: 'explicit', string: 3, fret: 2 }] };
    actions[12] = group
      ? { technique: 'slide', slide: { fretOffset: 2 } }
      : { technique: 'slide', legato: { string: 3, toFret: 4 } };
    fixture.componentRef.setInput('measures', [createMeasure(actions)]);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const lines: SVGLineElement[] = Array.from(fixture.nativeElement.querySelectorAll('.legato-line, .slide-sustain-line'));
    expect(lines).toHaveLength(1);
    for (const line of lines) {
      expect(Number(line.getAttribute('x1'))).toBeGreaterThanOrEqual(component.getLegatoTargetX(12) - component.slotSpacing);
      expect(Number(line.getAttribute('x2'))).toBeLessThanOrEqual(component.getActionSlotRight(12));
    }
    expect(fixture.nativeElement.querySelectorAll('.pick-label')[1].textContent).toBe('4');
  });

  it('replays earlier measures for slides without rendering their notes, and reacts to edits', async () => {
    await TestBed.configureTestingModule({ imports: [PlayingActionsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const single: PlayingAction = { technique: 'slide', legato: { string: 5, toFret: 4 } };
    const group: PlayingAction = { technique: 'slide', slide: { fretOffset: 1 } };
    const history = [{
      measure: createMeasure([{ technique: 'strum', strum: { direction: 'D', strings: 'all' } }, single]),
      context: { actionGrips: [{ actionIndex: 0, gripId: 'x|x|o|2|3|2', name: 'D', measureIndex: 0 }] }
    }];
    fixture.componentRef.setInput('notationHistory', history);
    fixture.componentRef.setInput('measures', [createMeasure([group])]);
    fixture.detectChanges();
    expect(fixture.componentInstance.getSlideMarks(0, group).map(mark => mark.label)).toEqual(['3', '4', '5']);
    expect(fixture.nativeElement.querySelectorAll('.slide-line')).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('.strum-stem, .action-grip-label')).toHaveLength(0);

    fixture.componentRef.setInput('notationHistory', [{ ...history[0], measure: createMeasure([
      ...history[0].measure.actions,
      { technique: 'percussive', percussive: { technique: 'string-slap' } }
    ]) }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.slide-line')).toHaveLength(0);
  });

  it.each([2, -1])('draws single and grouped slides diagonally in the direction of fret offset %s', async offset => {
    await TestBed.configureTestingModule({ imports: [PlayingActionsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const single: PlayingAction = { technique: 'slide', legato: { string: 5, toFret: 3 + offset } };
    const group: PlayingAction = { technique: 'slide', slide: { fretOffset: offset } };
    fixture.componentRef.setInput('measures', [createMeasure([
      { technique: 'pick', pick: [{ mode: 'explicit', string: 4, fret: 3 }, { mode: 'explicit', string: 5, fret: 3 }] },
      single, group
    ])]);
    fixture.detectChanges();
    for (const mark of [...fixture.componentInstance.getSlideMarks(1, single), ...fixture.componentInstance.getSlideMarks(2, group)]) {
      expect(Math.sign(mark.startY - mark.endY)).toBe(Math.sign(offset));
      expect(mark.startX).toBeLessThan(mark.x - 6);
      expect(Math.abs(mark.startY - mark.y)).toBeLessThan(3);
      expect(Math.abs(mark.endY - mark.y)).toBeLessThan(3);
    }
    expect(fixture.nativeElement.querySelectorAll('.slide-line')).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('.technique-mark')).toHaveLength(0);
  });

  it('draws a slide target on every sounding fretted string and carries the targets into the next slide', async () => {
    await TestBed.configureTestingModule({ imports: [PlayingActionsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const slide: PlayingAction = { technique: 'slide', slide: { fretOffset: 2 } };
    fixture.componentRef.setInput('measures', [createMeasure([
      { technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 0 }, { mode: 'explicit', string: 1, fret: 3 }, { mode: 'explicit', string: 2, fret: 2 }] },
      slide, slide
    ])]);
    fixture.detectChanges();
    expect(fixture.componentInstance.getSlideMarks(1, slide).map(mark => mark.label)).toEqual(['5', '4']);
    expect(fixture.componentInstance.getSlideMarks(2, slide).map(mark => mark.label)).toEqual(['7', '6']);
    expect(fixture.nativeElement.querySelectorAll('.legato-line')).toHaveLength(4);
  });

  it('resolves standalone D grips and limits strums and relative bass picks to playable strings', async () => {
    await TestBed.configureTestingModule({ imports: [PlayingActionsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const strum: PlayingAction = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    const pick: PlayingAction = { technique: 'pick', pick: [{ mode: 'relative', string: 'bass', anchor: 'grip-note', fretOffset: 0 }] };
    fixture.componentRef.setInput('measures', [createMeasure([strum, pick])]);
    fixture.componentRef.setInput('notationContexts', [{ actionGrips: [{ actionIndex: 0, gripId: 'x|x|o|2|3|2', name: 'D', measureIndex: 0 }] }]);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.getStrumStringIndices(0, strum)).toEqual([2, 3, 4, 5]);
    expect(component.getPickMarks(1, pick)[0]).toMatchObject({ y: component.stringY(2), label: '0' });
    fixture.componentRef.setInput('notationContexts', [{ actionGrips: [{ actionIndex: 0, gripId: 'x|x|x|x|x|x', name: 'Muted', measureIndex: 0 }] }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.strum-stem')).toBeNull();
  });

  it.each(['hammer-on', 'pull-off'] as const)(
    'draws %s legato actions as a backward connection to the previous action',
    async technique => {
      await TestBed.configureTestingModule({
        imports: [PlayingActionsComponent]
      }).compileComponents();

      const fixture = TestBed.createComponent(PlayingActionsComponent);
      const sourceFret = technique === 'pull-off' ? 4 : 2;
      const targetFret = technique === 'pull-off' ? 2 : 4;
      fixture.componentRef.setInput('measures', [createMeasure([
        {
          technique: 'pick',
          pick: [{ mode: 'explicit', string: 1, fret: sourceFret }]
        },
        {
          technique,
          legato: { string: 1, toFret: targetFret }
        }
      ])]);
      fixture.detectChanges();

      const component = fixture.componentInstance;
      const legatoWidth = component.getLegatoTargetX(0) - component.getLegatoStartX(0);
      expect(component.getRenderableSegments()[0]).toMatchObject({ actionIndex: 0, span: 2 });
      expect(component.getLegatoStartX(1)).toBe(component.getActionX(0) + component.legatoLineSourceGap);
      expect(component.getLegatoTargetX(1)).toBe(component.getActionSlotCenterX(1));
      expect(component.getLegatoTargetX(1) - component.getLegatoStartX(1)).toBe(component.slotSpacing - component.legatoLineSourceGap);
      expect(legatoWidth).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('svg').length).toBe(1);
      expect(fixture.nativeElement.querySelectorAll('.legato-line').length).toBe(1);
      expect(fixture.nativeElement.querySelectorAll('.pick-label').length).toBe(2);
    }
  );

  it('renders one SVG per rendered action segment and rhythm markers when index display is enabled', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const actions = Array(16).fill(null) as (PlayingAction | null)[];
    actions[0] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    actions[8] = { technique: 'percussive', percussive: { technique: 'body-knock' } };
    fixture.componentRef.setInput('measures', [createMeasure(actions)]);
    fixture.componentRef.setInput('showActionIndex', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('svg').length).toBe(4);
    const rhythmText = Array.from(fixture.nativeElement.querySelectorAll('.rhythm-marker'))
      .map((node: any) => (node.textContent || '').trim())
      .filter((text: string) => text.length > 0);
    expect(rhythmText.length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelectorAll('.slot-separator').length).toBe(5);
  });

  it('draws parallel actions inside the same beat-sized SVG segment', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const actions = Array(16).fill(null) as (PlayingAction | null)[];
    actions[0] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    actions[1] = {
      technique: 'hammer-on',
      legato: { string: 1, toFret: 4 }
    };
    actions[2] = { technique: 'strum', strum: { direction: 'U', strings: 'treble' } };
    actions[4] = { technique: 'pick', pick: [{ mode: 'explicit', string: 5, fret: 0 }] };
    fixture.componentRef.setInput('measures', [createMeasure(actions)]);
    fixture.detectChanges();

    const segments = fixture.componentInstance.getRenderableSegments();
    expect(segments.map(segment => ({ actionIndex: segment.actionIndex, span: segment.span }))).toEqual([
      { actionIndex: 0, span: 4 },
      { actionIndex: 4, span: 4 },
      { actionIndex: 8, span: 4 },
      { actionIndex: 12, span: 4 }
    ]);
    expect(segments[0].actions.map(action => action.actionIndex)).toEqual([0, 1, 2]);
    expect(segments.map(segment => segment.width)).toEqual([
      fixture.componentInstance.slotSpacing * 4,
      fixture.componentInstance.slotSpacing * 4,
      fixture.componentInstance.slotSpacing * 4,
      fixture.componentInstance.slotSpacing * 4
    ]);
    expect(fixture.nativeElement.querySelectorAll('svg').length).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('.strum-stem').length).toBe(2);
  });

  it('draws overlapping legato actions at their own sixteenth offsets', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const actions = Array(16).fill(null) as (PlayingAction | null)[];
    actions[0] = {
      technique: 'hammer-on',
      legato: { string: 1, toFret: 4 }
    };
    actions[1] = {
      technique: 'pull-off',
      legato: { string: 1, toFret: 2 }
    };
    fixture.componentRef.setInput('measures', [createMeasure(actions)]);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const segments = component.getRenderableSegments();
    expect(segments[0].actions.map(action => action.actionIndex)).toEqual([0, 1]);
    expect(component.getLegatoStartX(0)).toBe(component.slotSpacing / 2);
    expect(component.getLegatoTargetX(0)).toBe(component.slotSpacing / 2);
    expect(component.getLegatoStartX(1)).toBe((component.slotSpacing / 2) + component.legatoLineSourceGap);
    expect(component.getLegatoTargetX(1)).toBe(component.slotSpacing + (component.slotSpacing / 2));
    expect(fixture.nativeElement.querySelectorAll('.legato-line').length).toBe(1);
  });

  it('renders beat and offbeat rhythm markers at their slot centers inside multi-slot SVGs', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const actions = Array(16).fill(null) as (PlayingAction | null)[];
    actions[0] = {
      technique: 'hammer-on',
      legato: { string: 1, toFret: 4 }
    };
    actions[2] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    fixture.componentRef.setInput('measures', [createMeasure(actions)]);
    fixture.componentRef.setInput('showActionIndex', true);
    fixture.detectChanges();

    const rhythmMarkers = Array.from(fixture.nativeElement.querySelectorAll('.rhythm-marker')) as SVGTextElement[];
    const markerText = rhythmMarkers.map(marker => (marker.textContent || '').trim());
    expect(markerText).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(rhythmMarkers[0].getAttribute('x')).toBe(`${fixture.componentInstance.slotSpacing / 2}`);
    expect(rhythmMarkers[1].getAttribute('x')).toBe(`${fixture.componentInstance.slotSpacing * 1.5}`);
  });

  it('gives empty and legato beats the same compact spacing on an eighth grid', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const actions = Array(16).fill(null) as (PlayingAction | null)[];
    actions[0] = {
      technique: 'hammer-on',
      legato: { string: 1, toFret: 4 }
    };
    fixture.componentRef.setInput('measures', [createMeasure(actions)]);
    fixture.detectChanges();

    const segments = fixture.componentInstance.getRenderableSegments();
    expect(segments.map(segment => segment.width)).toEqual([
      fixture.componentInstance.slotSpacing * 2,
      fixture.componentInstance.slotSpacing * 2,
      fixture.componentInstance.slotSpacing * 2,
      fixture.componentInstance.slotSpacing * 2
    ]);
    expect(fixture.componentInstance.getActionSlotCenterX(4)).toBe(fixture.componentInstance.slotSpacing / 2);
    expect(fixture.componentInstance.getActionSlotCenterX(6)).toBe((fixture.componentInstance.slotSpacing * 1.5));
  });

  it.each([false, true])('keeps the same beat spacing across measures with different subdivisions and slides (sixteenth note: %s)', async sixteenth => {
    await TestBed.configureTestingModule({ imports: [PlayingActionsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const sparse: (PlayingAction | null)[] = Array(8).fill(null);
    sparse[0] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    const dense: (PlayingAction | null)[] = Array(16).fill(null);
    dense[sixteenth ? 1 : 2] = { technique: 'pick', pick: [{ mode: 'explicit', string: 3, fret: 2 }] };
    const slides: (PlayingAction | null)[] = Array(16).fill(null);
    slides[0] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    slides[12] = { technique: 'slide', slide: { fretOffset: 1 } };
    fixture.componentRef.setInput('measures', [createMeasure(sparse), createMeasure(dense), createMeasure(slides)]);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const beatWidth = component.slotSpacing * (sixteenth ? 4 : 2);
    const segments = component.getRenderableSegments();
    expect(segments).toHaveLength(12);
    for (const segment of segments) expect(segment.width).toBe(beatWidth);
    expect(component.getActionSlotCenterX(1) - component.getActionSlotCenterX(0)).toBe(beatWidth / 2);
    expect(component.getActionSlotCenterX(10) - component.getActionSlotCenterX(8)).toBe(beatWidth / 2);
    expect(segments.at(-1)).toMatchObject({ actionIndex: 36, span: 4, width: beatWidth });
  });

  it('extends beat-sized SVG segments when an action overlaps the beat boundary', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const actions = Array(16).fill(null) as (PlayingAction | null)[];
    actions[3] = {
      technique: 'hammer-on',
      legato: { string: 1, toFret: 4 }
    };
    actions[4] = {
      technique: 'pull-off',
      legato: { string: 1, toFret: 2 }
    };
    fixture.componentRef.setInput('measures', [createMeasure(actions)]);
    fixture.detectChanges();

    const segments = fixture.componentInstance.getRenderableSegments();
    expect(segments.map(segment => ({ actionIndex: segment.actionIndex, span: segment.span }))).toEqual([
      { actionIndex: 0, span: 5 },
      { actionIndex: 5, span: 4 },
      { actionIndex: 9, span: 4 },
      { actionIndex: 13, span: 3 }
    ]);
    expect(segments[0].actions.map(action => action.actionIndex)).toEqual([3, 4]);
  });

  it('renders multiple measures as one wrapping notation line with an internal measure divider', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const firstMeasureActions = Array(16).fill(null) as (PlayingAction | null)[];
    const secondMeasureActions = Array(16).fill(null) as (PlayingAction | null)[];
    firstMeasureActions[15] = {
      technique: 'hammer-on',
      legato: { string: 1, toFret: 4 }
    };
    secondMeasureActions[0] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    fixture.componentRef.setInput('measures', [
      createMeasure(firstMeasureActions),
      createMeasure(secondMeasureActions)
    ]);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const segments = component.getRenderableSegments();
    const measureEndSegment = segments.find(segment => segment.actionIndex <= 15 && segment.actionIndex + segment.span === 16);
    const nextMeasureSegment = segments.find(segment => segment.actionIndex === 16);

    expect(measureEndSegment).toBeTruthy();
    expect(nextMeasureSegment).toBeTruthy();
    expect(measureEndSegment!.actions.map(action => action.actionIndex)).toEqual([15]);
    expect(nextMeasureSegment!.actions.map(action => action.actionIndex)).toEqual([16]);
    const [divider] = component.getSegmentMeasureDividers(measureEndSegment!);
    expect(divider.actionIndex).toBe(16);
    expect(component.getLegatoTargetX(15)).toBeLessThan(divider.x);
    expect(component.getActionSlotCenterX(16)).toBe(component.slotSpacing / 2);
    expect(component.getSegmentRhythmMarkers(measureEndSegment!).map(marker => marker.label)).toEqual(['4', '&']);
    expect(component.getSegmentRhythmMarkers(nextMeasureSegment!)[0]).toEqual({ actionIndex: 16, label: '1' });
    expect(fixture.nativeElement.querySelectorAll('.measure-divider').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.legato-line').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.strum-stem').length).toBe(1);
  });

  it('shows relative anchor fallback labels when no grip context is available', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    fixture.componentRef.setInput('measures', [createMeasure([
      {
        technique: 'pick',
        pick: [{ mode: 'relative', string: 'bass', anchor: 'grip-note', fretOffset: 0 }]
      }
    ])]);
    fixture.detectChanges();

    const marks = fixture.componentInstance.getPickMarks(0, fixture.componentInstance.measures()[0].actions[0]!);
    expect(marks.map(mark => mark.label)).toContain('g');
  });

  it('aligns multi-string pick labels in one vertical column', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    fixture.componentRef.setInput('measures', [createMeasure([
      {
        technique: 'pick',
        pick: [
          { mode: 'explicit', string: 2, fret: 3 },
          { mode: 'explicit', string: 3, fret: 2 },
          { mode: 'explicit', string: 4, fret: 0 }
        ]
      }
    ])]);
    fixture.detectChanges();

    const marks = fixture.componentInstance.getPickMarks(0, fixture.componentInstance.measures()[0].actions[0]!);
    expect(new Set(marks.map(mark => mark.x)).size).toBe(1);
    expect(marks[0].x).toBe(fixture.componentInstance.getActionX(0));
  });

  it('renders grouped relative pick labels for a seeded-style pinch against the current grip', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    fixture.componentRef.setInput('measures', [createMeasure([
      {
        technique: 'pick',
        pick: [
          { mode: 'relative', string: 'bass', anchor: 'grip-note', fretOffset: 0 },
          { mode: 'relative', string: 'second-from-top', anchor: 'grip-note', fretOffset: 0 },
          { mode: 'relative', string: 'top', anchor: 'grip-note', fretOffset: 0 }
        ]
      }
    ])]);
    fixture.componentRef.setInput('notationContexts', [{
      actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'g1', name: 'G' }],
      gripById: {
        g1: {
          strings: [[{ fret: 3 }], 'o', 'o', 'o', [{ fret: 3 }], [{ fret: 3 }]]
        }
      }
    }]);
    fixture.detectChanges();

    const marks = fixture.componentInstance.getPickMarks(0, fixture.componentInstance.measures()[0].actions[0]!);
    expect(marks).toHaveLength(3);
    expect(marks.map(mark => mark.label)).toEqual(['3', '3', '3']);
  });

  it('renders mixed relative and explicit pick labels in one action', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    fixture.componentRef.setInput('measures', [createMeasure([
      {
        technique: 'pick',
        pick: [
          { mode: 'relative', string: 'bass', anchor: 'grip-note', fretOffset: 2 },
          { mode: 'explicit', string: 5, fret: 0 }
        ]
      }
    ])]);
    fixture.componentRef.setInput('notationContexts', [{
      actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'g1', name: 'G' }],
      gripById: {
        g1: {
          strings: [[{ fret: 3 }], 'x', 'x', 'x', 'x', 'o']
        }
      }
    }]);
    fixture.detectChanges();

    const marks = fixture.componentInstance.getPickMarks(0, fixture.componentInstance.measures()[0].actions[0]!);
    expect(marks.map(mark => mark.label)).toEqual(['5', '0']);
  });

  it('renders resolved fret numbers for relative pick when grip context exists', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    fixture.componentRef.setInput('measures', [createMeasure([
      {
        technique: 'pick',
        pick: [{ mode: 'relative', string: 'bass', anchor: 'grip-note', fretOffset: 2 }]
      }
    ])]);
    fixture.componentRef.setInput('notationContexts', [{
      actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'g1', name: 'G' }],
      gripById: {
        g1: {
          strings: [[{ fret: 3 }], 'x', 'x', 'x', 'x', 'x']
        }
      }
    }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('5');
  });

  it('renders assigned grip labels automatically at the assigned action slot', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const actions = Array(16).fill(null) as (PlayingAction | null)[];
    actions[0] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    fixture.componentRef.setInput('measures', [createMeasure(actions)]);
    fixture.componentRef.setInput('notationContexts', [{
      actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'g1', name: 'G' }]
    }]);
    fixture.detectChanges();

    expect(fixture.componentInstance.hasActionGripLabels()).toBe(true);
    expect(fixture.componentInstance.getActionSvgHeight()).toBe(
      fixture.componentInstance.baseSvgHeight + fixture.componentInstance.gripLabelTopBand
    );
    expect(fixture.componentInstance.getActionGripLabelY()).toBeLessThan(fixture.componentInstance.stringY(5) - 8);
    expect(fixture.nativeElement.querySelector('.action-svg')?.classList.contains('has-action-grips')).toBe(true);

    const labels = fixture.componentInstance.getSegmentActionGripLabels(fixture.componentInstance.getRenderableSegments()[0]);
    expect(labels).toEqual([{
      actionIndex: 0,
      label: 'G',
      x: fixture.componentInstance.slotSpacing / 2
    }]);
    expect(fixture.nativeElement.querySelector('.action-grip-label')?.textContent.trim()).toBe('G');
  });

  it('keeps notation unchanged when no action grips are assigned', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const actions = Array(16).fill(null) as (PlayingAction | null)[];
    actions[0] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    fixture.componentRef.setInput('measures', [createMeasure(actions)]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.action-grip-label').length).toBe(0);
    expect(fixture.componentInstance.hasActionGripLabels()).toBe(false);
    expect(fixture.componentInstance.getActionSvgHeight()).toBe(fixture.componentInstance.baseSvgHeight);
  });

  it('does not leak grip labels between measure contexts', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const firstMeasureActions = Array(16).fill(null) as (PlayingAction | null)[];
    const secondMeasureActions = Array(16).fill(null) as (PlayingAction | null)[];
    secondMeasureActions[0] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    fixture.componentRef.setInput('measures', [
      createMeasure(firstMeasureActions),
      createMeasure(secondMeasureActions)
    ]);
    fixture.componentRef.setInput('notationContexts', [
      { actionGrips: [] },
      { actionGrips: [{ measureIndex: 1, actionIndex: 0, gripId: 'g1', name: 'Em' }] }
    ]);
    fixture.detectChanges();

    const gripLabels = Array.from(fixture.nativeElement.querySelectorAll('.action-grip-label'))
      .map((node: any) => node.textContent.trim());
    expect(gripLabels).toEqual(['Em']);
  });

  it('preserves sixteenth spacing when a grip is assigned to an off-eighth empty slot', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    const actions = Array(16).fill(null) as (PlayingAction | null)[];
    fixture.componentRef.setInput('measures', [createMeasure(actions)]);
    fixture.componentRef.setInput('notationContexts', [{
      actionGrips: [{ measureIndex: 0, actionIndex: 1, gripId: 'g1', name: 'C' }]
    }]);
    fixture.detectChanges();

    const firstSegment = fixture.componentInstance.getRenderableSegments()[0];
    expect(firstSegment.width).toBe(fixture.componentInstance.slotSpacing * 4);
    expect(fixture.componentInstance.getSegmentActionGripLabels(firstSegment)[0].x).toBe(
      fixture.componentInstance.slotSpacing + (fixture.componentInstance.slotSpacing / 2)
    );
  });
});
