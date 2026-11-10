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
  beforeEach(() => {
    jest.useFakeTimers(); elements = [];
    jest.spyOn(globalThis, 'Audio').mockImplementation(() => {
      const element = new MediaElement(); elements.push(element); return element as unknown as HTMLAudioElement;
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => `blob:${elements.length}`) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    service = new HtmlAudioPlaybackService();
  });
  afterEach(() => { service.ngOnDestroy(); jest.restoreAllMocks(); jest.useRealTimers(); });

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

  it('synchronizes pause/error/ended events, releases URLs and blocks duplicate resume requests', async () => {
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
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });
});
