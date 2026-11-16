import { SongPlaybackTiming } from '@/app/features/sheets/services/song-part-playback.service';
import { PlayViewGrip, SongPlayViewTimeline } from '@/app/features/sheets/services/song-play-view-state';

interface TimedGripChange { assignment: PlayViewGrip; time: number; }
export interface SongPlayViewProgressTimeline {
  changes: TimedGripChange[];
  occurrences: Map<string, { start: number; end: number }>;
}

/** Use the scheduled slot times, including null actions and rests; no rhythm calculation here. */
export function buildSongPlayViewProgress(timeline: SongPlayViewTimeline, timing?: SongPlaybackTiming): SongPlayViewProgressTimeline {
  const result: SongPlayViewProgressTimeline = { changes: [], occurrences: new Map() };
  if (!timing) return result;
  const slots = new Map(timing.slots?.map(slot => [`${slot.segmentIndex}:${slot.actionIndex}`, slot.time]));
  for (const assignment of timeline.assignments) {
    const time = slots.get(`${assignment.measureIndex}:${assignment.actionIndex}`);
    if (time === undefined || result.changes.at(-1)?.assignment.gripId === assignment.gripId) continue;
    result.changes.push({ assignment, time });
  }
  timeline.measures.forEach((row, index) => {
    const start = timing.segmentStartTimes[index];
    const end = timing.segmentStartTimes[index + 1] ?? timing.notationDuration;
    if (start === undefined) return;
    const occurrence = result.occurrences.get(row.occurrence.id);
    result.occurrences.set(row.occurrence.id, { start: occurrence?.start ?? start, end });
  });
  return result;
}

function percentage(time: number, start: number, end: number): number {
  return end > start ? Math.max(0, Math.min(100, (time - start) / (end - start) * 100)) : 100;
}

/** Continuous progress and the short handoff cue are derived from one sampled media position. */
export function songPlayViewProgress(timeline: SongPlayViewProgressTimeline, occurrenceId: string, currentTime: number) {
  let low = 0, high = timeline.changes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    // Match the finite player's tolerance for microsecond-quantized media seeks.
    if (timeline.changes[middle].time <= currentTime + 0.000001) low = middle + 1;
    else high = middle;
  }
  const current: TimedGripChange | undefined = timeline.changes[low - 1];
  const next: TimedGripChange | undefined = timeline.changes[low];
  const afterNext: TimedGripChange | undefined = timeline.changes[low + 1];
  // Start each countdown when its target first appears in After next. Keep that
  // same interval when the target moves into Next, including after a seek.
  const nextStart = timeline.changes[low - 2]?.time ?? 0;
  const occurrence = timeline.occurrences.get(occurrenceId);
  return {
    gripPercent: next ? percentage(currentTime, nextStart, next.time) : undefined,
    afterNextPercent: afterNext ? percentage(currentTime, current?.time ?? 0, afterNext.time) : undefined,
    partPercent: occurrence ? percentage(currentTime, occurrence.start, occurrence.end) : 0,
    handoff: !!current && current.time > 0 && currentTime >= current.time - 0.000001 && currentTime < current.time + 0.25
  };
}
