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
    expect(session.getSnapshot().status).toBe('paused');
    emit('finite:song', { status: 'playing' });
    expect(session.getSnapshot().status).toBe('playing');
    service.ngOnDestroy();
  });
});
