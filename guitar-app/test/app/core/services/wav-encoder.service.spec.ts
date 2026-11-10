import { WavEncoderService } from '@/app/core/services/wav-encoder.service';

describe('WavEncoderService', () => {
  const createBuffer = (channels: number[][], sampleRate = 44100): AudioBuffer => ({
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0].length,
    getChannelData: (channel: number) => Float32Array.from(channels[channel])
  } as AudioBuffer);

  const readBlob = (blob: Blob): Promise<ArrayBuffer> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

  it('encodes mono buffers with RIFF/WAVE headers', async () => {
    const encoder = new WavEncoderService();
    const blob = encoder.encode(createBuffer([[0, 0.5]], 22050));
    const view = new DataView(await readBlob(blob));

    expect(blob.type).toBe('audio/wav');
    expect(String.fromCharCode(...new Uint8Array(view.buffer, 0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...new Uint8Array(view.buffer, 8, 4))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getUint16(34, true)).toBe(16);
  });

  it('interleaves stereo samples and clamps to signed 16-bit PCM', async () => {
    const encoder = new WavEncoderService();
    const blob = encoder.encode(createBuffer([
      [-2, 0.25],
      [2, -0.25]
    ]));
    const view = new DataView(await readBlob(blob));

    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(8192);
    expect(view.getInt16(50, true)).toBe(-8192);
  });
});
