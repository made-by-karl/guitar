import { Injectable } from '@angular/core';

export const STREAM_MIME = 'audio/mp4; codecs="fLaC"';
export const STREAM_CODEC_REVISION = 'flac16-mp4-mediabunny-1.66.2-v1';

@Injectable({ providedIn: 'root' })
export class StreamingAudioEncoderService {
  private library?: Promise<typeof import('mediabunny')>;

  private load(): Promise<typeof import('mediabunny')> {
    return this.library ??= Promise.all([import('mediabunny'), import('@mediabunny/flac-encoder')])
      .then(([library, extension]) => { extension.registerFlacEncoder(); return library; })
      .catch(error => { this.library = undefined; throw error; });
  }

  async encode(pcm: AudioBuffer, signal: AbortSignal): Promise<Uint8Array> {
    const { Output, BufferTarget, Mp4OutputFormat, AudioBufferSource } = await this.load();
    if (signal.aborted) throw new DOMException('Playback canceled', 'AbortError');
    const target = new BufferTarget();
    const output = new Output({ target, format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 4 }) });
    const source = new AudioBufferSource({ codec: 'flac', transform: { sampleFormat: 's16' } });
    output.addAudioTrack(source);
    const abort = () => { void output.cancel().catch(() => undefined); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      await output.start(); await source.add(pcm); await output.finalize();
      if (signal.aborted) throw new DOMException('Playback canceled', 'AbortError');
      if (!target.buffer) throw new Error('Streaming encoding returned no audio.');
      return new Uint8Array(target.buffer);
    } finally {
      signal.removeEventListener('abort', abort);
      if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel();
    }
  }
}
