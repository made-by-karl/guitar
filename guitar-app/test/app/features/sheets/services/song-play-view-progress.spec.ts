import { buildSongPlayViewProgress, songPlayViewProgress } from '@/app/features/sheets/services/song-play-view-progress';
import { buildSongPlayViewTimeline } from '@/app/features/sheets/services/song-play-view-state';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';
import { PlayingPatternPlaybackPlannerService } from '@/app/features/patterns/services/playing-pattern-playback-planner.service';
import { Measure, PlayingPatternActionGrip } from '@/app/features/patterns/services/playing-patterns.model';

const C = 'x|3|2|o|1|o', G = '3|2|o|o|o|3';
function fixture(tempo = 120) {
  const assignment = (actionIndex: number, gripId: string, name: string): PlayingPatternActionGrip => ({ measureIndex: 0, actionIndex, gripId, name });
  const measure = (actionGrips: PlayingPatternActionGrip[] = []): Measure => ({ timeSignature: '4/4', actions: Array(16).fill(null), actionGrips });
  const sheet: SongSheet = {
    id: 's', name: 'Song', tempo, tuning: [], capodaster: 0, links: [], grips: [], patterns: [], created: 0, updated: 0,
    parts: [
      { id: 'v', section: 'Verse', notes: '', measures: [{ id: 'm', measure: measure([assignment(4, C, 'C'), assignment(8, C, 'Alias'), assignment(12, G, 'G')]) }, { id: 'rest', measure: measure() }] },
      { id: 'c', section: 'Chorus', notes: '', measures: [{ id: 'm', measure: measure([assignment(0, C, 'C'), assignment(8, 'unresolved', 'Mystery')]) }] }
    ],
    arrangement: [{ id: 'v1', partId: 'v', lyrics: 'First' }, { id: 'c1', partId: 'c', lyrics: '' }, { id: 'v2', partId: 'v', lyrics: 'Second' }]
  };
  const timeline = buildSongPlayViewTimeline(sheet);
  const plan = new PlayingPatternPlaybackPlannerService().buildPlaybackPlan(timeline.measures.map(row => ({ measure: row.measure, actionGrips: row.measure.actionGrips })), [], tempo);
  return { timeline, plan, progress: buildSongPlayViewProgress(timeline, plan) };
}

describe('song play view progress', () => {
  it.each([60, 120, 180])('uses actual slot times for first assignments, aliases, rests and repeated parts at %i BPM', tempo => {
    const { progress } = fixture(tempo);
    const slot = 60 / tempo / 4;
    expect(songPlayViewProgress(progress, 'v1', slot)).toMatchObject({ gripPercent: 25, partPercent: 3.125, handoff: false });
    expect(songPlayViewProgress(progress, 'v1', 6 * slot).gripPercent).toBe(50);
    // A same-ID alias at slot 8 changes the label, not the progress interval.
    expect(songPlayViewProgress(progress, 'v1', 8 * slot).gripPercent).toBeCloseTo(200 / 3);
    expect(songPlayViewProgress(progress, 'v1', 8 * slot).handoff).toBe(false);
    expect(songPlayViewProgress(progress, 'v1', 12 * slot).handoff).toBe(true);
    expect(songPlayViewProgress(progress, 'v1', 12 * slot).gripPercent).toBeCloseTo(200 / 7);
    expect(songPlayViewProgress(progress, 'v1', 22 * slot).gripPercent).toBeCloseTo(450 / 7);
    expect(songPlayViewProgress(progress, 'v1', 22 * slot).partPercent).toBeCloseTo(68.75);
    expect(songPlayViewProgress(progress, 'c1', 32 * slot).gripPercent).toBeCloseTo(500 / 7);
    expect(songPlayViewProgress(progress, 'c1', 32 * slot).partPercent).toBe(0);
    expect(songPlayViewProgress(progress, 'v2', 48 * slot).partPercent).toBe(0);
    // A seek back recomputes both intervals without a consumed queue.
    expect(songPlayViewProgress(progress, 'v1', 6 * slot).gripPercent).toBe(50);
  });

  it('keeps each target’s fill and speed when it moves from After next to Next', () => {
    const { progress } = fixture();
    const beforeFirst = songPlayViewProgress(progress, 'v1', 0.25);
    expect(beforeFirst.gripPercent).toBe(50);
    expect(beforeFirst.afterNextPercent).toBeCloseTo(100 / 6);
    const beforeG = songPlayViewProgress(progress, 'v1', 1);
    expect(beforeG.gripPercent).toBeCloseTo(200 / 3);
    expect(beforeG.afterNextPercent).toBeCloseTo(100 / 7);
    const atG = songPlayViewProgress(progress, 'v1', 1.5);
    expect(atG.gripPercent).toBeCloseTo(200 / 7);
    expect(atG.afterNextPercent).toBe(0);
    // C at time 4 keeps the interval that began at time 0.5, on both sides
    // of the G handoff at time 1.5. Unequal gaps catch a change in speed too.
    const before = songPlayViewProgress(progress, 'v1', 1.4).afterNextPercent!;
    const boundary = atG.gripPercent!;
    const after = songPlayViewProgress(progress, 'v1', 1.6).gripPercent!;
    expect(before).toBeCloseTo(180 / 7);
    expect(after - boundary).toBeCloseTo(boundary - before);
    expect(songPlayViewProgress(progress, 'v1', 3.9).gripPercent).toBeCloseTo(680 / 7);
    // Seeking back or opening the view later yields the same countdown.
    expect(songPlayViewProgress(progress, 'v1', 1.4).afterNextPercent).toBe(before);
    expect(songPlayViewProgress(progress, 'v1', 1.6).gripPercent).toBe(after);
    expect(songPlayViewProgress(progress, 'v2', 6.5).afterNextPercent).toBeUndefined();
  });

  it('preserves unresolved upcoming assignments and hides the grip bar when none remain', () => {
    const { progress } = fixture();
    expect(songPlayViewProgress(progress, 'c1', 4.5).gripPercent).toBeCloseTo(600 / 7);
    expect(progress.changes.find(change => change.time === 5)?.assignment.name).toBe('Mystery');
    expect(songPlayViewProgress(progress, 'v2', 7.5).gripPercent).toBeUndefined();
  });

  it('clamps the part bar at its written end throughout release tails and delayed frames', () => {
    const { progress, plan } = fixture();
    expect(plan.notationDuration).toBe(10);
    expect(songPlayViewProgress(progress, 'v2', 10.5).partPercent).toBe(100);
    expect(songPlayViewProgress(progress, 'v1', -1).partPercent).toBe(0);
    expect(songPlayViewProgress(progress, 'v1', 1.8).handoff).toBe(false);
    expect(songPlayViewProgress(progress, 'v1', 1.74).handoff).toBe(true);
  });

  it('handles microsecond-quantized seeks and absent timing without synthesizing a clock', () => {
    const { progress, timeline } = fixture(180);
    expect(songPlayViewProgress(progress, 'v1', 0.999999).gripPercent).toBeCloseTo(200 / 7, 3);
    expect(songPlayViewProgress(progress, 'v1', 0.999999).handoff).toBe(true);
    expect(songPlayViewProgress(buildSongPlayViewProgress(timeline), 'v1', 2)).toEqual({ gripPercent: undefined, afterNextPercent: undefined, partPercent: 0, handoff: false });
  });
});
