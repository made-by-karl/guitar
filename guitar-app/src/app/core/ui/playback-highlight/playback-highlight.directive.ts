import { Directive, effect, inject, InjectionToken, input } from '@angular/core';

import { PlaybackHighlight, PlaybackHighlightView } from '@/app/core/services/playback-highlight';

export const PLAYBACK_HIGHLIGHT_VIEW = new InjectionToken<PlaybackHighlightView>('PlaybackHighlightView');

@Directive({ selector: '[appPlaybackHighlight]' })
export class PlaybackHighlightDirective {
  readonly appPlaybackHighlight = input<PlaybackHighlight | undefined>();
  private readonly view = inject(PLAYBACK_HIGHLIGHT_VIEW, { self: true });

  constructor() {
    effect(() => this.view.highlightPlayback(this.appPlaybackHighlight()));
  }
}
