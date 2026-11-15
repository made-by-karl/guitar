import { chooseExposedMeasure, exposedHeight, ViewportRect } from '@/app/features/patterns/ui/measure-editor-preview/measure-editor-visibility';

const bounds = (top: number, bottom: number, left = 0, right = 300): ViewportRect => ({ top, bottom, left, right });
const viewport = bounds(150, 450);
const card = (index: number, top: number, bottom: number) => ({ index, bounds: bounds(top, bottom) });

describe('measure editor visibility', () => {
  it('counts partial and very tall cards, but excludes preview/footer occlusion and horizontal misses', () => {
    expect(exposedHeight(bounds(-2000, 151), viewport)).toBe(1);
    expect(exposedHeight(bounds(449, 1000), viewport)).toBe(1);
    expect(exposedHeight(bounds(100, 150), viewport)).toBe(0);
    expect(exposedHeight(bounds(450, 600), viewport)).toBe(0);
    expect(exposedHeight(bounds(200, 300, 301, 500), viewport)).toBe(0);
    expect(exposedHeight(bounds(200, 300, 300, 500), viewport)).toBe(0);
    expect(exposedHeight(bounds(149.5, 150.5), viewport)).toBe(0);
  });

  it('retains original indices including blank positions and never inserts hidden sixteenths', () => {
    expect(chooseExposedMeasure([{ index: 0, cards: [card(0, 0, 150), card(2, 140, 220), card(4, 230, 480)], controls: [] }], viewport, null))
      .toEqual({ index: 0, actions: [2, 4] });
  });

  it('selects total exposed card height, retaining the current measure on a tie and otherwise the earlier one', () => {
    const measures = [
      { index: 0, cards: [card(0, 150, 225), card(2, 225, 300)], controls: [] },
      { index: 1, cards: [card(0, 300, 600)], controls: [] }
    ];
    expect(chooseExposedMeasure(measures, viewport, 1)).toEqual({ index: 1, actions: [0] });
    expect(chooseExposedMeasure(measures, viewport, null)).toEqual({ index: 0, actions: [0, 2] });
    measures[0].cards.pop();
    expect(chooseExposedMeasure(measures, viewport, 0)?.index).toBe(1);
  });

  it('falls back to measure controls only without exposed cards and clears outside all measures', () => {
    const measures = [
      { index: 0, cards: [card(0, 450, 800)], controls: [bounds(150, 250)] },
      { index: 1, cards: [], controls: [bounds(250, 450)] }
    ];
    expect(chooseExposedMeasure(measures, viewport, 0)).toEqual({ index: 1, actions: [] });
    expect(chooseExposedMeasure(measures, bounds(0, 100), 1)).toBeNull();
    expect(chooseExposedMeasure([], viewport, 1)).toBeNull();
  });
});
