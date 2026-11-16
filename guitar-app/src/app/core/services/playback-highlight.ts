/** A resolved notated position, independent of a clock, transport or song model. */
export interface PlaybackHighlight {
  measureIndex: number;
  actionIndex: number;
  status: 'playing' | 'paused';
}

/** Drawing components implement this contract; playback owners supply positions. */
export interface PlaybackHighlightView {
  highlightPlayback(position: PlaybackHighlight | undefined): void;
}
