import { getTimeSignatureParts, TimeSignature } from './time-signature.model';

export function buildMetronomeLabels(timeSignature: TimeSignature, subBeatsEnabled: boolean): string[] {
  const { top, bottom } = getTimeSignatureParts(timeSignature);

  const labels: string[] = [];

  if (bottom === 4) {
    for (let beat = 1; beat <= top; beat++) {
      labels.push(String(beat));
      if (subBeatsEnabled) {
        labels.push('&');
      }
    }
    return labels;
  }

  // bottom === 8
  for (let beat = 1; beat <= top; beat++) {
    labels.push(String(beat));
    if (subBeatsEnabled) {
      labels.push('e');
    }
  }

  return labels;
}

export function isMainBeatLabel(label: string): boolean {
  return /^\d+$/.test(label);
}
