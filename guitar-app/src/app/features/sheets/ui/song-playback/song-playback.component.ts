import { Component, computed, input } from '@angular/core';
import { PlaybackHighlightDirective } from '@/app/core/ui/playback-highlight/playback-highlight.directive';
import { PlayingActionsComponent } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { SongPlaybackSource, SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';
import { songPlaybackHighlight } from '@/app/features/sheets/services/song-playback-position';

/** A continuous drawing of the scheduled snapshot; timing is owned by playback. */
@Component({
  selector: 'app-song-playback',
  imports: [PlayingActionsComponent, PlaybackHighlightDirective],
  templateUrl: './song-playback.component.html',
  styleUrl: './song-playback.component.scss'
})
export class SongPlaybackComponent {
  readonly source = input.required<SongPlaybackSource>();
  readonly state = input.required<SongSheetPlaybackState>();
  readonly active = computed(() => this.state().type !== 'none' && this.state().source === this.source());
  readonly row = computed(() => this.active() ? this.state().presentation : undefined);
  readonly sequence = computed(() => this.active() ? this.state().sequence : undefined);
  readonly measures = computed(() => this.sequence()?.measures ?? []);
  readonly contexts = computed(() => this.measures().map(measure => ({ actionGrips: measure.actionGrips })));
  readonly history = computed(() => this.sequence()?.precedingMeasures.map(measure => ({ measure, context: { actionGrips: measure.actionGrips } })) ?? []);
  readonly position = computed(() => songPlaybackHighlight(this.state(), { source: this.source() }));
}
