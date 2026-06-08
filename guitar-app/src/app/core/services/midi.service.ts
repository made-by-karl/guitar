import { Injectable } from '@angular/core';
import { MidiInstruction } from '@/app/core/services/midi.model';
import {
  MIDI_PLAYBACK_CONFIG,
  normalizePercussionTechnique
} from '@/app/core/services/midi-renderer';
import { RenderedAudioService } from '@/app/core/services/rendered-audio.service';
import { HtmlAudioPlaybackService } from '@/app/core/services/html-audio-playback.service';

@Injectable({
  providedIn: 'root'
})
export class MidiService {
  constructor(
    private renderedAudioService: RenderedAudioService,
    private htmlAudioPlaybackService: HtmlAudioPlaybackService
  ) {}

  /**
   * Play a guitar percussion technique
   */
  async playPercussionTechnique(technique: string): Promise<void> {
    const normalizedTechnique = normalizePercussionTechnique(technique);
    if (!normalizedTechnique) {
      console.warn(`Unknown percussion technique: ${technique}`);
      return;
    }

    const instruction: MidiInstruction = {
      time: 0,
      playbackDuration: MIDI_PLAYBACK_CONFIG.samplers.percussion.manualHitDurationSeconds,
      actionDuration: MIDI_PLAYBACK_CONFIG.samplers.percussion.manualHitDurationSeconds,
      percussion: { technique: normalizedTechnique },
      velocity: 0.9,
      technique: 'percussive'
    };

    const rendered = await this.renderedAudioService.renderInstructions(
      [instruction],
      MIDI_PLAYBACK_CONFIG.samplers.percussion.manualHitDurationSeconds
    );
    await this.htmlAudioPlaybackService.play('midi-one-shot', rendered.url);
  }
}
