import { defineConfig } from '@playwright/test';
import streaming from './streaming-playback.config';

export default defineConfig({
  ...streaming,
  testMatch: ['media-playback.spec.ts', 'playback-highlighting.spec.ts', 'song-play-view.spec.ts', 'page-playback-controls.spec.ts'],
  outputDir: '../../temp/ux/streaming-playback/regression-results'
});
