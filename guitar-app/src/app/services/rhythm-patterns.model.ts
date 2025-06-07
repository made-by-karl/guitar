export type RhythmTechnique = 'strum' | 'pick' | 'mute' | 'rest' | 'accent' | 'palm-mute' | 'percussive' | 'hybrid';
export type RhythmDirection = 'D' | 'U' | null;

export interface RhythmStep {
  technique: RhythmTechnique;
  direction?: RhythmDirection;
  strings: number[];
  accent?: boolean;
  palmMute?: boolean;
  percussive?: boolean;
}

export interface RhythmPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  timeSignature: string;
  tempo: number;
  steps: RhythmStep[];
  createdAt: number;
  updatedAt: number;
  isCustom?: boolean;
}
