import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HtmlAudioPlaybackService, HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';
import { SongPartTransportComponent } from '@/app/features/sheets/ui/song-part-transport/song-part-transport.component';
import { SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';

describe('SongPartTransportComponent', () => {
  const notices = signal<HtmlAudioProgress[]>([]);

  async function setup(state: SongSheetPlaybackState = { type: 'none', status: 'idle' }) {
    notices.set([]);
    await TestBed.configureTestingModule({
      imports: [SongPartTransportComponent],
      providers: [{ provide: HtmlAudioPlaybackService, useValue: { notices } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(SongPartTransportComponent);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('partId', 'part');
    fixture.componentRef.setInput('measureCount', 3);
    fixture.componentRef.setInput('playable', true);
    fixture.detectChanges();
    const buttons = () => Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    return { fixture, component: fixture.componentInstance, buttons };
  }

  it('keeps one ordered transport and emits play, pause, resume, seek and stop without owning a session', async () => {
    const { fixture, component, buttons } = await setup();
    const events = [component.play, component.pause, component.resume, component.previous, component.next, component.stop].map(event => jest.spyOn(event, 'emit'));
    expect(buttons().map(button => button.getAttribute('aria-label') ?? button.textContent?.trim())).toEqual(['Play', 'Previous measure', 'Next measure', 'Stop']);
    expect(buttons().map(button => button.disabled)).toEqual([false, true, true, true]);
    buttons()[0].click();
    expect(events[0]).toHaveBeenCalledTimes(1);
    const state: SongSheetPlaybackState = { type: 'part', status: 'playing', partId: 'part', currentMeasureIndex: 1, totalMeasures: 3 };
    fixture.componentRef.setInput('state', state); fixture.detectChanges();
    expect(buttons().map(button => button.disabled)).toEqual([false, false, false, false]);
    buttons()[0].click(); buttons()[1].click(); buttons()[2].click(); buttons()[3].click();
    for (const index of [1, 3, 4, 5]) expect(events[index]).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('state', { ...state, status: 'paused' }); fixture.detectChanges();
    expect(buttons()[0].textContent).toContain('Resume');
    buttons()[0].click(); expect(events[2]).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Paused · Measure 2 / 3');
  });

  it('allows Stop during preparation while disabling primary and seek controls', async () => {
    const { fixture, buttons } = await setup({ type: 'part', status: 'preparing', partId: 'part', currentMeasureIndex: 1, totalMeasures: 3 });
    expect(buttons().map(button => button.disabled)).toEqual([true, true, true, false]);
    expect(fixture.nativeElement.textContent).toContain('Preparing…');
    expect(fixture.nativeElement.textContent).not.toContain('Playing');
  });

  it.each(['ready', 'error'] as const)('leaves %s recovery to existing media controls', async status => {
    const { fixture, buttons } = await setup({ type: 'part', status: 'paused', partId: 'part', currentMeasureIndex: 1, totalMeasures: 3 });
    notices.set([{ channel: 'finite:song-part-playback', label: 'Part', status, currentTime: 0, duration: 6, ended: false }]);
    fixture.detectChanges();
    expect(buttons().map(button => button.disabled)).toEqual([true, true, true, false]);
    expect(fixture.nativeElement.textContent).toContain(status === 'ready' ? 'Ready to play' : 'Playback needs attention');
    expect(fixture.nativeElement.textContent).not.toContain('Paused');
  });

  it('restricts occurrence transport and disables seeking past the sequence boundaries', async () => {
    const state: SongSheetPlaybackState = { type: 'part', status: 'paused', partId: 'part', occurrenceId: 'first', currentMeasureIndex: 0, totalMeasures: 3 };
    const { fixture, buttons } = await setup(state);
    expect(buttons()[1].disabled).toBe(true); expect(buttons()[2].disabled).toBe(false);
    fixture.componentRef.setInput('state', { ...state, currentMeasureIndex: 2 }); fixture.detectChanges();
    expect(buttons()[1].disabled).toBe(false); expect(buttons()[2].disabled).toBe(true);
    fixture.componentRef.setInput('occurrenceId', 'second'); fixture.detectChanges();
    expect(buttons()[0].textContent).toContain('Play');
    expect(buttons().map(button => button.disabled)).toEqual([false, true, true, true]);
    fixture.componentRef.setInput('playable', false); fixture.detectChanges();
    expect(buttons()[0].disabled).toBe(true);
  });
});
