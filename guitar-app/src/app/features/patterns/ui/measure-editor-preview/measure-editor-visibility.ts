export interface ViewportRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ExposedMeasure {
  index: number;
  cards: { index: number; bounds: ViewportRect }[];
  controls: ViewportRect[];
}

export function exposedHeight(bounds: ViewportRect, viewport: ViewportRect): number {
  if (Math.min(bounds.right, viewport.right) <= Math.max(bounds.left, viewport.left)) return 0;
  const height = Math.min(bounds.bottom, viewport.bottom) - Math.max(bounds.top, viewport.top);
  return height >= 1 ? height : 0;
}

/** Cards take precedence over measure controls; keep the current measure on exact ties. */
export function chooseExposedMeasure(measures: ExposedMeasure[], viewport: ViewportRect, current: number | null):
  { index: number; actions: number[] } | null {
  const candidates = measures.map(measure => ({
    index: measure.index,
    cards: measure.cards.map(card => ({ index: card.index, height: exposedHeight(card.bounds, viewport) })),
    controls: measure.controls.reduce((height, bounds) => height + exposedHeight(bounds, viewport), 0)
  }));
  const cardHeight = (candidate: typeof candidates[number]) => candidate.cards.reduce((height, card) => height + card.height, 0);
  const hasCards = candidates.some(candidate => cardHeight(candidate) > 0);
  const score = (candidate: typeof candidates[number]) => hasCards ? cardHeight(candidate) : candidate.controls;
  const maximum = Math.max(0, ...candidates.map(score));
  if (maximum === 0) return null;
  const tied = candidates.filter(candidate => score(candidate) === maximum);
  const selected = tied.find(candidate => candidate.index === current) ?? tied[0];
  return { index: selected.index, actions: selected.cards.filter(card => card.height > 0).map(card => card.index) };
}
