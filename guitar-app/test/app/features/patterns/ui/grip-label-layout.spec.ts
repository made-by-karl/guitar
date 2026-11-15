import {
  layoutGripLabels, MeasuredGripLabel
} from '@/app/features/patterns/ui/playing-actions/grip-label-layout';

function label(actionIndex: number, anchorX: number, width: number, row = 0, height = 15): MeasuredGripLabel {
  return { actionIndex, anchorX, width, height, row };
}

describe('grip label layout', () => {
  it('keeps edge names within the row and connects them to their original anchors', () => {
    const { placements } = layoutGripLabels([label(0, 11, 56), label(15, 341, 56)], 352);
    expect(placements[0].left).toBeGreaterThanOrEqual(4);
    expect(placements[1].left + placements[1].width).toBeLessThanOrEqual(348);
    expect(placements.every(placement => placement.leader)).toBe(true);
    expect(placements.map(placement => placement.anchorX)).toEqual([11, 341]);
  });

  it('separates adjacent names across segment and measure boundaries, reusing free lanes', () => {
    const { placements, bandHeight } = layoutGripLabels([
      label(0, 11, 56), label(13, 297, 70), label(14, 319, 62), label(15, 341, 56), label(16, 363, 18)
    ], 704);
    const adjacent = placements.filter(placement => [13, 14, 15].includes(placement.actionIndex));
    expect(new Set(adjacent.map(placement => placement.bottom)).size).toBe(3);
    expect(bandHeight).toBeGreaterThan(45);
    for (let i = 0; i < placements.length; i++) {
      for (const other of placements.slice(i + 1)) {
        const current = placements[i];
        expect(current.bottom !== other.bottom || current.left + current.width + 6 <= other.left).toBe(true);
      }
    }
    expect(placements.find(placement => placement.actionIndex === 16)?.bottom).toBe(0);
  });

  it('packs wrapped rows independently and accounts for multiline names', () => {
    const { placements, bandHeight } = layoutGripLabels([
      label(0, 11, 240, 0, 45), label(1, 33, 30, 0), label(16, 11, 18, 1)
    ], 248);
    expect(placements[1].bottom).toBeGreaterThanOrEqual(45 + 4);
    expect(placements[2].bottom).toBe(0);
    expect(bandHeight).toBeGreaterThanOrEqual(45 + 15 + 8);
  });

  it('leaves separated short names in one lane without leaders and handles no names', () => {
    const { placements, bandHeight } = layoutGripLabels([label(0, 11, 8), label(4, 99, 18)], 352);
    expect(placements.every(placement => placement.bottom === 0 && !placement.leader)).toBe(true);
    expect(bandHeight).toBe(19);
    expect(layoutGripLabels([], 352)).toEqual({ bandHeight: 15, placements: [] });
  });
});
