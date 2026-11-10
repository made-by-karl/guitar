import { Component, OnDestroy } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { HtmlAudioPlaybackService } from '@/app/core/services/html-audio-playback.service';

@Component({
  selector: 'app-media-playback-controls',
  standalone: true,
  templateUrl: './media-playback-controls.component.html',
  styleUrl: './media-playback-controls.component.scss'
})
export class MediaPlaybackControlsComponent implements OnDestroy {
  private readonly navigation;
  constructor(public media: HtmlAudioPlaybackService, router: Router) {
    this.navigation = router.events.subscribe(event => { if (event instanceof NavigationStart) media.stopAll(); });
  }
  ngOnDestroy(): void { this.navigation.unsubscribe(); this.media.stopAll(); }
}
