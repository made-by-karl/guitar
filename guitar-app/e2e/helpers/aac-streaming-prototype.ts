/** Browser-only compatibility experiment. This minimal muxer is not a production encoder. */
export async function probeAacStreaming(sourceKind: 'media' | 'managed') {
  const sampleRate = 44100;
  const mime = 'audio/mp4; codecs="mp4a.40.2"';
  type Chunk = { timestamp: number; duration: number | null; byteLength: number; copyTo(data: Uint8Array): void };
  type EncoderConfig = { codec: string; sampleRate: number; numberOfChannels: number; bitrate: number };
  type Encoder = { configure(config: EncoderConfig): void; encode(data: { close(): void }): void; flush(): Promise<void>; close(): void; readonly state: 'unconfigured' | 'configured' | 'closed' };
  const api = window as unknown as {
    AudioEncoder?: {
      new(callbacks: { output(chunk: Chunk, metadata?: { decoderConfig?: { description?: ArrayBuffer } }): void; error(error: Error): void }): Encoder;
      isConfigSupported(config: EncoderConfig): Promise<{ supported: boolean }>;
    };
    AudioData?: new(options: { format: string; sampleRate: number; numberOfFrames: number; numberOfChannels: number; timestamp: number; data: Float32Array }) => { close(): void };
    ManagedMediaSource?: typeof MediaSource;
  };
  const config = { codec: 'mp4a.40.2', sampleRate, numberOfChannels: 1, bitrate: 128000 };
  const support = {
    secureContext: isSecureContext,
    userAgent: navigator.userAgent,
    audioEncoder: !!api.AudioEncoder,
    aacEncoder: !!api.AudioEncoder && !!(await api.AudioEncoder.isConfigSupported(config).catch(() => ({ supported: false }))).supported,
    mediaSource: typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mime),
    managedMediaSource: !!api.ManagedMediaSource && api.ManagedMediaSource.isTypeSupported(mime)
  };
  if (!support.secureContext || !support.aacEncoder || !api.AudioData || !(sourceKind === 'managed' ? support.managedMediaSource : support.mediaSource)) {
    return { support, outcome: 'unsupported' as const };
  }
  const Source = sourceKind === 'managed' ? api.ManagedMediaSource! : MediaSource;
  const concat = (...arrays: Uint8Array[]) => {
    const result = new Uint8Array(arrays.reduce((sum, array) => sum + array.length, 0));
    let offset = 0; for (const array of arrays) { result.set(array, offset); offset += array.length; }
    return result;
  };
  const u32 = (...values: number[]) => {
    const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setUint32(index * 4, value)); return bytes;
  };
  const u16 = (...values: number[]) => {
    const bytes = new Uint8Array(values.length * 2), view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setUint16(index * 2, value)); return bytes;
  };
  const ascii = (text: string) => new TextEncoder().encode(text);
  const box = (name: string, ...parts: Uint8Array[]) => {
    const body = concat(...parts); return concat(u32(8 + body.length), ascii(name), body);
  };
  const full = (name: string, flags: number, ...parts: Uint8Array[]) => box(name, u32(flags), ...parts);
  const matrix = u32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);
  const descriptor = (tag: number, bytes: Uint8Array) => concat(new Uint8Array([tag, bytes.length]), bytes);
  const init = (description: Uint8Array) => {
    const esds = full('esds', 0, descriptor(3, concat(u16(1), new Uint8Array([0]),
      descriptor(4, concat(new Uint8Array([0x40, 0x15, 0, 0, 0]), u32(128000, 128000), descriptor(5, description))),
      descriptor(6, new Uint8Array([2])))));
    const entry = box('mp4a', new Uint8Array(6), u16(1), new Uint8Array(8), u16(1, 16, 0, 0), u32(sampleRate * 65536), esds);
    const stbl = box('stbl', full('stsd', 0, u32(1), entry), full('stts', 0, u32(0)),
      full('stsc', 0, u32(0)), full('stsz', 0, u32(0, 0)), full('stco', 0, u32(0)));
    const minf = box('minf', full('smhd', 0, u32(0)), box('dinf', full('dref', 0, u32(1), full('url ', 1))), stbl);
    const mdia = box('mdia', full('mdhd', 0, u32(0, 0, sampleRate, 0), u16(0x55c4, 0)),
      full('hdlr', 0, u32(0), ascii('soun'), new Uint8Array(12), ascii('SoundHandler\0')), minf);
    const trak = box('trak', full('tkhd', 7, u32(0, 0, 1, 0, 0, 0, 0), u16(0, 0, 0x100, 0), matrix, u32(0, 0)), mdia);
    return concat(box('ftyp', ascii('isom'), u32(0x200), ascii('iso6mp41dash')),
      box('moov', full('mvhd', 0, u32(0, 0, sampleRate, 0, 0x10000), u16(0x100, 0), new Uint8Array(8), matrix, new Uint8Array(24), u32(2)),
        trak, box('mvex', full('trex', 0, u32(1, 1, 1024, 0, 0)))));
  };
  const packets: { timestamp: number; frames: number; bytes: Uint8Array }[] = [];
  let description: Uint8Array | undefined, encoderError: Error | undefined;
  const encoder = new api.AudioEncoder!({
    output: (chunk, metadata) => {
      const bytes = new Uint8Array(chunk.byteLength); chunk.copyTo(bytes);
      packets.push({ timestamp: chunk.timestamp, frames: Math.round((chunk.duration ?? 1024 / sampleRate * 1e6) * sampleRate / 1e6), bytes });
      if (metadata?.decoderConfig?.description) description = new Uint8Array(metadata.decoderConfig.description);
    },
    error: error => { encoderError = error; }
  });
  const media = new Source(), audio = new Audio();
  audio.disableRemotePlayback = true; // Required for ManagedMediaSource without an AirPlay alternative.
  const url = URL.createObjectURL(media);
  const onAction = (target: EventTarget, event: string, action: () => void | Promise<void> = () => undefined, timeoutMs = 15000) => new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); target.removeEventListener(event, done); target.removeEventListener('error', fail); };
    let observed = false, completed = false;
    const finish = () => { if (observed && completed) { cleanup(); resolve(); } };
    const done = () => { observed = true; finish(); };
    const fail = (error?: unknown) => { cleanup(); reject(error instanceof Error ? error : new Error(`${event}: media error`)); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error(`${event}: timed out`)); }, timeoutMs);
    target.addEventListener(event, done, { once: true }); target.addEventListener('error', fail, { once: true });
    try { void Promise.resolve(action()).then(() => { completed = true; finish(); }, fail); } catch (error) { fail(error); }
  });
  try {
    const start = performance.now();
    encoder.configure(config);
    // Continuous encoding first isolates container/append support from window-encoder priming.
    for (let frame = 0; frame < sampleRate * 12; frame += 1024) {
      const count = Math.min(1024, sampleRate * 12 - frame);
      const samples = Float32Array.from({ length: count }, (_, index) => 0.1 * Math.sin(2 * Math.PI * 440 * (frame + index) / sampleRate));
      const data = new api.AudioData!({ format: 'f32-planar', sampleRate, numberOfFrames: count,
        numberOfChannels: 1, timestamp: Math.round(frame / sampleRate * 1e6), data: samples });
      try { encoder.encode(data); } finally { data.close(); }
    }
    await encoder.flush();
    if (encoderError) throw encoderError;
    if (!description || !packets.length) throw new Error('Encoder returned no AAC configuration/packets');
    const encodeMs = performance.now() - start;
    const fragment = (group: typeof packets, sequence: number, offsetFrames: number) => {
      const moof = (offset: number) => box('moof', full('mfhd', 0, u32(sequence)), box('traf',
        full('tfhd', 0x20000, u32(1)), full('tfdt', 0x1000000, u32(0, offsetFrames)),
        full('trun', 0x301, u32(group.length, offset), ...group.map(packet => u32(packet.frames, packet.bytes.length)))));
      return concat(moof(moof(0).length + 8), box('mdat', ...group.map(packet => packet.bytes)));
    };
    await onAction(media, 'sourceopen', () => { audio.src = url; });
    const buffer = media.addSourceBuffer(mime);
    const append = async (bytes: Uint8Array) => {
      await onAction(buffer, 'updateend', () => buffer.appendBuffer(bytes as Uint8Array<ArrayBuffer>));
    };
    await append(init(description)); media.duration = 12;
    const firstCount = Math.ceil(4 * sampleRate / 1024);
    await append(fragment(packets.slice(0, firstCount), 1, 0));
    const firstRanges = Array.from({ length: buffer.buffered.length }, (_, i) => [buffer.buffered.start(i), buffer.buffered.end(i)]);
    const playStarted = performance.now();
    await onAction(audio, 'playing', () => audio.play());
    const firstPlayingMs = performance.now() - playStarted;
    // Exhaust the prefix deliberately, then prove append-driven recovery without
    // replacing the element or issuing a second play request.
    await onAction(audio, 'waiting');
    const underrunTime = audio.currentTime;
    await onAction(audio, 'playing', () => append(fragment(packets.slice(firstCount, firstCount * 2), 2, packets.slice(0, firstCount).reduce((n, p) => n + p.frames, 0))));
    // Append the later fragment and seek with the same element.
    await append(fragment(packets.slice(firstCount * 2), 3, packets.slice(0, firstCount * 2).reduce((n, p) => n + p.frames, 0)));
    await onAction(audio, 'seeked', () => { audio.currentTime = 9; });
    const randomSeekTime = audio.currentTime;
    const completedRanges = Array.from({ length: buffer.buffered.length }, (_, i) => [buffer.buffered.start(i), buffer.buffered.end(i)]);
    media.endOfStream();
    return { support, outcome: 'append-play-seek' as const, source: sourceKind === 'managed' ? 'ManagedMediaSource' : 'MediaSource',
      encodeMs, firstPlayingMs, underrunTime, recoveredWithoutPlay: !audio.paused, firstRanges, completedRanges, randomSeekTime,
      inputFrames: sampleRate * 12, presentationDeficitFrames: sampleRate * 12 - packets.reduce((n, p) => n + p.frames, 0), encodedFrames: packets.reduce((n, p) => n + p.frames, 0),
      firstPacketTimestampUs: packets[0].timestamp, encodedBytes: packets.reduce((n, p) => n + p.bytes.length, 0) };
  } catch (error) {
    return { support, outcome: 'failed' as const, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    audio.pause(); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url);
  }
}
