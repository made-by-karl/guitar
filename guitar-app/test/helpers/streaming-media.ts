export class FakeStreamRanges implements TimeRanges {
  values: [number, number][] = [];
  get length(): number { return this.values.length; }
  start(index: number): number { return this.values[index][0]; }
  end(index: number): number { return this.values[index][1]; }
}
export class FakeSourceBuffer extends EventTarget {
  buffered = new FakeStreamRanges(); updating = false; timestampOffset = 0; appended: number[] = []; quotaFailures = 0;
  abort = jest.fn();
  appendBuffer = jest.fn(() => {
    if (this.updating) throw new DOMException('Already appending', 'InvalidStateError');
    if (this.quotaFailures-- > 0) throw new DOMException('Full', 'QuotaExceededError');
    this.appended.push(this.timestampOffset);
    const values = [...this.buffered.values, [this.timestampOffset, this.timestampOffset + 4] as [number, number]].sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const range of values) { const last = merged.at(-1); if (last && last[1] >= range[0]) last[1] = Math.max(last[1], range[1]); else merged.push([...range]); }
    this.buffered.values = merged; this.updating = true;
    this.dispatchEvent(new Event('bufferedchange'));
    void Promise.resolve().then(() => { this.updating = false; this.dispatchEvent(new Event('updateend')); });
  });
  remove = jest.fn((from: number, to: number) => {
    this.buffered.values = this.buffered.values.flatMap(([start, end]) => [
      ...(start < from ? [[start, Math.min(end, from)] as [number, number]] : []),
      ...(end > to ? [[Math.max(start, to), end] as [number, number]] : []) ]);
    void Promise.resolve().then(() => this.dispatchEvent(new Event('updateend')));
  });
}
export class FakeMediaSource extends EventTarget {
  static instances: FakeMediaSource[] = [];
  duration = 120; readyState = 'open'; buffer = new FakeSourceBuffer();
  addSourceBuffer = jest.fn(() => this.buffer as unknown as SourceBuffer);
  endOfStream = jest.fn(() => { this.readyState = 'ended'; });
  constructor() { super(); FakeMediaSource.instances.push(this); void Promise.resolve().then(() => this.dispatchEvent(new Event('sourceopen'))); }
}
export class FakeStreamAudio extends EventTarget { src = ''; currentTime = 0; paused = true; ended = false; seeking = false; disableRemotePlayback = false; pause = jest.fn(() => { this.paused = true; }); }
