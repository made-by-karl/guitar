import { Injectable, OnDestroy } from '@angular/core';
import { MidiInstruction } from '@/app/core/services/midi.model';
import { normalizePercussionTechnique } from '@/app/core/services/midi-renderer';
import { RenderedAudioService } from '@/app/core/services/rendered-audio.service';
import { HtmlAudioPlaybackService } from '@/app/core/services/html-audio-playback.service';

@Injectable({ providedIn: 'root' })
export class MidiService implements OnDestroy {
  constructor(private rendered: RenderedAudioService, private media: HtmlAudioPlaybackService) {}

  async playSequence(instructions: MidiInstruction[]): Promise<void> {
    if (!instructions.length) return;
    const duration = Math.max(...instructions.map(i => i.time + i.playbackDuration));
    await this.media.play('midi-one-shot', signal => this.rendered.renderInstructions(instructions, duration, signal), { label: 'Audio preview' });
  }

  async playPercussionTechnique(technique: string): Promise<void> {
    const normalized = normalizePercussionTechnique(technique);
    if (!normalized) { console.warn(`Unknown percussion technique: ${technique}`); return; }
    await this.playSequence([{ time: 0, playbackDuration: 0.5, actionDuration: 0.5,
      percussion: { technique: normalized }, velocity: 0.9, technique: 'percussive' }]);
  }

  dispose(): void { this.media.stop('midi-one-shot'); }
  ngOnDestroy(): void { this.media.release('midi-one-shot'); }
}
