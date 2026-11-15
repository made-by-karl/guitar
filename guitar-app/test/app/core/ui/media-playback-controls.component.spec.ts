import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HtmlAudioPlaybackService, HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';
import { MediaPlaybackControlsComponent } from '@/app/core/ui/media-playback-controls/media-playback-controls.component';

describe('MediaPlaybackControlsComponent presentation', () => {
  const notice = (channel: string, status: HtmlAudioProgress['status']): HtmlAudioProgress => ({
    channel, status, label: channel, currentTime: 0, duration: 1, ended: false
  });
  const media = { notices: signal<HtmlAudioProgress[]>([]), stopAll: jest.fn(), stop: jest.fn(), resume: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks(); media.notices.set([]);
    TestBed.configureTestingModule({ imports: [MediaPlaybackControlsComponent], providers: [
      { provide: HtmlAudioPlaybackService, useValue: media }
    ] });
  });

  it('shows inline recovery only when an interaction is required and filters owned channels', () => {
    const fixture = TestBed.createComponent(MediaPlaybackControlsComponent);
    fixture.componentRef.setInput('channels', ['chord-preview']);
    media.notices.set([notice('chord-preview', 'playing'), notice('other', 'ready')]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
    media.notices.set([notice('chord-preview', 'ready'), notice('other', 'error')]);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Play prepared audio');
    button.click();
    expect(media.resume).toHaveBeenCalledWith('chord-preview');
    expect(fixture.nativeElement.querySelectorAll('section')).toHaveLength(1);
    fixture.destroy();
    expect(media.stopAll).not.toHaveBeenCalled();
  });

  it('can opt into the full overlay without acquiring audio cleanup ownership', () => {
    const fixture = TestBed.createComponent(MediaPlaybackControlsComponent);
    fixture.componentRef.setInput('presentation', 'overlay');
    fixture.componentRef.setInput('attentionOnly', false);
    media.notices.set([notice('a', 'preparing'), notice('b', 'playing')]);
    fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('overlay')).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('section')).toHaveLength(2);
    fixture.destroy();
    expect(media.stopAll).not.toHaveBeenCalled();
  });
});
