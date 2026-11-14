import { Component, computed, inject, input } from '@angular/core';
import { HtmlAudioPlaybackService } from '@/app/core/services/html-audio-playback.service';

@Component({
  selector: 'app-media-playback-controls',
  standalone: true,
  host: {
    '[class.overlay]': "presentation() === 'overlay'",
    '[class.has-notices]': 'notices().length > 0'
  },
  templateUrl: './media-playback-controls.component.html',
  styleUrl: './media-playback-controls.component.scss'
})
export class MediaPlaybackControlsComponent {
  readonly media = inject(HtmlAudioPlaybackService);
  readonly presentation = input<'inline' | 'overlay'>('inline');
  readonly attentionOnly = input(true);
  readonly channels = input<readonly string[]>();
  readonly notices = computed(() => this.media.notices().filter(notice =>
    (!this.channels() || this.channels()!.includes(notice.channel)) &&
    (!this.attentionOnly() || notice.status === 'ready' || notice.status === 'error')
  ));
}
