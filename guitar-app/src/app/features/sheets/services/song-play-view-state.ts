import { Grip } from '@/app/features/grips/services/grips/grip.model';
import { Measure } from '@/app/features/patterns/services/playing-patterns.model';
import { resolveNotationGrip } from '@/app/features/patterns/services/playing-pattern-notation-resolver';
import { getOccurrenceNumber, getSongArrangement } from '@/app/features/sheets/services/song-arrangement';
import { SongPart, SongPartOccurrence, SongSheet } from '@/app/features/sheets/services/song-sheets.model';

export interface PlayViewMeasure {
  part: SongPart;
  occurrence: SongPartOccurrence;
  occurrenceNumber: number;
  measure: Measure;
  measureIndex: number;
  precedingMeasures: Measure[];
}

export interface PlayViewGrip {
  gripId: string;
  name: string;
  grip?: Grip;
  /** Index in the arranged snapshot, not the part library. */
  measureIndex: number;
  actionIndex: number;
  location: string;
}

export interface SongPlayViewTimeline {
  measures: PlayViewMeasure[];
  assignments: PlayViewGrip[];
}

/** Index once per immutable snapshot. Slot updates never traverse the song or parse grips. */
export function buildSongPlayViewTimeline(sheet: SongSheet): SongPlayViewTimeline {
  const arrangement = getSongArrangement(sheet);
  const measures: PlayViewMeasure[] = [];
  const assignments: PlayViewGrip[] = [];
  const history: Measure[] = [];
  const grips = new Map<string, Grip | undefined>();
  for (const occurrence of arrangement) {
    const part = sheet.parts.find(part => part.id === occurrence.partId);
    if (!part) continue;
    const occurrenceNumber = getOccurrenceNumber(arrangement, occurrence);
    part.measures.forEach((item, measureIndex) => {
      const arrangedIndex = measures.length;
      measures.push({ part, occurrence, occurrenceNumber, measure: item.measure, measureIndex, precedingMeasures: [...history] });
      // Playback and notation use the first assignment at a slot, including null slots.
      item.measure.actions.forEach((_, actionIndex) => {
        const assignment = item.measure.actionGrips?.find(grip => grip.actionIndex === actionIndex);
        if (!assignment) return;
        if (!grips.has(assignment.gripId)) grips.set(assignment.gripId, resolveNotationGrip(assignment.gripId));
        assignments.push({ ...assignment, measureIndex: arrangedIndex, grip: grips.get(assignment.gripId),
          location: `${part.section || 'Untitled part'} · occurrence ${occurrenceNumber} · measure ${measureIndex + 1} · action ${actionIndex + 1}` });
      });
      history.push(item.measure);
    });
  }
  return { measures, assignments };
}

/** Project any shared position (including a resumed/seeked one); no independent queue or clock. */
export function projectSongPlayView(timeline: SongPlayViewTimeline, measureIndex: number, actionIndex: number) {
  let low = 0, high = timeline.assignments.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const candidate = timeline.assignments[middle];
    if (candidate.measureIndex < measureIndex || (candidate.measureIndex === measureIndex && candidate.actionIndex <= actionIndex)) low = middle + 1;
    else high = middle;
  }
  const current = timeline.assignments[low - 1];
  const upcoming: PlayViewGrip[] = [];
  let previousId = current?.gripId;
  for (let index = low; index < timeline.assignments.length && upcoming.length < 2; index++) {
    const candidate = timeline.assignments[index];
    if (candidate.gripId === previousId) continue;
    upcoming.push(candidate);
    previousId = candidate.gripId;
  }
  return { row: timeline.measures[measureIndex], current, upcoming };
}
