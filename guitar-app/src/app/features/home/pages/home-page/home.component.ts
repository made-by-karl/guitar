import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UpdateService } from '@/app/core/services/update.service';

type FeatureEntry = {
  readonly title: string;
  readonly description: string;
  readonly route: string;
  readonly icon: string;
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  protected readonly updateService = inject(UpdateService);

  protected readonly featureEntries: readonly FeatureEntry[] = [
    {
      title: 'Song Sheets',
      description: 'Organize songs, arrangements, and practice notes in one place.',
      route: '/sheets',
      icon: 'music-note-list'
    },
    {
      title: 'Grips',
      description: 'Explore chord shapes and compare fingering options on the fretboard.',
      route: '/grips',
      icon: 'grid-3x3-gap'
    },
    {
      title: 'Playing Patterns',
      description: 'Build and review picking and strumming ideas for your practice sessions.',
      route: '/patterns',
      icon: 'arrow-down-up'
    },
    {
      title: 'Metronome',
      description: 'Keep time with a practice-focused metronome that stays within reach.',
      route: '/metronome',
      icon: 'clock'
    },
    {
      title: 'Tuner',
      description: 'Tune up quickly before you start working on songs or technique.',
      route: '/tuner',
      icon: 'broadcast-pin'
    }
  ];
}
