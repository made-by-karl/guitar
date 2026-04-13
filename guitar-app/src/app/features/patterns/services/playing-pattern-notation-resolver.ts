import { Grip } from '@/app/features/grips/services/grips/grip.model';
import {
  BaseRelativePickingNote,
  GripRelativePickingNote,
  RelativeLegatoEndpointNote,
  RelativeStrumRange,
  RelativeStringRole
} from '@/app/features/patterns/services/playing-patterns.model';

export function getPlayableStringIndices(grip: Grip | undefined): number[] {
  if (!grip) {
    return [0, 1, 2, 3, 4, 5];
  }

  return grip.strings
    .map((stringValue, index) => stringValue === 'x' ? -1 : index)
    .filter(index => index >= 0);
}

export function resolveRelativeStringIndex(grip: Grip | undefined, role: RelativeStringRole): number {
  const playableStrings = getPlayableStringIndices(grip);
  if (playableStrings.length === 0) {
    return 0;
  }

  switch (role) {
    case 'bass':
      return playableStrings[0];
    case 'second-from-bass':
      return playableStrings[Math.min(1, playableStrings.length - 1)];
    case 'middle':
      return playableStrings[Math.floor((playableStrings.length - 1) / 2)];
    case 'second-from-top':
      return playableStrings[Math.max(0, playableStrings.length - 2)];
    case 'top':
      return playableStrings[playableStrings.length - 1];
  }
}

export function resolveGripNoteFret(grip: Grip | undefined, stringIndex: number): number {
  if (!grip) {
    return 0;
  }

  const stringValue = grip.strings[stringIndex];
  if (!stringValue || stringValue === 'x' || stringValue === 'o') {
    return 0;
  }

  return Math.max(...stringValue.map(value => value.fret));
}

export function resolveBaseNoteFret(grip: Grip | undefined, stringIndex: number): number {
  if (!grip) {
    return 0;
  }

  const stringValue = grip.strings[stringIndex];
  if (!stringValue || stringValue === 'x' || stringValue === 'o') {
    return 0;
  }

  const barreFrets = stringValue
    .filter(value => value.isPartOfBarre)
    .map(value => value.fret);

  return barreFrets.length > 0 ? Math.min(...barreFrets) : 0;
}

export function resolveRelativePickFret(
  grip: Grip | undefined,
  stringIndex: number,
  note: GripRelativePickingNote | BaseRelativePickingNote
): number {
  if (note.anchor === 'base-note') {
    return resolveBaseNoteFret(grip, stringIndex);
  }

  return resolveGripNoteFret(grip, stringIndex) + note.fretOffset;
}

export function resolveRelativeLegatoEndpointFret(
  grip: Grip | undefined,
  stringIndex: number,
  endpoint: RelativeLegatoEndpointNote
): number {
  if (endpoint.anchor === 'base-note') {
    return resolveBaseNoteFret(grip, stringIndex);
  }

  return resolveGripNoteFret(grip, stringIndex) + endpoint.fretOffset;
}

export function resolveRelativeStrumRange(grip: Grip | undefined, range: RelativeStrumRange): number[] {
  const from = resolveRelativeStringIndex(grip, range.from);
  const to = resolveRelativeStringIndex(grip, range.to);
  const start = Math.min(from, to);
  const end = Math.max(from, to);

  return getPlayableStringIndices(grip).filter(index => index >= start && index <= end);
}
