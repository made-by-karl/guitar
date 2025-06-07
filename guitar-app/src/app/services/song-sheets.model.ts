export interface SongSheetGrip {
  id: string; // unique id for the grip (could be a hash or generated)
  chordName: string;
  grip: any; // structure for the grip (can be GuitarGrip or similar)
}

export interface SongSheet {
  id: string;
  name: string;
  grips: SongSheetGrip[];
  created: number;
  updated: number;
}
