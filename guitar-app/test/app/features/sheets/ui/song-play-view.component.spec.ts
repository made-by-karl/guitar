import { InteractivityChecker } from '@angular/cdk/a11y';
import { By } from '@angular/platform-browser';
import { PlayingActionsComponent } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PlaybackClockPosition } from '@/app/core/services/playback.service';
import { PlayingPatternPlaybackPlannerService } from '@/app/features/patterns/services/playing-pattern-playback-planner.service';
import { BehaviorSubject } from 'rxjs';
import { MODAL_DATA, MODAL_REF } from '@/app/core/services/modal.service';
import { HtmlAudioPlaybackService } from '@/app/core/services/html-audio-playback.service';
import { SongPartPlaybackService, SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';
import { SongPlayViewComponent } from '@/app/features/sheets/ui/song-play-view/song-play-view.component';

describe('SongPlayViewComponent', () => {
  let fixture: ComponentFixture<SongPlayViewComponent>;
  let state: BehaviorSubject<SongSheetPlaybackState>;
  let clock: BehaviorSubject<PlaybackClockPosition>;
  let sheet: SongSheet;
  const playback = { playSong: jest.fn(), pauseSong: jest.fn(), resumeSong: jest.fn(), stopSong: jest.fn(), canPlaySong: () => true };
  const modalRef = { close: jest.fn() };
  beforeEach(async () => {
    jest.clearAllMocks();
    sheet = { id: 'song', name: 'Song', tempo: 120, tuning: [], capodaster: 0, links: [], grips: [], patterns: [], created: 0, updated: 0,
      parts: [{ id: 'p', section: 'Verse', notes: '', measures: [{ id: 'm', measure: { timeSignature: '4/4', actions: [null, null],
        actionGrips: [{ measureIndex: 0, actionIndex: 1, gripId: 'x|3|2|o|1|o', name: 'C' }] } }] }],
      arrangement: [{ id: 'v1', partId: 'p', lyrics: 'First words' }, { id: 'v2', partId: 'p', lyrics: 'Other words' }]
    };
    state = new BehaviorSubject<SongSheetPlaybackState>({ type: 'none', status: 'idle' });
    clock = new BehaviorSubject<PlaybackClockPosition>({ currentTime: 0 });
    await TestBed.configureTestingModule({ imports: [SongPlayViewComponent], providers: [
      { provide: InteractivityChecker, useValue: { isFocusable: () => true, isTabbable: () => true } },
      { provide: MODAL_DATA, useValue: { sheet } }, { provide: MODAL_REF, useValue: modalRef },
      { provide: SongPartPlaybackService, useValue: { ...playback, state$: state, clock$: clock, getSnapshot: () => state.value } },
      { provide: HtmlAudioPlaybackService, useValue: { notices: signal([]) } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(SongPlayViewComponent); fixture.detectChanges();
  });
  const text = (fixture: ComponentFixture<SongPlayViewComponent>, selector: string): string => fixture.nativeElement.querySelector(selector).textContent;

  it('starts silent, projects the first measure and plays only through the shared transport', async () => {
    expect(text(fixture, '.play-status')).toBe('Ready to play');
    expect(text(fixture, '.current-grip')).toContain('No grip assigned');
    expect(text(fixture, '.lyrics')).toBe('First words');
    expect(playback.playSong).not.toHaveBeenCalled();
    await fixture.componentInstance.togglePlayback();
    expect(playback.playSong).toHaveBeenCalledWith(sheet);
  });

  it('updates snapshot, lyrics and grips together on seek, pauses/resumes the same run, and retains the final occurrence', async () => {
    const snapshot = { ...sheet, name: 'Scheduled name' };
    state.next({ type: 'song', status: 'playing', source: 'song', songSnapshot: snapshot, currentMeasureIndex: 1, actionIndex: 0, runId: 3 }); fixture.detectChanges();
    expect(text(fixture, 'h1')).toBe('Scheduled name');
    expect(text(fixture, '.lyrics')).toBe('Other words');
    expect(text(fixture, '.current-grip h3')).toBe('C');
    await fixture.componentInstance.togglePlayback(); expect(playback.pauseSong).toHaveBeenCalledTimes(1);
    state.next({ ...state.value, status: 'paused' }); fixture.detectChanges();
    await fixture.componentInstance.togglePlayback(); expect(playback.resumeSong).toHaveBeenCalledTimes(1);
    expect(playback.playSong).not.toHaveBeenCalled();
    state.next({ ...state.value, type: 'none', status: 'idle', ended: true, actionIndex: undefined }); fixture.detectChanges();
    expect(text(fixture, '.play-status')).toBe('End of song');
    expect(text(fixture, '.lyrics')).toBe('Other words');
    expect(fixture.nativeElement.querySelector('.playback-action-slot')).toBeNull();
    await fixture.componentInstance.togglePlayback(); expect(playback.playSong).toHaveBeenCalledWith(snapshot);
    state.next({ type: 'none', status: 'idle' }); fixture.detectChanges();
    expect(text(fixture, '.play-status')).toBe('Ready to play');
    expect(text(fixture, '.lyrics')).toBe('First words');
  });

  it('renders independent audio-clock bars, highlights a grip handoff and keeps empty upcoming cards quiet', () => {
    const C = 'x|3|2|o|1|o', G = '3|2|o|o|o|3';
    const first = sheet.parts[0].measures[0].measure;
    first.actions = Array(16).fill(null);
    first.actionGrips = [{ measureIndex: 0, actionIndex: 0, gripId: C, name: 'C' }, { measureIndex: 0, actionIndex: 8, gripId: G, name: 'G' }];
    const measures = [first, first];
    const timing = new PlayingPatternPlaybackPlannerService().buildPlaybackPlan(measures.map(measure => ({ measure, actionGrips: measure.actionGrips })), [], 120);
    const sequence = { measures, precedingMeasures: [], timing };
    const snapshot = JSON.parse(JSON.stringify(sheet)) as SongSheet;
    const setPosition = (time: number, measure = 0, action = 0, status: 'playing' | 'paused' = 'playing') => {
      state.next({ type: 'song', status, source: 'song', songSnapshot: snapshot, sequence, currentMeasureIndex: measure, actionIndex: action, runId: 7 });
      clock.next({ runId: 7, currentTime: time }); fixture.detectChanges();
    };
    const bar = (label: string): HTMLElement => fixture.nativeElement.querySelector(`[aria-label="${label}"]`);
    setPosition(0.5, 0, 4);
    expect(bar('Next grip progress').getAttribute('aria-valuenow')).toBe('50');
    expect(bar('After next grip progress').getAttribute('aria-valuenow')).toBe('25');
    expect(bar('Current part progress').getAttribute('aria-valuenow')).toBe('25');
    // Continuous samples advance bars without a new action/measure state.
    clock.next({ runId: 7, currentTime: 0.75 }); fixture.detectChanges();
    expect(bar('Next grip progress').getAttribute('aria-valuenow')).toBe('75');
    expect(bar('After next grip progress').getAttribute('aria-valuenow')).toBe('38');
    setPosition(1, 0, 8);
    expect(text(fixture, '.current-grip h3')).toBe('G');
    expect(fixture.nativeElement.querySelector('.grip-handoff')).not.toBeNull();
    expect(bar('Next grip progress').getAttribute('aria-valuenow')).toBe('50');
    expect(bar('After next grip progress').getAttribute('aria-valuenow')).toBe('0');
    expect(bar('Current part progress').getAttribute('aria-valuenow')).toBe('50');
    clock.next({ runId: 7, currentTime: 1.3 }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.grip-handoff')).toBeNull();
    setPosition(2, 1, 0, 'paused');
    expect(text(fixture, '.lyrics')).toBe('Other words');
    expect(bar('Next grip progress').getAttribute('aria-valuenow')).toBe('50');
    expect(bar('Current part progress').getAttribute('aria-valuenow')).toBe('0');
    expect(fixture.nativeElement.querySelector('.grip-handoff')).toBeNull();
    setPosition(3, 1, 8);
    expect(bar('Next grip progress')).toBeNull();
    expect(bar('After next grip progress')).toBeNull();
    expect(text(fixture, '[aria-label="Next"]')).toBe('Next');
    expect(text(fixture, '[aria-label="After next"]')).toBe('After next');
    state.next({ ...state.value, type: 'none', status: 'idle', ended: true, actionIndex: undefined });
    clock.next({ runId: 7, currentTime: 0 }); fixture.detectChanges();
    expect(bar('Current part progress').getAttribute('aria-valuenow')).toBe('100');
    state.next({ type: 'none', status: 'idle' }); fixture.detectChanges();
    expect(bar('Current part progress').getAttribute('aria-valuenow')).toBe('0');
  });

  it('draws the whole arrangement while idle and keeps the scheduled stream mounted across occurrence boundaries', () => {
    const drawing = fixture.debugElement.query(By.directive(PlayingActionsComponent)).componentInstance as PlayingActionsComponent;
    expect(drawing.measures()).toHaveLength(2);
    expect(drawing.notationHistory()).toEqual([]);
    const snapshot = JSON.parse(JSON.stringify(sheet)) as SongSheet;
    const measures = snapshot.arrangement!.map(occurrence => snapshot.parts.find(part => part.id === occurrence.partId)!.measures[0].measure);
    const sequence = { measures, precedingMeasures: [] };
    state.next({ type: 'song', status: 'paused', source: 'song', songSnapshot: snapshot, sequence, currentMeasureIndex: 1, actionIndex: 1, runId: 9 });
    fixture.detectChanges();
    expect(drawing.measures()).toBe(measures);
    expect(drawing.playbackPosition()).toEqual({ measureIndex: 1, actionIndex: 1, status: 'paused' });
    expect(fixture.nativeElement.querySelector('.playback-action-slot').getAttribute('data-slot-index')).toBe('3');
    expect(text(fixture, '.lyrics')).toBe('Other words');
    const segment = fixture.nativeElement.querySelector('.action-svg');
    state.next({ ...state.value, currentMeasureIndex: 0, actionIndex: 0 }); fixture.detectChanges();
    expect(drawing.measures()).toBe(measures);
    expect(fixture.nativeElement.querySelector('.playback-action-slot').getAttribute('data-slot-index')).toBe('0');
    expect(segment.isConnected).toBe(true);
    expect(text(fixture, '.lyrics')).toBe('First words');
  });

  it('exit and destruction release presentation without stopping the shared song', () => {
    fixture.componentInstance.exit(); expect(modalRef.close).toHaveBeenCalledTimes(1);
    fixture.destroy(); expect(playback.stopSong).not.toHaveBeenCalled();
  });
});
