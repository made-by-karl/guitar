import { DOCUMENT } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { Component, ElementRef, HostListener, OnDestroy, afterRenderEffect, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MODAL_DATA, MODAL_REF, ModalComponent, ModalDataComponent, ModalRef } from '@/app/core/services/modal.service';
import { GripDiagramComponent } from '@/app/core/ui/grip-diagram/grip-diagram.component';
import { MediaPlaybackControlsComponent } from '@/app/core/ui/media-playback-controls/media-playback-controls.component';
import { PlaybackHighlightDirective } from '@/app/core/ui/playback-highlight/playback-highlight.directive';
import { PlayingActionsComponent } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { PlayViewGrip, buildSongPlayViewTimeline, projectSongPlayView } from '@/app/features/sheets/services/song-play-view-state';
import { songPlaybackHighlight } from '@/app/features/sheets/services/song-playback-position';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';
import { buildSongPlayViewProgress, songPlayViewProgress } from '@/app/features/sheets/services/song-play-view-progress';

export interface SongPlayViewData { sheet: SongSheet; }

@Component({
  selector: 'app-song-play-view',
  imports: [A11yModule, GripDiagramComponent, MediaPlaybackControlsComponent, PlayingActionsComponent, PlaybackHighlightDirective],
  templateUrl: './song-play-view.component.html',
  styleUrl: './song-play-view.component.scss'
})
export class SongPlayViewComponent implements ModalComponent<void>, ModalDataComponent<SongPlayViewData>, OnDestroy {
  readonly modalRef = inject<ModalRef<void>>(MODAL_REF);
  readonly data = inject<SongPlayViewData>(MODAL_DATA);
  private readonly document = inject(DOCUMENT);
  private readonly background = this.document.querySelector('app-root');
  private readonly wasInert = this.background?.hasAttribute('inert');
  private readonly notationFrame = viewChild<ElementRef<HTMLElement>>('notationFrame');
  readonly playback = inject(SongPartPlaybackService);
  readonly state = toSignal(this.playback.state$, { initialValue: this.playback.getSnapshot() });
  private readonly clock = toSignal(this.playback.clock$, { initialValue: { currentTime: 0, runId: undefined } });
  readonly attached = computed(() => this.state().songSnapshot?.id === this.data.sheet.id && (this.state().type === 'song' || this.state().ended));
  readonly sheet = computed(() => this.attached() ? this.state().songSnapshot! : this.data.sheet);
  readonly timeline = computed(() => buildSongPlayViewTimeline(this.sheet()));
  readonly projection = computed(() => {
    const state = this.state();
    const index = this.attached() ? state.currentMeasureIndex ?? 0 : 0;
    const action = !this.attached() ? 0 : state.ended ? (this.timeline().measures[index]?.measure.actions.length ?? 1) - 1 : state.actionIndex ?? 0;
    return projectSongPlayView(this.timeline(), index, action);
  });
  readonly row = computed(() => this.projection().row);
  readonly occurrence = computed(() => this.row() ? [this.row()!.occurrence] : []);
  private readonly sequence = computed(() => this.attached() ? this.state().sequence : undefined);
  readonly measures = computed(() => this.sequence()?.measures ?? this.timeline().measures.map(row => row.measure));
  readonly contexts = computed(() => this.measures().map(measure => ({ actionGrips: measure.actionGrips })));
  readonly history = computed(() => this.sequence()?.precedingMeasures.map(measure => ({ measure, context: { actionGrips: measure.actionGrips } })) ?? []);
  readonly position = computed(() => this.attached() ? songPlaybackHighlight(this.state(), { source: 'song' }) : undefined);
  private readonly timing = computed(() => this.attached() ? this.state().sequence?.timing : undefined);
  private readonly progressTimeline = computed(() => buildSongPlayViewProgress(this.timeline(), this.timing()));
  readonly progress = computed(() => {
    const state = this.state();
    if (this.attached() && state.ended) return { gripPercent: undefined, afterNextPercent: undefined, partPercent: 100, handoff: false };
    if (!this.attached() || !this.position() || this.clock().runId !== state.runId) {
      return { gripPercent: this.projection().upcoming.length ? 0 : undefined,
        afterNextPercent: this.projection().upcoming.length > 1 ? 0 : undefined, partPercent: 0, handoff: false };
    }
    const progress = songPlayViewProgress(this.progressTimeline(), this.row()?.occurrence.id ?? '', this.clock().currentTime);
    return { ...progress, handoff: state.status === 'playing' && progress.handoff };
  });
  readonly status = computed(() => !this.attached() ? 'Ready to play' : this.state().ended ? 'End of song'
    : this.state().status === 'preparing' ? 'Preparing…' : this.state().status === 'buffering' ? 'Buffering…' : this.state().status === 'playing' ? 'Playing'
    : this.position() ? 'Paused' : 'Ready to play');
  readonly canPlay = computed(() => this.playback.canPlaySong(this.sheet()));
  readonly primaryLabel = computed(() => !this.attached() || this.state().ended ? 'Play'
    : this.state().status === 'preparing' ? 'Preparing…'
    : (this.state().status === 'playing' || this.state().status === 'buffering') ? 'Pause' : 'Resume');
  readonly tuning = computed(() => this.sheet().tuning.map(note => note.semitone).join(' · '));
  readonly cards = computed<readonly { title: string; assignment: PlayViewGrip | undefined }[]>(() => [
    { title: 'Current grip', assignment: this.projection().current },
    { title: 'Next', assignment: this.projection().upcoming[0] },
    { title: 'After next', assignment: this.projection().upcoming[1] }
  ]);

  constructor() {
    // The overlay is outside app-root. CDK contains keyboard focus; inert also
    // excludes covered controls from programmatic focus and assistive navigation.
    this.background?.setAttribute('inert', '');
    afterRenderEffect(() => {
      // Stop returns to the beginning even if this same wide measure was scrolled.
      if (this.status() !== 'Ready to play') return;
      const scroller = this.notationFrame()?.nativeElement.querySelector('.notation-measure');
      if (scroller) scroller.scrollLeft = 0;
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  exit(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.modalRef.close();
  }

  async togglePlayback(): Promise<void> {
    if (this.attached() && this.state().type === 'song') {
      if (this.state().status === 'paused') this.playback.resumeSong();
      else this.playback.pauseSong();
    } else await this.playback.playSong(this.sheet());
  }

  ngOnDestroy(): void {
    if (!this.wasInert) this.background?.removeAttribute('inert');
    // Presentation-only teardown: the arrangement owns the transport.
  }
}
