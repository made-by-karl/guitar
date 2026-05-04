import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { DebugSettingsService } from '@/app/core/services/debug-settings.service';
import { ModalService } from '@/app/core/services/modal.service';
import { note } from '@/app/core/music/semitones';
import { TunerComponent } from '@/app/features/tuner/pages/tuner-page/tuner.component';
import { TunerService, TunerState } from '@/app/features/tuner/services/tuner.service';

describe('TunerComponent', () => {
  let fixture: ComponentFixture<TunerComponent>;
  let stateSubject: BehaviorSubject<TunerState>;
  let mockTunerService: jest.Mocked<TunerService>;
  let mockModalService: { show: jest.Mock };
  let debugSettings: {
    tunerDebugEnabled: WritableSignal<boolean>;
    setTunerDebugEnabled: jest.Mock;
  };

  beforeEach(async () => {
    stateSubject = new BehaviorSubject<TunerState>({
      supported: true,
      permission: 'idle',
      running: false,
      sessionStatus: 'idle',
      frequencyHz: null,
      rawFrequencyHz: null,
      displayFrequencyHz: null,
      midiFloat: null,
      displayMidiFloat: null,
      nearestNote: null,
      centsOff: null,
      semitoneOffset: null,
      confidence: 0,
      pitchProbability: 0,
      inputLevel: 0,
      displayInputLevel: 0,
      noiseFloor: 0.0012,
      signalPresent: false,
      pitchLocked: false,
      lockStrength: 0,
      pitchCandidates: [],
      trackingState: 'idle',
      inTune: false,
      interruptionMessage: null,
      errorMessage: null
    });

    mockTunerService = {
      state$: stateSubject.asObservable(),
      getSnapshot: jest.fn(() => stateSubject.getValue()),
      start: jest.fn(),
      stop: jest.fn(),
      hasDebugFrames: jest.fn(() => false),
      downloadDebugData: jest.fn(() => true)
    } as any;

    mockModalService = {
      show: jest.fn(() => ({
        afterClosed: jest.fn(async () => null)
      }))
    };

    debugSettings = {
      tunerDebugEnabled: signal(false),
      setTunerDebugEnabled: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [TunerComponent],
      providers: [
        { provide: TunerService, useValue: mockTunerService },
        { provide: DebugSettingsService, useValue: debugSettings },
        { provide: ModalService, useValue: mockModalService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TunerComponent);
    fixture.detectChanges();
  });

  it('renders the new tuner header and idle listening state', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.bi-broadcast-pin')).toBeTruthy();
    expect(compiled.textContent).toContain('Tuner');
    expect(compiled.textContent).toContain('Tuner Ready');
    expect(compiled.textContent).toContain('Mic Ready');
    expect(compiled.textContent).toContain('Start');
    expect(compiled.querySelector('.tuner-summary')).toBeTruthy();
    expect(compiled.querySelector('.tuner-summary')?.classList.contains('tuner-summary--hidden')).toBe(true);
    expect(compiled.textContent).not.toContain('Frequency Candidates');
    expect(compiled.textContent).not.toContain('Chromatic Tuner');
    expect(compiled.textContent).not.toContain('Tap start and allow microphone access');
    expect(compiled.textContent).not.toContain('Start the microphone and play a steady note');
    expect(compiled.textContent).not.toContain('Download Debug Data');
  });

  it('shows one toggle button that switches between Start and Stop', () => {
    const button = (fixture.nativeElement as HTMLElement).querySelector('.tuner-controls-card__actions .btn') as HTMLButtonElement;
    expect(button.textContent).toContain('Start');

    stateSubject.next({
      ...stateSubject.getValue(),
      permission: 'granted',
      running: true,
      sessionStatus: 'running'
    });
    fixture.detectChanges();

    expect(button.textContent).toContain('Stop');
  });

  it('places the sound level meter in the mic control topline', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const topLine = compiled.querySelector('.tuner-controls-card__topline');
    const meter = compiled.querySelector('.input-meter');

    expect(topLine).toBeTruthy();
    expect(meter).toBeTruthy();
    expect(topLine?.contains(meter)).toBe(true);
  });

  it('shows track movement state before a note locks', () => {
    stateSubject.next({
      ...stateSubject.getValue(),
      permission: 'granted',
      running: true,
      sessionStatus: 'running',
      rawFrequencyHz: 110.4,
      pitchProbability: 0.63,
      inputLevel: 0.28,
      displayInputLevel: 0.28,
      signalPresent: true,
      pitchCandidates: [
        {
          frequencyHz: 110.4,
          probability: 0.63,
          periodicity: 0.74,
          signalToNoiseEstimate: 3.1,
          rankingScore: 0.68
        }
      ],
      trackingState: 'acquiring'
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.input-meter')?.classList.contains('input-meter--signal')).toBe(true);
    expect(compiled.querySelector('.input-meter')?.classList.contains('input-meter--locked')).toBe(false);
    expect(compiled.querySelector('.tuner-summary')).toBeTruthy();
    expect(compiled.querySelector('.tuner-summary')?.classList.contains('tuner-summary--hidden')).toBe(false);
    expect(compiled.querySelector('.tuner-summary__primary')?.textContent).toContain('110.4 Hz');
    expect(compiled.querySelector('.tuner-summary__secondary')?.textContent).toContain('A2');
    expect(compiled.querySelectorAll('.track-marker').length).toBeGreaterThan(0);
    expect(compiled.textContent).not.toContain('63%');
  });

  it('renders a stable detected note with distinct lock and matched states', () => {
    stateSubject.next({
      supported: true,
      permission: 'granted',
      running: true,
      sessionStatus: 'running',
      frequencyHz: 440,
      rawFrequencyHz: 440.4,
      displayFrequencyHz: 440,
      midiFloat: 69,
      displayMidiFloat: 69,
      nearestNote: note('A', 4),
      centsOff: 0,
      semitoneOffset: 0,
      confidence: 0.95,
      pitchProbability: 0.94,
      inputLevel: 0.67,
      displayInputLevel: 0.67,
      noiseFloor: 0.001,
      signalPresent: true,
      pitchLocked: true,
      lockStrength: 0.96,
      pitchCandidates: [
        {
          frequencyHz: 440,
          probability: 0.94,
          periodicity: 0.96,
          signalToNoiseEstimate: 8.4,
          rankingScore: 0.95
        },
        {
          frequencyHz: 220,
          probability: 0.31,
          periodicity: 0.42,
          signalToNoiseEstimate: 0.8,
          rankingScore: 0.27
        }
      ],
      trackingState: 'locked',
      inTune: true,
      interruptionMessage: null,
      errorMessage: null
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.tuner-summary__primary')?.textContent).toContain('440.0 Hz');
    expect(compiled.querySelector('.tuner-summary__secondary')?.textContent).toContain('A4');
    expect(compiled.querySelector('.tuner-summary__secondary')?.textContent).toContain('in tune');
    expect(compiled.querySelector('.tuner-track-card')?.classList.contains('tuner-track-card--matched')).toBe(true);
    expect(compiled.querySelector('.input-meter')?.classList.contains('input-meter--locked')).toBe(true);
    expect(compiled.textContent).not.toContain('94%');
    expect(compiled.textContent).not.toContain('Lock 96%');
    expect(compiled.textContent).not.toContain('Perfectly centered');
  });

  it('renders separate close and exact tolerance bands around the target note', () => {
    stateSubject.next({
      supported: true,
      permission: 'granted',
      running: true,
      sessionStatus: 'running',
      frequencyHz: 440,
      rawFrequencyHz: 440.4,
      displayFrequencyHz: 440,
      midiFloat: 69,
      displayMidiFloat: 69,
      nearestNote: note('A', 4),
      centsOff: 0,
      semitoneOffset: 0,
      confidence: 0.95,
      pitchProbability: 0.94,
      inputLevel: 0.67,
      displayInputLevel: 0.67,
      noiseFloor: 0.001,
      signalPresent: true,
      pitchLocked: true,
      lockStrength: 0.96,
      pitchCandidates: [],
      trackingState: 'locked',
      inTune: true,
      interruptionMessage: null,
      errorMessage: null
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const closeBand = compiled.querySelector('.tuner-track__tolerance--close') as HTMLElement | null;
    const exactBand = compiled.querySelector('.tuner-track__tolerance--exact') as HTMLElement | null;

    expect(closeBand).toBeTruthy();
    expect(exactBand).toBeTruthy();
    expect(closeBand?.style.width).toBe('23.6px');
    expect(exactBand?.style.width).toBe('11.8px');
    expect(exactBand?.classList.contains('tuner-track__tolerance--matched')).toBe(true);
    expect(closeBand?.classList.contains('tuner-track__tolerance--matched')).toBe(false);
  });

  it('shows the debug export action only when dev mode is enabled and data exists', async () => {
    debugSettings.tunerDebugEnabled.set(true);
    mockTunerService.hasDebugFrames.mockReturnValue(true);
    fixture.detectChanges();

    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find(element => element.textContent?.includes('Export Debug'));

    expect(button).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('.tuner-debug-card')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Frequency Candidates');

    button?.dispatchEvent(new Event('click'));
    await fixture.whenStable();

    expect(mockModalService.show).toHaveBeenCalledTimes(1);
    expect(mockTunerService.downloadDebugData).toHaveBeenCalledWith(null);
  });

  it('shows the mic interruption message without reviving the old prose', () => {
    stateSubject.next({
      ...stateSubject.getValue(),
      permission: 'granted',
      sessionStatus: 'interrupted',
      interruptionMessage: 'Microphone became inactive. Tap Start to reconnect.'
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.tuner-summary')).toBeTruthy();
    expect(compiled.querySelector('.tuner-summary')?.classList.contains('tuner-summary--hidden')).toBe(true);
    expect(compiled.textContent).not.toContain('Pitch lock acquired');
  });

  it('keeps the main readout visible when no frequency is detected and hides moving markers', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.tuner-track__readout')).toBeNull();
    expect(compiled.querySelector('.tuner-summary')).toBeTruthy();
    expect(compiled.querySelector('.tuner-summary')?.classList.contains('tuner-summary--hidden')).toBe(true);
    expect(compiled.querySelectorAll('.track-marker')).toHaveLength(0);
  });

  it('passes the entered description into the debug export', async () => {
    debugSettings.tunerDebugEnabled.set(true);
    mockTunerService.hasDebugFrames.mockReturnValue(true);
    mockModalService.show.mockReturnValue({
      afterClosed: jest.fn(async () => 'Soft E4, fades to A2')
    });
    fixture.detectChanges();

    await fixture.componentInstance.downloadDebugData();

    expect(mockTunerService.downloadDebugData).toHaveBeenCalledWith('Soft E4, fades to A2');
  });
});
