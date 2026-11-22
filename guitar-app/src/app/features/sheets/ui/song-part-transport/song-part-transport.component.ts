import { Component, computed, inject, input, output } from '@angular/core';
import { HtmlAudioPlaybackService } from '@/app/core/services/html-audio-playback.service';
import { SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';
import { canForwardPart, canRewindPart, getPartMeasureCounter, isPartPlaybackActive } from '@/app/features/sheets/pages/song-sheet/song-sheet.helpers';

@Component({
  selector: 'app-song-part-transport',
  templateUrl: './song-part-transport.component.html',
  styleUrl: './song-part-transport.component.scss'
})
export class SongPartTransportComponent {
  readonly state = input.required<SongSheetPlaybackState>();
  readonly partId = input.required<string>();
  readonly occurrenceId = input<string>();
  readonly measureCount = input.required<number>();
  readonly playable = input.required<boolean>();
  readonly play = output<void>();
  readonly pause = output<void>();
  readonly resume = output<void>();
  readonly previous = output<void>();
  readonly next = output<void>();
  readonly stop = output<void>();

  private readonly media = inject(HtmlAudioPlaybackService);
  readonly active = computed(() => isPartPlaybackActive(this.state(), this.partId()) &&
    (!this.occurrenceId() || this.state().occurrenceId === this.occurrenceId()));
  // Ready/error are mapped to paused by the score clock. Leave their recovery
  // actions to the existing shell/modal media controls, which own that session.
  readonly mediaStatus = computed(() => this.active()
    ? this.media.notices().find(notice => notice.channel === 'finite:song-part-playback')?.status
    : undefined);
  readonly preparing = computed(() => this.active() && this.state().status === 'preparing');
  readonly needsRecovery = computed(() => this.mediaStatus() === 'ready' || this.mediaStatus() === 'error');
  readonly primaryLabel = computed(() => !this.active() ? 'Play' : this.preparing() ? 'Preparing…'
    : (this.state().status === 'playing' || this.state().status === 'buffering') ? 'Pause' : 'Resume');
  readonly canPrevious = computed(() => this.active() && !this.preparing() && !this.needsRecovery() && canRewindPart(this.state(), this.partId()));
  readonly canNext = computed(() => this.active() && !this.preparing() && !this.needsRecovery() && canForwardPart(this.state(), this.partId()));
  readonly counter = computed(() => getPartMeasureCounter(this.state(), this.partId(), this.measureCount()));
  readonly status = computed(() => !this.active() ? '' : this.preparing() ? 'Preparing…'
    : this.mediaStatus() === 'ready' ? 'Ready to play' : this.mediaStatus() === 'error' ? 'Playback needs attention'
    : this.state().status === 'buffering' ? 'Buffering…' : this.state().status === 'playing' ? 'Playing' : 'Paused');

  toggle(): void {
    if (!this.active()) this.play.emit();
    else if ((this.state().status === 'playing' || this.state().status === 'buffering')) this.pause.emit();
    else this.resume.emit();
  }
}
