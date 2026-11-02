import { SongPart, SongPartOccurrence, SongSheet } from './song-sheets.model';

export function getSongArrangement(sheet: Pick<SongSheet, 'parts' | 'arrangement'>): SongPartOccurrence[] {
  return sheet.arrangement ?? sheet.parts.map(part => ({
    id: `occurrence-${part.id}`,
    partId: part.id,
    lyrics: part.lyrics ?? ''
  }));
}

export function migrateSongArrangement(sheet: SongSheet): void {
  sheet.arrangement = getSongArrangement(sheet).map(occurrence => ({ ...occurrence }));
  sheet.parts.forEach(part => { delete part.lyrics; });
}

export function getOccurrenceNumber(arrangement: SongPartOccurrence[], occurrence: SongPartOccurrence): number {
  return arrangement.filter(item => item.partId === occurrence.partId).findIndex(item => item.id === occurrence.id) + 1;
}

export function getOccurrenceHistory(sheet: SongSheet, occurrenceId: string, editedPart?: SongPart): SongPart[] {
  const arrangement = getSongArrangement(sheet);
  const index = arrangement.findIndex(occurrence => occurrence.id === occurrenceId);
  if (index < 0) return [];
  return arrangement.slice(0, index).flatMap(occurrence => {
    const part = editedPart?.id === occurrence.partId ? editedPart : sheet.parts.find(item => item.id === occurrence.partId);
    return part ? [part] : [];
  });
}
