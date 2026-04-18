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
  it.each(['hammer-on', 'pull-off', 'slide'] as const)(
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
          pick: [{ string: 1, fret: sourceFret }]
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
    actions[4] = { technique: 'pick', pick: [{ string: 5, fret: 0 }] };
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
      fixture.componentInstance.slotSpacing * 2,
      fixture.componentInstance.slotSpacing * 2,
      fixture.componentInstance.slotSpacing * 2
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
    expect(rhythmMarkers[1].getAttribute('x')).toBe(`${(fixture.componentInstance.slotSpacing * 2) + (fixture.componentInstance.slotSpacing / 2)}`);
  });

  it('keeps empty beats compact even when another beat contains legato', async () => {
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
      fixture.componentInstance.slotSpacing * 4,
      fixture.componentInstance.slotSpacing * 2,
      fixture.componentInstance.slotSpacing * 2,
      fixture.componentInstance.slotSpacing * 2
    ]);
    expect(fixture.componentInstance.getActionSlotCenterX(4)).toBe(fixture.componentInstance.slotSpacing / 2);
    expect(fixture.componentInstance.getActionSlotCenterX(6)).toBe((fixture.componentInstance.slotSpacing * 1.5));
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
        pickMode: 'relative',
        pick: [{ string: 'bass', anchor: 'grip-note', fretOffset: 0 }]
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
          { string: 2, fret: 3 },
          { string: 3, fret: 2 },
          { string: 4, fret: 0 }
        ]
      }
    ])]);
    fixture.detectChanges();

    const marks = fixture.componentInstance.getPickMarks(0, fixture.componentInstance.measures()[0].actions[0]!);
    expect(new Set(marks.map(mark => mark.x)).size).toBe(1);
    expect(marks[0].x).toBe(fixture.componentInstance.getActionX(0));
  });

  it('renders resolved fret numbers for relative pick when grip context exists', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingActionsComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayingActionsComponent);
    fixture.componentRef.setInput('measures', [createMeasure([
      {
        technique: 'pick',
        pickMode: 'relative',
        pick: [{ string: 'bass', anchor: 'grip-note', fretOffset: 2 }]
      }
    ])]);
    fixture.componentRef.setInput('notationContexts', [{
      beatGrips: [{ measureIndex: 0, beatIndex: 0, gripId: 'g1', chordName: 'G' }],
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
      actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'g1', chordName: 'G' }]
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
      { actionGrips: [{ measureIndex: 1, actionIndex: 0, gripId: 'g1', chordName: 'Em' }] }
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
      actionGrips: [{ measureIndex: 0, actionIndex: 1, gripId: 'g1', chordName: 'C' }]
    }]);
    fixture.detectChanges();

    const firstSegment = fixture.componentInstance.getRenderableSegments()[0];
    expect(firstSegment.width).toBe(fixture.componentInstance.slotSpacing * 4);
    expect(fixture.componentInstance.getSegmentActionGripLabels(firstSegment)[0].x).toBe(
      fixture.componentInstance.slotSpacing + (fixture.componentInstance.slotSpacing / 2)
    );
  });
});
