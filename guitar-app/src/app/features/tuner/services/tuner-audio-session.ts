export class TunerAudioSession {
  private generation = 0;
  private pendingCleanup: (() => void) | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private sampleBuffer: Float32Array | null = null;
  private mediaSessionListenerCleanup: Array<() => void> = [];

  constructor(private readonly onInterrupted: () => void) {}

  isSupported(): boolean {
    return typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      !!this.getAudioContextConstructor();
  }

  async startSession(fftSize: number): Promise<void> {
    const generation = ++this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    let context: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      try { sourceNode?.disconnect(); } catch { /* continue releasing capture */ }
      stream.getTracks().forEach(track => track.stop());
      if (context) void context.close().catch(() => undefined);
    };
    this.pendingCleanup = release;
    try {
      context = this.createAudioContext();
      await context.resume();
      if (generation !== this.generation) {
        release();
        return;
      }

      const analyser = context.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = 0;

      sourceNode = context.createMediaStreamSource(stream);
      sourceNode.connect(analyser);

      this.audioContext = context;
      this.mediaStream = stream;
      this.analyser = analyser;
      this.sourceNode = sourceNode;
      this.sampleBuffer = new Float32Array(analyser.fftSize);
      this.attachMediaSessionListeners(stream);
    } catch (error) {
      release();
      throw error;
    } finally {
      if (this.pendingCleanup === release) this.pendingCleanup = null;
    }
  }

  stopSession(): void {
    ++this.generation;
    this.pendingCleanup?.();
    this.pendingCleanup = null;
    this.detachMediaSessionListeners();
    this.cleanupAudioNodes();
  }

  readFrame(): Float32Array | null {
    if (!this.analyser || !this.sampleBuffer) {
      return null;
    }

    this.analyser.getFloatTimeDomainData(this.sampleBuffer);
    return this.sampleBuffer;
  }

  isInactive(): boolean {
    const stream = this.mediaStream;
    if (!stream) {
      return false;
    }

    const tracks = typeof stream.getAudioTracks === 'function'
      ? stream.getAudioTracks()
      : typeof stream.getTracks === 'function'
        ? stream.getTracks()
        : [];
    const streamActive = 'active' in stream ? Boolean(stream.active) : true;

    if (!streamActive || tracks.length === 0) {
      return true;
    }

    return tracks.some(track => track.readyState === 'ended' || track.muted);
  }

  hasActiveSession(): boolean {
    return this.mediaStream !== null ||
      this.audioContext !== null ||
      this.analyser !== null ||
      this.sourceNode !== null;
  }

  get sampleRate(): number | null {
    return this.audioContext?.sampleRate ?? null;
  }

  get fftSize(): number | null {
    return this.analyser?.fftSize ?? this.sampleBuffer?.length ?? null;
  }

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getSampleBuffer(): Float32Array | null {
    return this.sampleBuffer;
  }

  setTestSession(input: {
    audioContext: AudioContext | null;
    analyser: AnalyserNode | null;
    sampleBuffer: Float32Array | null;
  }): void {
    this.audioContext = input.audioContext;
    this.analyser = input.analyser;
    this.sampleBuffer = input.sampleBuffer;
  }

  private createAudioContext(): AudioContext {
    const AudioContextCtor = this.getAudioContextConstructor();
    if (!AudioContextCtor) {
      throw new Error('AudioContext is unavailable');
    }

    return new AudioContextCtor();
  }

  private getAudioContextConstructor(): (new () => AudioContext) | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const webkitAudioContext = (window as Window & { webkitAudioContext?: new () => AudioContext }).webkitAudioContext;
    return window.AudioContext ?? webkitAudioContext ?? null;
  }

  private cleanupAudioNodes(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore disconnect failures during teardown
      }
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
    }

    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
    }

    this.audioContext = null;
    this.mediaStream = null;
    this.analyser = null;
    this.sourceNode = null;
    this.sampleBuffer = null;
  }

  private attachMediaSessionListeners(stream: MediaStream): void {
    this.detachMediaSessionListeners();

    this.registerMediaSessionListener(stream, 'inactive', this.onInterrupted);

    const tracks = typeof stream.getAudioTracks === 'function'
      ? stream.getAudioTracks()
      : typeof stream.getTracks === 'function'
        ? stream.getTracks()
        : [];

    for (const track of tracks) {
      this.registerMediaSessionListener(track, 'ended', this.onInterrupted);
      this.registerMediaSessionListener(track, 'mute', this.onInterrupted);
    }
  }

  private registerMediaSessionListener(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.mediaSessionListenerCleanup.push(() => target.removeEventListener(type, listener));
  }

  private detachMediaSessionListeners(): void {
    for (const cleanup of this.mediaSessionListenerCleanup) {
      cleanup();
    }
    this.mediaSessionListenerCleanup = [];
  }
}
