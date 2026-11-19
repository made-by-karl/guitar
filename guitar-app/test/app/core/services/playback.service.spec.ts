import { note } from '@/app/core/music/semitones';
import { PlaybackPlan } from '@/app/core/services/playback.service';
import { playbackHarness } from '@test/helpers/media-playback';

const plan: PlaybackPlan = {
  instructions: [{ time: 0, playbackDuration: 0.5, actionDuration: 0.5, notes: [{ note: note('E', 4) }], velocity: 0.7, technique: 'normal' }],
  segmentStartTimes: [0, 1, 2], totalDuration: 3, totalSegments: 3
};

describe('Media-backed playback sessions', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders chord instructions and sends their media to the chord preview channel', async () => {
    const { service, rendered, media } = playbackHarness();
    await service.playChordFromNotes(['E4', 'G4', 'B4'], 1.5, 0.8, 'accented');
    expect(rendered.renderInstructions).toHaveBeenCalledWith([expect.objectContaining({
      technique: 'accented', velocity: 0.8, playbackDuration: 1.5, playNotes: 'parallel', notes: expect.arrayContaining([{ note: note('G', 4) }])
    })], 1.5, expect.any(AbortSignal));
    expect(media.play).toHaveBeenCalledWith('chord-preview', expect.any(Function), { label: 'Chord preview' });
    service.ngOnDestroy();
  });

  it('stops competing finite sessions, including those still preparing, only in the same scope', async () => {
    const { service, emit } = playbackHarness();
    const a = service.getFiniteSession('a'), b = service.getFiniteSession('b'), other = service.getFiniteSession('other', 'separate');
    await a.play(plan); await other.play(plan);
    emit('finite:a', { status: 'preparing' });
    await b.play(plan);
    expect(a.getSnapshot().status).toBe('idle');
    expect(b.getSnapshot().status).toBe('playing');
    expect(other.getSnapshot().status).toBe('playing');
    service.ngOnDestroy();
  });

  it('invalidates a retained completed clip when a competing preview starts preparing', async () => {
    const { service, finish, emit, media } = playbackHarness();
    const completed = service.getFiniteSession('completed');
    await completed.play(plan); finish('finite:completed');
    const replacement = service.getFiniteSession('replacement');
    await replacement.play(plan);
    expect(media.stop).toHaveBeenCalledWith('finite:completed');
    expect(completed.getSnapshot()).toMatchObject({ status: 'idle', ended: false });
    emit('finite:completed', { status: 'playing', currentTime: 1, ended: false });
    expect(completed.getSnapshot()).toMatchObject({ status: 'idle', ended: false });
    service.ngOnDestroy();
  });

  it('uses actual media position for repeated segments and seeks within the same rendered sound', async () => {
    const { service, emit, rendered, media, finish } = playbackHarness();
    const session = service.getFiniteSession('song');
    await session.play(plan, 1);
    expect(session.getSnapshot().cursor).toBe(1);
    emit('finite:song', { currentTime: 2.25 });
    expect(session.getSnapshot().cursor).toBe(2);
    session.pause(); session.seek(0);
    expect(media.seek).toHaveBeenCalledWith('finite:song', 0);
    expect(session.getSnapshot()).toMatchObject({ status: 'paused', cursor: 0 });
    session.resume();
    expect(session.getSnapshot().status).toBe('playing');
    expect(rendered.renderInstructions).toHaveBeenCalledTimes(1);
    emit('finite:song', { currentTime: 3.2 });
    expect(session.getSnapshot().status).toBe('playing');
    finish('finite:song');
    expect(session.getSnapshot()).toMatchObject({ status: 'idle', cursor: 0 });
    emit('finite:song', { status: 'playing', currentTime: 0, ended: false });
    emit('finite:song', { currentTime: 1.5 });
    expect(session.getSnapshot()).toMatchObject({ status: 'playing', cursor: 1 });
    expect(rendered.renderInstructions).toHaveBeenCalledTimes(1);
    session.destroy();
    expect(media.release).toHaveBeenCalledWith('finite:song');
  });

  it('never reports playing while preparation or a rejected media start is pending', async () => {
    const { service, emit } = playbackHarness();
    const session = service.getFiniteSession('song');
    await session.play(plan);
    emit('finite:song', { status: 'preparing' });
    expect(session.getSnapshot()).toMatchObject({ status: 'preparing', canSeek: false, canPause: false });
    emit('finite:song', { status: 'ready' });
    expect(session.getSnapshot()).toMatchObject({ status: 'paused', canSeek: false });
    session.seek(1);
    expect(session.getSnapshot().cursor).toBe(0);
    emit('finite:song', { status: 'error' });
    expect(session.getSnapshot()).toMatchObject({ status: 'paused', canSeek: false });
    emit('finite:song', { status: 'playing' });
    expect(session.getSnapshot().status).toBe('playing');
    service.ngOnDestroy();
  });
});

describe('Media-clock action positions', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('exposes continuous run-scoped media samples without adding discrete notation updates', async () => {
    const { service, emit } = playbackHarness();
    const session = service.getFiniteSession('clock');
    await session.play({ ...plan, slots: [{ time: 0, segmentIndex: 0, actionIndex: 0 }, { time: 0.125, segmentIndex: 0, actionIndex: 1 }] });
    const positions: unknown[] = [], samples: unknown[] = [];
    const stateSubscription = session.state$.subscribe(value => positions.push(value));
    const clockSubscription = session.clock$.subscribe(value => samples.push(value));
    emit('finite:clock', { currentTime: 0.04 }); emit('finite:clock', { currentTime: 0.08 });
    expect(positions).toHaveLength(1);
    expect(samples).toEqual([{ runId: 1, currentTime: 0 }, { runId: 1, currentTime: 0.04 }, { runId: 1, currentTime: 0.08 }]);
    session.pause(); session.seek(1);
    expect(samples.at(-1)).toEqual({ runId: 1, currentTime: 1 });
    session.stop();
    expect(samples.at(-1)).toEqual({ runId: 1, currentTime: 0 });
    const count = samples.length;
    emit('finite:clock', { status: 'playing', currentTime: 2 });
    expect(samples).toHaveLength(count);
    await session.play(plan);
    expect(samples.at(-1)).toEqual({ runId: 2, currentTime: 0 });
    let completed = false; session.clock$.subscribe({ complete: () => completed = true });
    session.destroy(); expect(completed).toBe(true);
    stateSubscription.unsubscribe(); clockSubscription.unsubscribe(); service.ngOnDestroy();
  });

  it('cannot publish an old clock sample when a position subscriber stops the run synchronously', async () => {
    const { service, emit } = playbackHarness();
    const session = service.getFiniteSession('reentrant');
    await session.play({ ...plan, slots: [{ time: 0, segmentIndex: 0, actionIndex: 0 }, { time: 0.125, segmentIndex: 0, actionIndex: 1 }] });
    const samples: unknown[] = [];
    const clock = session.clock$.subscribe(value => samples.push(value));
    const state = session.state$.subscribe(value => { if (value.actionIndex === 1) session.stop(); });
    emit('finite:reentrant', { currentTime: 0.125 });
    expect(session.getSnapshot().status).toBe('idle');
    expect(samples.at(-1)).toEqual({ runId: 1, currentTime: 0 });
    state.unsubscribe(); clock.unsubscribe(); service.ngOnDestroy();
  });

  it.each([60, 120, 180])('maps a three-minute sequence without drift at %i BPM and skips delayed frames', async tempo => {
    const { service, emit } = playbackHarness();
    const session = service.getFiniteSession('long-song');
    const duration = 60 / tempo / 4;
    const slots = Array.from({ length: Math.round(180 / duration) }, (_, index) => ({
      time: index * duration, segmentIndex: Math.floor(index / 16), actionIndex: index % 16
    }));
    await session.play({ ...plan, slots, segmentStartTimes: slots.filter(slot => slot.actionIndex === 0).map(slot => slot.time),
      totalSegments: slots.length / 16, totalDuration: 183 });
    const positions: number[] = [];
    const subscription = session.state$.subscribe(state => positions.push(state.cursor * 16 + (state.actionIndex ?? 0)));
    for (const index of [1, Math.floor(slots.length / 2), slots.length - 1]) {
      emit('finite:long-song', { currentTime: slots[index].time - 0.001 });
      expect(session.getSnapshot()).toMatchObject({ cursor: slots[index - 1].segmentIndex, actionIndex: slots[index - 1].actionIndex });
      emit('finite:long-song', { currentTime: slots[index].time });
      expect(session.getSnapshot()).toMatchObject({ cursor: slots[index].segmentIndex, actionIndex: slots[index].actionIndex });
    }
    expect(positions).toHaveLength(6); // The stalled frames did not replay intervening slots.
    subscription.unsubscribe(); service.ngOnDestroy();
  });

  it('handles microsecond-quantized media seeks at a 180 BPM slot and measure boundary', async () => {
    const { service, emit } = playbackHarness();
    const session = service.getFiniteSession('song');
    await session.play({ ...plan, totalSegments: 2, segmentStartTimes: [0, 4 / 3], slots: [
      { time: 0, segmentIndex: 0, actionIndex: 0 }, { time: 1 / 6, segmentIndex: 0, actionIndex: 2 },
      { time: 4 / 3, segmentIndex: 1, actionIndex: 0 }
    ] });
    emit('finite:song', { status: 'paused', currentTime: 0.166666 });
    expect(session.getSnapshot()).toMatchObject({ cursor: 0, actionIndex: 2 });
    emit('finite:song', { status: 'paused', currentTime: 1.333333 });
    expect(session.getSnapshot()).toMatchObject({ cursor: 1, actionIndex: 0 });
    emit('finite:song', { currentTime: 1.333 });
    expect(session.getSnapshot()).toMatchObject({ cursor: 0, actionIndex: 2 });
    service.ngOnDestroy();
  });

  it('has no action during preparation/rejection, preserves actual pause/seek time and holds the last slot through release', async () => {
    const { service, emit, finish } = playbackHarness();
    const session = service.getFiniteSession('song');
    const positioned = { ...plan, slots: [
      { time: 0, segmentIndex: 0, actionIndex: 0 }, { time: 0.125, segmentIndex: 0, actionIndex: 1 },
      { time: 1, segmentIndex: 1, actionIndex: 0 }, { time: 2, segmentIndex: 2, actionIndex: 0 }
    ] };
    await session.play(positioned);
    emit('finite:song', { status: 'preparing', currentTime: 0 });
    expect(session.getSnapshot().actionIndex).toBeUndefined();
    emit('finite:song', { status: 'ready' });
    expect(session.getSnapshot().actionIndex).toBeUndefined();
    emit('finite:song', { status: 'playing', currentTime: 0.125 });
    session.pause();
    expect(session.getSnapshot()).toMatchObject({ status: 'paused', actionIndex: 1 });
    session.seek(1);
    expect(session.getSnapshot()).toMatchObject({ status: 'paused', cursor: 1, actionIndex: 0 });
    session.resume();
    expect(session.getSnapshot()).toMatchObject({ status: 'playing', cursor: 1, actionIndex: 0 });
    emit('finite:song', { currentTime: 5.5 });
    expect(session.getSnapshot()).toMatchObject({ status: 'playing', cursor: 2, actionIndex: 0 });
    finish('finite:song');
    expect(session.getSnapshot().actionIndex).toBeUndefined();
    await session.play(positioned);
    expect(session.getSnapshot().runId).toBe(2);
    session.stop();
    emit('finite:song', { status: 'playing', currentTime: 1 });
    expect(session.getSnapshot()).toMatchObject({ status: 'idle', actionIndex: undefined });
    service.ngOnDestroy();
  });
});
