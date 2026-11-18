import { buildSongPlayViewTimeline, projectSongPlayView } from '@/app/features/sheets/services/song-play-view-state';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';
import { Measure, PlayingPatternActionGrip } from '@/app/features/patterns/services/playing-patterns.model';

const C = 'x|3|2|o|1|o', G = '3|2|o|o|o|3', otherC = 'x|3|5|5|5|3';
const assignment = (actionIndex: number, gripId: string, name: string): PlayingPatternActionGrip => ({ measureIndex: 0, actionIndex, gripId, name });
const measure = (actionGrips: PlayingPatternActionGrip[] = []): Measure => ({ timeSignature: '4/4', actions: Array(16).fill(null), actionGrips });
function song(): SongSheet {
  return {
    id: 's', name: 'Song', tempo: 120, tuning: [], capodaster: 0, links: [], grips: [], patterns: [], created: 0, updated: 0,
    parts: [
      { id: 'chorus', section: 'Chorus', notes: '', measures: [{ id: 'c-m', measure: measure([assignment(4, G, 'G'), assignment(8, G, 'G alias')]) }] },
      { id: 'verse', section: 'Verse', notes: '', measures: [{ id: 'v-m', measure: measure([assignment(0, C, 'C'), assignment(8, C, 'C alias')]) }, { id: 'rest', measure: measure() }] }
    ],
    arrangement: [{ id: 'v1', partId: 'verse', lyrics: 'First line\nSecond line' }, { id: 'c1', partId: 'chorus', lyrics: '' }, { id: 'v2', partId: 'verse', lyrics: 'Other words' }]
  };
}

describe('song play view projection', () => {
  it('uses occurrence lyrics and arrangement order with repeated part/measure identities', () => {
    const timeline = buildSongPlayViewTimeline(song());
    expect(projectSongPlayView(timeline, 0, 0).row).toMatchObject({ occurrence: { id: 'v1', lyrics: 'First line\nSecond line' }, occurrenceNumber: 1 });
    expect(projectSongPlayView(timeline, 2, 0).row.occurrence.lyrics).toBe('');
    expect(projectSongPlayView(timeline, 3, 0).row).toMatchObject({ occurrence: { id: 'v2', lyrics: 'Other words' }, occurrenceNumber: 2 });
    expect(timeline.measures[3].precedingMeasures).toHaveLength(3);
  });

  it('carries grips over null slots, whole rest measures and occurrence boundaries', () => {
    const timeline = buildSongPlayViewTimeline(song());
    for (const [m, a] of [[0, 0], [0, 7], [1, 15], [2, 3]]) expect(projectSongPlayView(timeline, m, a).current?.gripId).toBe(C);
    expect(projectSongPlayView(timeline, 2, 4).current).toMatchObject({ gripId: G, actionIndex: 4 });
    expect(projectSongPlayView(timeline, 2, 15).current?.gripId).toBe(G);
  });

  it('shows C → G → C, skipping only adjacent same IDs and retaining actual labels/locations', () => {
    const timeline = buildSongPlayViewTimeline(song());
    const first = projectSongPlayView(timeline, 0, 0);
    expect(first.current?.name).toBe('C');
    expect(first.upcoming.map(grip => grip.gripId)).toEqual([G, C]);
    expect(first.upcoming.map(grip => grip.location)).toEqual(['Chorus · occurrence 1 · measure 1 · action 5', 'Verse · occurrence 2 · measure 1 · action 1']);
    expect(projectSongPlayView(timeline, 0, 8).current?.name).toBe('C alias');
    expect(projectSongPlayView(timeline, 2, 4).upcoming.map(grip => grip.gripId)).toEqual([C]);
    expect(projectSongPlayView(timeline, 3, 0).upcoming).toEqual([]);
    expect(projectSongPlayView(timeline, 0, 0)).toEqual(first);
  });

  it('does not infer chords from explicit notes, percussion or slides before a first assignment', () => {
    const sheet = song();
    sheet.parts[1].measures[0].measure = { ...measure([assignment(8, C, 'C')]), actions: [
      { technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 3 }] },
      { technique: 'percussive', percussive: { technique: 'body-knock' } },
      { technique: 'slide', slide: { fretOffset: 1 } }, ...Array(13).fill(null)
    ] };
    const result = projectSongPlayView(buildSongPlayViewTimeline(sheet), 0, 2);
    expect(result.current).toBeUndefined();
    expect(result.upcoming[0]).toMatchObject({ gripId: C, actionIndex: 8 });
  });

  it('resolves serialized IDs outside the library and distinguishes shapes sharing a name', () => {
    const sheet = song();
    sheet.parts[1].measures[0].measure.actionGrips = [assignment(0, C, 'C'), assignment(4, otherC, 'C')];
    const result = projectSongPlayView(buildSongPlayViewTimeline(sheet), 0, 0);
    expect(result.current?.grip?.strings).toHaveLength(6);
    expect(result.upcoming[0]).toMatchObject({ name: 'C', gripId: otherC });
  });

  it('preserves unresolved and over-range assignments in order and uses first-at-slot precedence', () => {
    const sheet = song();
    sheet.parts[1].measures[0].measure.actionGrips = [assignment(0, C, 'C'), assignment(4, 'unresolved', 'Mystery'), assignment(4, G, 'Ignored duplicate'), assignment(6, '1|8|o|o|o|o', 'Wide')];
    const timeline = buildSongPlayViewTimeline(sheet);
    const result = projectSongPlayView(timeline, 0, 0);
    expect(result.upcoming.map(grip => grip.name)).toEqual(['Mystery', 'Wide']);
    expect(result.upcoming[0].grip).toBeUndefined();
    expect(result.upcoming[1].grip?.strings).toHaveLength(6);
    expect(projectSongPlayView(timeline, 0, 4).current?.name).toBe('Mystery');
  });
});
