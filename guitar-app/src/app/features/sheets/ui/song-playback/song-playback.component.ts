import { afterRenderEffect, Component, computed, ElementRef, inject, input, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MediaPlaybackControlsComponent } from '@/app/core/ui/media-playback-controls/media-playback-controls.component';
import { PlayingActionsComponent } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { SongPartPlaybackService, SongPlaybackSource } from '@/app/features/sheets/services/song-part-playback.service';

/** Read-only notation from the musical snapshot scheduled for this run. */
@Component({
  selector: 'app-song-playback',
  imports: [PlayingActionsComponent, MediaPlaybackControlsComponent],
  templateUrl: './song-playback.component.html',
  styleUrl: './song-playback.component.scss'
})
export class SongPlaybackComponent {
  readonly source = input.required<SongPlaybackSource>();
  readonly playback = inject(SongPartPlaybackService);
  readonly state = toSignal(this.playback.state$, { initialValue: this.playback.getSnapshot() });
  readonly active = computed(() => this.state().type !== 'none' && this.state().source === this.source());
  readonly row = computed(() => this.active() ? this.state().presentation : undefined);
  readonly measures = computed(() => {
    const row = this.row();
    return row ? [row.part.measures[row.measureIndex].measure] : [];
  });
  readonly contexts = computed(() => this.measures().map(measure => ({ actionGrips: measure.actionGrips })));
  readonly history = computed(() => this.row()?.precedingMeasures.map(measure => ({ measure, context: { actionGrips: measure.actionGrips } })) ?? []);
  readonly position = computed(() => {
    const state = this.state();
    return this.active() && state.actionIndex !== undefined && (state.status === 'playing' || state.status === 'paused')
      ? { measureIndex: 0, actionIndex: state.actionIndex, status: state.status } : undefined;
  });
  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');

  toggle(): void {
    if (this.state().status === 'preparing') return;
    if (this.state().status === 'playing') this.playback.pause();
    else this.playback.resume();
  }

  constructor() {
    let boundary = '';
    afterRenderEffect(() => {
      const row = this.row();
      const next = row ? `${this.state().runId}:${row.occurrenceId}:${row.measureId}` : '';
      if (next === boundary) return;
      boundary = next;
      const pane = this.pane()?.nativeElement;
      if (!pane) return;
      const bounds = pane.getBoundingClientRect();
      if (bounds.height && (bounds.top < 0 || bounds.bottom > window.innerHeight)) {
        pane.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
    });
  }
}
