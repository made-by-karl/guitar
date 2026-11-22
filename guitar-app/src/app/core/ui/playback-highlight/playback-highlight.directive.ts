import { ChangeDetectorRef, Directive, effect, inject, InjectionToken, input } from '@angular/core';
import { isObservable, Observable } from 'rxjs';

import { PlaybackHighlight, PlaybackHighlightView } from '@/app/core/services/playback-highlight';

export const PLAYBACK_HIGHLIGHT_VIEW = new InjectionToken<PlaybackHighlightView>('PlaybackHighlightView');

@Directive({ selector: '[appPlaybackHighlight]' })
export class PlaybackHighlightDirective {
  readonly appPlaybackHighlight = input<PlaybackHighlight | undefined | Observable<PlaybackHighlight | undefined>>();
  private readonly view = inject(PLAYBACK_HIGHLIGHT_VIEW, { self: true });
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {
    effect(onCleanup => {
      const position = this.appPlaybackHighlight();
      if (!isObservable(position)) {
        this.view.highlightPlayback(position);
        return;
      }
      // Initial values join the ongoing render. Subsequent media-clock emissions
      // update this drawing in the same callback, before the browser paints,
      // without waiting for a coalesced application change-detection pass.
      let subscribing = true;
      const subscription = position.subscribe(value => {
        this.view.highlightPlayback(value);
        if (!subscribing) this.changeDetector.detectChanges();
      });
      subscribing = false;
      onCleanup(() => subscription.unsubscribe());
    });
  }
}
