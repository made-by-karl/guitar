import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { MetronomeComponent } from '@/app/features/metronome/pages/metronome-page/metronome.component';
import { MetronomeConfig, MetronomeService, MetronomeState } from '@/app/features/metronome/services/metronome.service';
import { AudioService } from '@/app/core/services/audio.service';
import { BpmSelectorComponent } from '@/app/core/ui/bpm-selector/bpm-selector.component';
import { buildMetronomeLabels } from '@/app/features/metronome/services/metronome-labels';

describe('MetronomeComponent', () => {
  let fixture: ComponentFixture<MetronomeComponent>;
  let component: MetronomeComponent;
  let stateSubject: BehaviorSubject<MetronomeState>;
  let mockMetronomeService: jest.Mocked<MetronomeService>;

  beforeEach(async () => {
    stateSubject = new BehaviorSubject<MetronomeState>({
      running: false,
      config: { bpm: 80, timeSignature: '4/4', subdivision: '8th' },
      labels: buildMetronomeLabels('4/4', '8th'),
      activeIndex: 0,
      tickAudioTime: 0,
      tickDurationSeconds: 0.5
    });

    mockMetronomeService = {
      state$: stateSubject.asObservable(),
      start: jest.fn(),
      stop: jest.fn(),
      updateConfig: jest.fn(async (config: MetronomeConfig) => {
        stateSubject.next({
          ...stateSubject.getValue(),
          config,
          labels: buildMetronomeLabels(config.timeSignature, config.subdivision),
          activeIndex: 0
        });
      })
    } as any;

    await TestBed.configureTestingModule({
      imports: [MetronomeComponent],
      providers: [
        { provide: MetronomeService, useValue: mockMetronomeService },
        { provide: AudioService, useValue: { now: jest.fn(() => 0) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MetronomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows both subdivision checkboxes for x/4 signatures', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('#subdivision8th')).toBeTruthy();
    expect(compiled.querySelector('#subdivision16th')).toBeTruthy();
  });

  it('shows only the sixteenth checkbox for x/8 signatures', async () => {
    component.timeSignature = '6/8';
    await component.onTimeSignatureChange();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#subdivision8th')).toBeFalsy();
    expect(compiled.querySelector('#subdivision16th')).toBeTruthy();
  });

  it('updates the beat visualization immediately when the time signature changes', async () => {
    component.timeSignature = '6/8';
    await component.onTimeSignatureChange();
    fixture.detectChanges();

    expect(mockMetronomeService.updateConfig).toHaveBeenCalledWith({
      bpm: 80,
      timeSignature: '6/8',
      subdivision: 'none'
    });
    expect(component.labels).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('updates the beat visualization immediately when subdivision settings change', async () => {
    await component.onSixteenthSubdivisionChange(true);
    fixture.detectChanges();

    expect(mockMetronomeService.updateConfig).toHaveBeenCalledWith({
      bpm: 80,
      timeSignature: '4/4',
      subdivision: '16th'
    });
    expect(component.labels).toEqual(['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a']);
  });

  it('updates playback immediately when the bpm changes', () => {
    const bpmSelector = fixture.debugElement.query(By.directive(BpmSelectorComponent)).componentInstance as BpmSelectorComponent;

    bpmSelector.onModeChange('custom');
    bpmSelector.onCustomInput('132');
    fixture.detectChanges();

    expect(component.bpm).toBe(132);
    expect(mockMetronomeService.updateConfig).toHaveBeenCalledWith({
      bpm: 132,
      timeSignature: '4/4',
      subdivision: '8th'
    });
  });
});
