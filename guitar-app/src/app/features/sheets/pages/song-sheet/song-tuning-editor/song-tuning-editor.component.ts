import { Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BpmSelectorComponent } from '@/app/core/ui/bpm-selector/bpm-selector.component';
import { Note, Semitone } from '@/app/core/music/semitones';

@Component({
  selector: 'app-song-tuning-editor',
  standalone: true,
  imports: [FormsModule, BpmSelectorComponent],
  templateUrl: './song-tuning-editor.component.html',
  styleUrl: './song-tuning-editor.component.scss'
})
export class SongTuningEditorComponent {
  readonly tuning = input.required<Note[]>();
  readonly semitones = input.required<Semitone[]>();
  readonly octaves = input.required<number[]>();
  readonly capodaster = model.required<number>();
  readonly tempo = model.required<number>();

  readonly save = output<void>();
  readonly cancel = output<void>();
}
