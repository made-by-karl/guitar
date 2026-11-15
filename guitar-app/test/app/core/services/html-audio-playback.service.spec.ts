import { HtmlAudioPlaybackService } from '@/app/core/services/html-audio-playback.service';
import { RenderedAudio } from '@/app/core/services/rendered-audio.service';

class MediaElement extends EventTarget {
  src = ''; preload = ''; loop = false; paused = true; ended = false; currentTime = 0;
  play = jest.fn(async () => { this.paused = false; this.dispatchEvent(new Event('playing')); });
  pause = jest.fn(() => { this.paused = true; this.dispatchEvent(new Event('pause')); });
  load = jest.fn();
  removeAttribute = jest.fn(() => { this.src = ''; });
}
const audio: RenderedAudio = { blob: new Blob(['sound']), durationSeconds: 4 };

describe('HTML media lifecycle', () => {
  let service: HtmlAudioPlaybackService;
  let elements: MediaElement[];
  let handlers: Map<MediaSessionAction, MediaSessionActionHandler>;
  let session: { metadata: MediaMetadata | null; playbackState: MediaSessionPlaybackState;
    setActionHandler: jest.Mock; setPositionState: jest.Mock };
  beforeEach(() => {
    jest.useFakeTimers(); elements = [];
    handlers = new Map();
    session = { metadata: null, playbackState: 'none', setPositionState: jest.fn(),
      setActionHandler: jest.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
        if (handler) handlers.set(action, handler); else handlers.delete(action);
      }) };
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
    Object.defineProperty(globalThis, 'MediaMetadata', { configurable: true, value: class {
      constructor(init: MediaMetadataInit) { Object.assign(this, init); }
    } });
    jest.spyOn(globalThis, 'Audio').mockImplementation(() => {
      const element = new MediaElement(); elements.push(element); return element as unknown as HTMLAudioElement;
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => `blob:${elements.length}`) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    service = new HtmlAudioPlaybackService();
  });
  afterEach(() => {
    service.ngOnDestroy(); jest.restoreAllMocks(); jest.useRealTimers();
    Reflect.deleteProperty(navigator, 'mediaSession'); Reflect.deleteProperty(globalThis, 'MediaMetadata');
  });

  it('cancels a render on stop and ignores its late result without creating a media element', async () => {
    let resolve!: (audio: RenderedAudio) => void;
    const preparing = service.play('a', () => new Promise(done => { resolve = done; }));
    expect(service.getSnapshot('a').status).toBe('preparing');
    service.stop('a'); resolve(audio); await preparing;
    expect(elements).toHaveLength(0);
    expect(service.notices()).toEqual([]);
  });

  it('retains prepared media after autoplay rejection and starts it on explicit retry without rerendering', async () => {
    const prepare = jest.fn(async () => audio);
    const factory = globalThis.Audio as jest.Mock;
    factory.mockImplementationOnce(() => {
      const element = new MediaElement(); elements.push(element);
      element.play.mockRejectedValueOnce(new DOMException('Gesture needed', 'NotAllowedError'));
      return element;
    });
    await service.play('a', prepare);
    expect(service.getSnapshot('a').status).toBe('ready');
    const retry = service.resume('a');
    expect(elements[0].play).toHaveBeenCalledTimes(2);
    await retry;
    expect(service.getSnapshot('a').status).toBe('playing');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('does not let late starts or rejections change a replacement player', async () => {
    let resolve!: () => void;
    const factory = globalThis.Audio as jest.Mock;
    factory.mockImplementationOnce(() => {
      const element = new MediaElement(); elements.push(element);
      element.play.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
      return element;
    });
    const first = service.play('a', async () => audio);
    await Promise.resolve();
    expect(service.getSnapshot('a').status).toBe('starting');
    await service.play('a', async () => audio);
    resolve(); await first;
    expect(service.getSnapshot('a').status).toBe('playing');
    expect(elements[0].pause).toHaveBeenCalled();
    expect(elements[1].paused).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('can prepare a changed paused player without starting it until another explicit interaction', async () => {
    const prepare = jest.fn(async () => audio);
    await service.play('a', prepare, { autoStart: false });
    expect(service.getSnapshot('a').status).toBe('ready');
    expect(elements[0].play).not.toHaveBeenCalled();
    await service.resume('a');
    expect(service.getSnapshot('a').status).toBe('playing');
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('synchronizes pause/error/ended events, retains only the completed clip and blocks duplicate resume requests', async () => {
    await service.play('a', async () => audio);
    await service.resume('a');
    expect(elements[0].play).toHaveBeenCalledTimes(1);
    elements[0].currentTime = 1.25;
    jest.advanceTimersByTime(25);
    expect(service.getSnapshot('a').currentTime).toBe(1.25);
    elements[0].pause();
    expect(service.getSnapshot('a').status).toBe('paused');
    await service.resume('a');
    elements[0].dispatchEvent(new Event('error'));
    expect(service.getSnapshot('a')).toMatchObject({ status: 'error', error: expect.any(String) });
    await service.resume('a');
    elements[1].ended = true; elements[1].dispatchEvent(new Event('ended'));
    expect(service.getSnapshot('a')).toMatchObject({ status: 'idle', ended: true });
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    service.stop('a');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('provides full-size artwork and routes system pause, play and seek to the existing WAV', async () => {
    await service.play('song', async () => audio, { label: 'Song playback' });
    expect(session.metadata).toMatchObject({ title: 'Song playback', artist: 'Guitar Companion',
      artwork: [{ src: new URL('app-icons/guitar_icon.png', document.baseURI).href, sizes: '1024x1024', type: 'image/png' }] });
    expect(session.playbackState).toBe('playing');
    handlers.get('pause')!({ action: 'pause' });
    expect(service.getSnapshot('song').status).toBe('paused');
    expect(session.playbackState).toBe('paused');
    handlers.get('seekto')!({ action: 'seekto', seekTime: 2 });
    expect(elements[0].currentTime).toBe(2);
    handlers.get('seekbackward')!({ action: 'seekbackward', seekOffset: 1 });
    expect(elements[0].currentTime).toBe(1);
    handlers.get('seekforward')!({ action: 'seekforward' });
    expect(elements[0].currentTime).toBe(4);
    expect(session.setPositionState).toHaveBeenLastCalledWith({ duration: 4, position: 4, playbackRate: 1 });
    handlers.get('play')!({ action: 'play' });
    await Promise.resolve();
    expect(session.playbackState).toBe('playing');
    expect(elements).toHaveLength(1);
    handlers.get('stop')!({ action: 'stop' });
    expect(session.metadata).toBeNull(); expect(session.playbackState).toBe('none');
    expect(handlers.size).toBe(0);
    expect(elements[0].src).toBe('');
  });

  it('replays a completed clip from zero without rendering again and releases it on replacement', async () => {
    const prepare = jest.fn(async () => audio);
    await service.play('a', prepare);
    elements[0].currentTime = 4; elements[0].ended = true; elements[0].paused = true;
    elements[0].dispatchEvent(new Event('ended'));
    expect(service.getSnapshot('a')).toMatchObject({ status: 'idle', ended: true });
    expect(session.playbackState).toBe('paused');
    expect(session.setPositionState).toHaveBeenLastCalledWith({ duration: 4, position: 0, playbackRate: 1 });
    expect(service.notices()).toEqual([]);
    const stalePlay = handlers.get('play')!;
    elements[0].ended = false;
    handlers.get('play')!({ action: 'play' });
    await Promise.resolve();
    expect(elements[0].currentTime).toBe(0);
    expect(elements[0].play).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot('a')).toMatchObject({ status: 'playing', ended: false });
    elements[0].ended = true; elements[0].dispatchEvent(new Event('ended'));
    await service.play('b', async () => audio);
    expect(elements[0].src).toBe('');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    stalePlay({ action: 'play' });
    expect(elements[0].play).toHaveBeenCalledTimes(2);
    service.stopAll();
    expect(session.metadata).toBeNull(); expect(handlers.size).toBe(0);
  });

  it('keeps system controls attached to another playing channel when a preview ends or stops', async () => {
    await service.play('loop', async () => audio, { label: 'Metronome', loop: true });
    await service.play('preview', async () => audio, { label: 'Chord' });
    elements[1].ended = true; elements[1].dispatchEvent(new Event('ended'));
    expect(elements[1].src).toBe('');
    expect(session.metadata?.title).toBe('Metronome');
    expect(session.playbackState).toBe('playing');
    service.stop('preview');
    expect(session.metadata?.title).toBe('Metronome');
    handlers.get('pause')!({ action: 'pause' });
    expect(elements[0].paused).toBe(true);
  });

  it('allows a completed clip to be sought before resuming', async () => {
    await service.play('a', async () => audio);
    elements[0].ended = true; elements[0].currentTime = 4;
    elements[0].dispatchEvent(new Event('ended'));
    handlers.get('seekto')!({ action: 'seekto', seekTime: 2 });
    // Seeking a real media element away from its end clears its ended flag.
    elements[0].ended = false;
    expect(service.getSnapshot('a')).toMatchObject({ status: 'paused', ended: false, currentTime: 2 });
    handlers.get('play')!({ action: 'play' });
    await Promise.resolve();
    expect(elements[0].currentTime).toBe(2);
    expect(service.getSnapshot('a').status).toBe('playing');
  });

  it('clears ownership on error and ignores saved controls after release', async () => {
    await service.play('a', async () => audio);
    const stalePlay = handlers.get('play')!;
    elements[0].dispatchEvent(new Event('error'));
    expect(session.metadata).toBeNull(); expect(handlers.size).toBe(0);
    service.release('a'); stalePlay({ action: 'play' });
    expect(elements).toHaveLength(1);
    expect(service.notices()).toEqual([]);
  });

  it('works without Media Session and tolerates unsupported optional controls', async () => {
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: undefined });
    await service.play('a', async () => audio);
    expect(service.getSnapshot('a').status).toBe('playing');
    service.stop('a');
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
    session.setActionHandler.mockImplementation((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      if (action === 'seekto') throw new DOMException('Unsupported action', 'NotSupportedError');
      if (handler) handlers.set(action, handler); else handlers.delete(action);
    });
    session.setPositionState.mockImplementation(() => { throw new Error('Unsupported'); });
    await service.play('a', async () => audio);
    expect(service.getSnapshot('a').status).toBe('playing');
    expect(handlers.has('play')).toBe(true); expect(handlers.has('seekforward')).toBe(true);
    service.stop('a');
    expect(session.metadata).toBeNull();
  });
});
