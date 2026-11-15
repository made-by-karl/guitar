import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import type { EditorPreviewMeasure } from './measure-editor-preview.component';

/** Preserve the pattern's accepted draft history, with grips local to each drawn measure. */
export function patternPreviewMeasures(pattern: PlayingPattern): EditorPreviewMeasure[] {
  const entries = pattern.measures.map((measure, measureIndex) => ({
    measure,
    context: {
      timeSignature: measure.timeSignature,
      actionGrips: (pattern.actionGrips ?? []).filter(grip => grip.measureIndex === measureIndex)
        .map(grip => ({ ...grip, measureIndex: 0 }))
    }
  }));
  return entries.map((entry, index) => ({
    ...entry, label: `Measure ${index + 1}`, history: entries.slice(0, index)
  }));
}
