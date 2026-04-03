import { getTimeSignatureParts, TimeSignature } from '@/app/core/music/rhythm/time-signature.model';

export type MetronomeSubdivision = 'none' | '8th' | '16th';

export function getAllowedSubdivisions(timeSignature: TimeSignature): readonly MetronomeSubdivision[] {
  const { bottom } = getTimeSignatureParts(timeSignature);
  return bottom === 4 ? ['none', '8th', '16th'] : ['none', '16th'];
}

export function normalizeSubdivision(
  timeSignature: TimeSignature,
  subdivision: MetronomeSubdivision
): MetronomeSubdivision {
  return getAllowedSubdivisions(timeSignature).includes(subdivision) ? subdivision : 'none';
}

export function buildMetronomeLabels(timeSignature: TimeSignature, subdivision: MetronomeSubdivision): string[] {
  const { top, bottom } = getTimeSignatureParts(timeSignature);

  const labels: string[] = [];

  if (bottom === 4) {
    for (let beat = 1; beat <= top; beat++) {
      labels.push(String(beat));
      if (subdivision === '8th') {
        labels.push('&');
      } else if (subdivision === '16th') {
        labels.push('e', '&', 'a');
      }
    }
    return labels;
  }

  // bottom === 8
  for (let beat = 1; beat <= top; beat++) {
    labels.push(String(beat));
    if (subdivision === '16th') {
      labels.push('e');
    }
  }

  return labels;
}

export function isMainBeatLabel(label: string): boolean {
  return /^\d+$/.test(label);
}
