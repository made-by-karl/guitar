import { Injectable } from "@angular/core";
import { hasSeventhChord, isAlteredChord, isDiminishedChord, isMajor7Chord } from "@/app/common/modifiers";
import { getIntervalSemitones, getNoteMidi, note, Note, Semitone } from "@/app/common/semitones";
import { FretboardService } from "@/app/services/fretboard.service";
import type { ExtendedChord } from '@/app/services/chords/chord.service';
import { TunedGrip, String } from '@/app/services/grips/grip.model';

const MIDI_A2 = getNoteMidi(note('A', 2));
const MIDI_E3 = getNoteMidi(note('E', 3));

@Injectable({
  providedIn: 'root'
})
export class GripGeneratorService {
  constructor(private fretboard: FretboardService) {}

  generateGrips(chord: ExtendedChord, options: GripGeneratorOptions = {}): TunedGrip[] {
    const config = this.parseOptions(options);
    this.validateFretRange(config.minFretToConsider, config.maxFretToConsider);

    const context = this.initializeGenerationContext(chord, config);
    
    for (let fretWindowBase = config.minFretToConsider; fretWindowBase <= config.maxFretToConsider; fretWindowBase++) {
      this.generateGripsForFretWindow(fretWindowBase, chord, config, context);
    }

    return context.grips;
  }

  private parseOptions(options: GripGeneratorOptions): GripGenerationConfig {
    return {
      minFretToConsider: options.minFretToConsider ?? 1,
      maxFretToConsider: options.maxFretToConsider ?? 12,
      minimalPlayableStrings: options.minimalPlayableStrings ?? 3,
      allowBarree: options.allowBarree ?? true,
      allowInversions: options.allowInversions ?? false,
      allowIncompleteChords: options.allowIncompleteChords ?? false,
      allowMutedStringsInside: options.allowMutedStringsInside ?? false,
      allowDuplicateNotes: options.allowDuplicateNotes ?? false,
      dissonanceProfile: options.dissonanceProfile ?? 'neutral'
    };
  }

  private validateFretRange(minFret: number, maxFret: number): void {
    if (minFret < 1 || maxFret < minFret) {
      throw new Error('Invalid fret range');
    }
  }

  private initializeGenerationContext(chord: ExtendedChord, config: GripGenerationConfig): GripGenerationContext {
    const guitarConfig = this.fretboard.getGuitarFretboardConfig();
    const fretboardMatrix = this.fretboard.getFretboard(guitarConfig.tuning, config.maxFretToConsider);
    const fingers = this.fingerConfiguration();
    const expectedNotes = [...chord.notes, ...((chord.bass) ? [chord.bass] : [])];

    return {
      grips: [],
      fretboardMatrix,
      fingers,
      expectedNotes
    };
  }

  private generateGripsForFretWindow(
    fretWindowBase: number,
    chord: ExtendedChord,
    config: GripGenerationConfig,
    context: GripGenerationContext
  ): void {
    const fretConfiguration = this.fretConfiguration(fretWindowBase);
    const fretWindowEnd = Math.min(fretWindowBase + fretConfiguration.maxSpan, config.maxFretToConsider + 1);
    const playableNotes = context.fretboardMatrix.slice(fretWindowBase, fretWindowEnd);

    const candidatePositions = this.getCandidatePositions(playableNotes, fretWindowBase, context.expectedNotes);
    if (candidatePositions.size === 0) {
      return; // No candidates for this fret window
    }

    const fingerPlacements = this.calculateFingerPlacements(candidatePositions);
    const gripPlacements = this.combineFingerPlacements(fingerPlacements, context.fingers);

    this.processGripPlacements(gripPlacements, chord, config, context);
  }

  private calculateFingerPlacements(candidatePositions: Map<number, number[]>): Map<number, FingerPlacement[]> {
    const fingerPlacements: Map<number, FingerPlacement[]> = new Map();
    
    candidatePositions.forEach((strings, fret) => {
      const placements: FingerPlacement[] = [];
      
      // Add barree option if multiple strings on same fret
      if (strings.length > 1) {
        const barree: number[] = [];
        for (let i = 5; i >= Math.min(...strings); i--) {
          barree.push(i);
        }
        placements.push({ fret, strings: barree });
      }

      // Add individual finger placements
      strings.forEach(string => {
        placements.push({ fret, strings: [string] });
      });

      if (placements.length > 0) {
        fingerPlacements.set(fret, placements);
      }
    });

    return fingerPlacements;
  }

  private combineFingerPlacements(fingerPlacements: Map<number, FingerPlacement[]>, fingers: Finger[]): FingerPlacement[][] {
    const gripPlacements: FingerPlacement[][] = [];

    this.sorted(fingerPlacements).forEach(([fret, placements]) => {
      const bareePlacements = placements.filter(p => p.strings.length > 1);
      const singlePlacements = placements.filter(p => p.strings.length === 1);
      const fretPlacements = [
        ...bareePlacements.map(p => [p]),
        ...this.combineElements(singlePlacements)
      ];

      if (gripPlacements.length === 0) {
        gripPlacements.push(...fretPlacements);
        return;
      }

      const combinedPlacements = this.combineArrays(gripPlacements, fretPlacements, (a, p) => [...a, ...p])
        .filter(combination => this.isValidFingerPlacementCombination(combination, fingers));

      gripPlacements.push(...combinedPlacements);
    });

    return gripPlacements;
  }

  private isValidFingerPlacementCombination(placements: FingerPlacement[], fingers: Finger[]): boolean {
    if (placements.length > fingers.length) {
      return false; // Too many fingers needed
    }

    const singles = placements.filter(p => p.strings.length === 1);
    const barrees = placements.filter(p => p.strings.length > 1);

    if (this.hasDuplicateSingleStrings(singles)) {
      return false;
    }

    if (this.hasBarreeHidingSingleString(barrees, singles)) {
      return false;
    }

    if (this.hasBarreeHidingBarree(barrees)) {
      return false;
    }

    if (this.hasBarreeHiddenBySingleFingers(barrees, singles)) {
      return false;
    }

    return true;
  }

  private hasDuplicateSingleStrings(singles: FingerPlacement[]): boolean {
    const strings = singles.map(p => p.strings[0]);
    return new Set(strings).size !== strings.length;
  }

  private hasBarreeHidingSingleString(barrees: FingerPlacement[], singles: FingerPlacement[]): boolean {
    for (const barree of barrees) {
      for (const single of singles) {
        if (barree.fret > single.fret && barree.strings.includes(single.strings[0])) {
          return true;
        }
      }
    }
    return false;
  }

  private hasBarreeHidingBarree(barrees: FingerPlacement[]): boolean {
    for (const barree of barrees) {
      for (const other of barrees) {
        if (barree !== other && barree.fret > other.fret && 
            other.strings.every(s => barree.strings.includes(s))) {
          return true;
        }
      }
    }
    return false;
  }

  private hasBarreeHiddenBySingleFingers(barrees: FingerPlacement[], singles: FingerPlacement[]): boolean {
    for (const barree of barrees) {
      const singleFingers = singles
        .filter(s => s.fret > barree.fret)
        .map(s => s.strings[0]);

      if (barree.strings.every(s => singleFingers.includes(s))) {
        return true;
      }
    }
    return false;
  }

  private processGripPlacements(
    gripPlacements: FingerPlacement[][],
    chord: ExtendedChord,
    config: GripGenerationConfig,
    context: GripGenerationContext
  ): void {
    gripPlacements.forEach(placements => {
      const strings = this.buildStringsFromPlacements(placements);
      let notes = this.getNotesForGrip(strings, context.fretboardMatrix);

      this.muteUnexpectedNotes(strings, notes, context.expectedNotes);
      
      if (!config.allowMutedStringsInside) {
        this.removeMutedStringsInside(strings, notes);
      }

      if (chord.bass !== undefined) {
        this.tryAddGripWithBassNote(strings, notes, chord, config, context);
      } else {
        this.tryAddGripWithRootNote(strings, notes, chord, config, context);
      }
    });
  }

  private buildStringsFromPlacements(placements: FingerPlacement[]): String[] {
    const strings: String[] = Array(6).fill('o');
    
    placements.forEach(placement => {
      const isBarree = placement.strings.length > 1;
      placement.strings.forEach(stringIndex => {
        if (strings[stringIndex] === 'o') {
          strings[stringIndex] = [];
        }
        if (Array.isArray(strings[stringIndex])) {
          strings[stringIndex].push({ fret: placement.fret, isPartOfBarree: isBarree });
        }
      });
    });

    return strings;
  }

  private muteUnexpectedNotes(strings: String[], notes: (Note | null)[], expectedNotes: Semitone[]): void {
    notes.forEach((note, index) => {
      if (note === null || !expectedNotes.includes(note.semitone)) {
        strings[index] = 'x';
        notes[index] = null;
      }
    });
  }

  private removeMutedStringsInside(strings: String[], notes: (Note | null)[]): void {
    strings.forEach((string, index) => {
      if (string !== 'x') return;

      const stringsBefore = strings.slice(0, index).filter(s => s !== 'x').length;
      const stringsAfter = strings.slice(index + 1).filter(s => s !== 'x').length;

      if (stringsBefore < stringsAfter) {
        this.muteStringsBefore(strings, notes, index);
      } else {
        this.muteStringsAfter(strings, notes, index);
      }
    });
  }

  private muteStringsBefore(strings: String[], notes: (Note | null)[], index: number): void {
    for (let i = 0; i < index; i++) {
      if (strings[i] !== 'x') {
        strings[i] = 'x';
        notes[i] = null;
      }
    }
  }

  private muteStringsAfter(strings: String[], notes: (Note | null)[], index: number): void {
    for (let i = index + 1; i < strings.length; i++) {
      if (strings[i] !== 'x') {
        strings[i] = 'x';
        notes[i] = null;
      }
    }
  }

  private tryAddGripWithBassNote(
    strings: String[],
    notes: (Note | null)[],
    chord: ExtendedChord,
    config: GripGenerationConfig,
    context: GripGenerationContext
  ): void {
    const bassIndex = notes.findIndex(n => n !== null && n.semitone === chord.bass);
    if (bassIndex === -1) {
      return; // No bass note played, skip this grip
    }

    if (bassIndex > 0) {
      this.muteStringsBefore(strings, notes, bassIndex);
    }

    this.tryAddGrip(strings, notes, chord, config, context);
  }

  private tryAddGripWithRootNote(
    strings: String[],
    notes: (Note | null)[],
    chord: ExtendedChord,
    config: GripGenerationConfig,
    context: GripGenerationContext
  ): void {
    const rootIndex = notes.findIndex(n => n !== null && n.semitone === chord.root);
    
    // If root is not the lowest note, create a root position version
    if (rootIndex > 0) {
      const clonedStrings = [...strings];
      const clonedNotes = [...notes];
      this.muteStringsBefore(clonedStrings, clonedNotes, rootIndex);
      this.tryAddGrip(clonedStrings, clonedNotes, chord, config, context);
    }

    // Try adding the original grip
    this.tryAddGrip(strings, notes, chord, config, context);
  }

  private tryAddGrip(
    strings: String[],
    notes: (Note | null)[],
    chord: ExtendedChord,
    config: GripGenerationConfig,
    context: GripGenerationContext
  ): boolean {
    if (!this.isValidGrip(strings, notes, chord, config, context)) {
      return false;
    }

    const grip = this.createGrip(strings, notes, chord);
    const addResult = this.addGripToCollection(grip, context.grips);
    
    return addResult;
  }

  private isValidGrip(
    strings: String[],
    notes: (Note | null)[],
    chord: ExtendedChord,
    config: GripGenerationConfig,
    context: GripGenerationContext
  ): boolean {
    if (strings.filter(s => s !== 'x').length < config.minimalPlayableStrings) {
      return false; // Not enough strings
    }

    if (!config.allowBarree && strings.some(s => Array.isArray(s) && s.some(x => x.isPartOfBarree))) {
      return false; // Barree not allowed
    }

    const expectedNotes = context.expectedNotes;
    const playedSemitones = notes.map(n => n?.semitone).filter(s => s !== undefined);
    if (!config.allowIncompleteChords && !expectedNotes.every(e => playedSemitones.includes(e))) {
      return false; // Incomplete chord
    }

    if (!config.allowDuplicateNotes && this.hasDuplicateNotes(notes)) {
      return false;
    }

    const inversion = this.determineInversion(chord, notes);
    if (inversion && (!config.allowInversions && inversion !== 'root')) {
      return false; // Inversions not allowed
    }

    if (this.isDissonant(chord, notes, context, config.dissonanceProfile)) {
      return false;
    }

    return true;
  }

  private hasDuplicateNotes(notes: (Note | null)[]): boolean {
    const noteStrings = notes.filter(n => n !== null).map(n => n!.semitone + n!.octave);
    return new Set(noteStrings).size !== noteStrings.length;
  }

  private createGrip(strings: String[], notes: (Note | null)[], chord: ExtendedChord): TunedGrip {
    return {
      strings,
      notes: notes.map(n => n ? (n.semitone + n.octave) : null),
      inversion: this.determineInversion(chord, notes)
    };
  }

  private isBarreeGrip(grip: TunedGrip): boolean {
    return grip.strings.some(s => Array.isArray(s) && s.some(x => x.isPartOfBarree));
  }

  private addGripToCollection(grip: TunedGrip, grips: TunedGrip[]): boolean {
    const gripRootIndex = grip.strings.findIndex(s => s !== 'x');
    const isBarree = this.isBarreeGrip(grip);

    for (let i = 0; i < grips.length; i++) {
      const otherGrip = grips[i];
      const otherIsBarree = this.isBarreeGrip(otherGrip);
      const comparison = this.compareGrips(grip, otherGrip, gripRootIndex);

      // Handle matches
      if (comparison === 'match') {
        if (isBarree && !otherIsBarree) {
          return false; // Keep existing non-barree, reject new barree
        } else if (!isBarree && otherIsBarree) {
          grips[i] = grip; // Replace existing barree with new non-barree
          return true;
        } else {
          return false; // Both same type, grip already exists
        }
      }

      // Handle subsets
      if (comparison === 'subset') {
        if (isBarree === otherIsBarree) {
          return false; // Same type: new grip is subset, reject it
        } else if (!isBarree && otherIsBarree) {
          // New non-barree is subset of existing barree: add it anyway
          continue; // Keep looking for other conflicts
        } else {
          // New barree is subset of existing non-barree: reject it
          return false;
        }
      }

      // Handle supersets
      if (comparison === 'superset') {
        if (isBarree === otherIsBarree) {
          grips[i] = grip; // Same type: replace with superset
          return true;
        } else if (!isBarree && otherIsBarree) {
          grips[i] = grip; // Replace barree with non-barree superset
          return true;
        } else {
          // New barree is superset of existing non-barree: keep non-barree
          return false;
        }
      }
    }

    grips.push(grip);
    return true;
  }

  private compareGrips(
    grip: TunedGrip,
    otherGrip: TunedGrip,
    gripRootIndex: number
  ): 'match' | 'subset' | 'superset' | 'conflict' {
    const otherRootIndex = otherGrip.strings.findIndex(s => s !== 'x');
    let diffState: 'superset' | 'subset' | 'match' | 'conflict' | undefined = undefined;

    for (let i = 0; i < grip.strings.length; i++) {
      const result = this.compareStringAtIndex(
        grip.strings[i],
        otherGrip.strings[i],
        diffState,
        i,
        gripRootIndex,
        otherRootIndex,
        grip.notes,
        otherGrip.notes
      );

      if (result === 'conflict') {
        return 'conflict';
      }

      diffState = result;
    }

    return diffState ?? 'match';
  }

  private compareStringAtIndex(
    gripString: String,
    otherString: String,
    currentState: 'superset' | 'subset' | 'match' | 'conflict' | undefined,
    index: number,
    gripRootIndex: number,
    otherRootIndex: number,
    gripNotes: (string | null)[],
    otherNotes: (string | null)[]
  ): 'superset' | 'subset' | 'match' | 'conflict' {
    if ((gripString === 'o' && otherString === 'o') || (gripString === 'x' && otherString === 'x')) {
      return currentState ?? 'match';
    }

    if (Array.isArray(gripString) && Array.isArray(otherString)) {
      const gripFret = Math.max(...gripString.map(s => s.fret));
      const otherFret = Math.max(...otherString.map(s => s.fret));
      return gripFret === otherFret ? (currentState ?? 'match') : 'conflict';
    }

    if (gripString === 'x') {
      if (index < gripRootIndex && !this.rootsMatch(gripNotes[gripRootIndex], otherNotes[otherRootIndex])) {
        return 'conflict';
      }
      return (!currentState || currentState === 'match' || currentState === 'subset') ? 'subset' : 'conflict';
    }

    if (otherString === 'x') {
      if (index < otherRootIndex && !this.rootsMatch(gripNotes[gripRootIndex], otherNotes[otherRootIndex])) {
        return 'conflict';
      }
      return (!currentState || currentState === 'match' || currentState === 'superset') ? 'superset' : 'conflict';
    }

    return 'conflict';
  }

  private rootsMatch(note1: string | null, note2: string | null): boolean {
    if (!note1 || !note2) return false;
    return note1.substring(0, 1) === note2.substring(0, 1);
  }

  private getNotesForGrip(strings: String[], fretboardMatrix: Note[][]): (Note | null)[] {
    const notes: (Note | null)[] = [];
    strings.forEach((string, stringIndex) => {
      if (string === 'x') {
        notes.push(null); // Muted string
      } else if (string === 'o') {
        const note = fretboardMatrix[0][stringIndex];
        notes.push(note); // Open string
      } else if (Array.isArray(string)) {
        const maxFret = Math.max(...string.map(s => s.fret));
        const note = fretboardMatrix[maxFret][stringIndex];
        notes.push(note); // Pushed string
      }
    });
    return notes;
  }

  private getCandidatePositions(fretboardNotes: Note[][], currentFret: number, notes: string[]): Map<number, number[]> {
      const candidatePositions: Map<number, number[]> = new Map();
      fretboardNotes.forEach((fretNotes, windowIndex) => {
        const fretIndex = currentFret + windowIndex;

        fretNotes.forEach((note, stringIndex) => {
          if (!notes.includes(note.semitone)) return; // Only consider expected notes

          if (!candidatePositions.has(fretIndex)) {
            candidatePositions.set(fretIndex, []);
          }
          candidatePositions.get(fretIndex)?.push(stringIndex);
        })

        if (!candidatePositions.has(currentFret)) {
            return; // Skip if no candidates for the current fret
        }
      })
      return candidatePositions;     
    }

  private combineElements<T>(array: T[]): T[][] {
    const result: T[][] = [];

    const generate = (current: T[], remaining: T[]) => {
      if (current.length > 0) {
        result.push(current);
      }

      for (let i = 0; i < remaining.length; i++) {
        generate([...current, remaining[i]], remaining.slice(i + 1));
      }
    };

    generate([], array);
    return result;
  }

  private combineArrays<T, U, V>(array1: T[], array2: U[], combineFn: (v1: T, v2: U) => V): V[] {
    const result: V[] = [];

    array1.forEach(comb1 => {
      array2.forEach(comb2 => {
        result.push(combineFn(comb1, comb2));
      });
    });

    return result;
  }

  private sorted<K, V>(map : Map<K, V>, compareFn?: ((a: K, b: K) => number)): [K, V][] {
    return Array.from(map.keys()).sort(compareFn).map((key) => [key, map.get(key)] as [K, V]);
  }
  
  private fingerConfiguration(): Finger[] {
    return [
      { finger: 'index', strings: [0, 1, 2, 3, 4, 5], barreeRange: 5 },
      { finger: 'middle', strings: [0, 1, 2, 3, 4, 5], barreeRange: 5 },
      { finger: 'ring', strings: [0, 1, 2, 3, 4, 5], barreeRange: 5 },
      { finger: 'pinky', strings: [0, 1, 2, 3, 4, 5], barreeRange: 3 }
      // { finger: 'thumb', strings: [5], barree: [] }
    ];
  }

  private fretConfiguration(fret: number): { maxSpan: number; maxFingers: number } {
    return { maxSpan: 3, maxFingers: 3 }
  }

  private isDissonant(
    chord: ExtendedChord, notes: (Note | null)[],
    context: GripGenerationContext,
    profile: DissonanceProfile = 'neutral'
  ): boolean {
    const score = this.calculateDissonanceScore(chord, notes);
    const threshold = this.adaptiveDissonanceThreshold(chord, notes, context, profile);

    return score >= threshold;
  }

  private adaptiveDissonanceThreshold(
    chord: ExtendedChord,
    notes: (Note | null)[],
    context: GripGenerationContext,
    profile: DissonanceProfile = 'neutral'
  ): number {
    let threshold = this.baseThreshold(chord);

    const played = notes.filter(Boolean) as Note[];
    const bass = played[0];
    if (!bass) return threshold;
    const bassMidi = getNoteMidi(bass);

    // Register
    if (bassMidi < MIDI_A2) threshold -= 2;
    else if (bassMidi > MIDI_E3) threshold += 1;

    // Voicing analysis
    const tuning = context.fretboardMatrix[0];
    const openStrings = notes.filter((n, i) => {
      if (!n || i > 3) return false;
      const open = tuning[i];
      return n.semitone === open.semitone && n.octave === open.octave;
    }).length;

    if (openStrings >= 2) threshold -= 1;

    // Dissonance profile (generic tolerance control)
    if (profile === 'harmonic') threshold -= 1;
    if (profile === 'dissonant') threshold += 2;

    return threshold;
  }

  private baseThreshold(chord: ExtendedChord): number {
    if (isAlteredChord(chord)) return 12;
    if (isDiminishedChord(chord)) return 10;
    if (isMajor7Chord(chord)) return 9;
    if (hasSeventhChord(chord)) return 8;
    return 6;
  }

  private intervalDissonanceWeight(interval: number): number {
    switch (interval) {
      case 1:  return 5; // minor 2nd
      case 2:  return 4; // major 2nd
      case 3:  return 1; // minor 3rd (mild)
      case 6:  return 4; // tritone
      case 10: return 2; // minor 7th
      case 11: return 4; // major 7th
      default: return 0;
    }
  }

  private calculateDissonanceScore(
    chord: ExtendedChord,
    notes: (Note | null)[]
  ): number {
    const played = notes
      .map((n, i) => n ? { note: n, stringIndex: i } : null)
      .filter(Boolean) as { note: Note; stringIndex: number }[];

    if (played.length < 3) return 0;

    const bass = played[0].note;
    const bassMidi = getNoteMidi(bass);
    const bassIntervals: number[] = [];

    let score = 0;

    for (let i = 1; i < played.length; i++) {
      const { note, stringIndex } = played[i];
      const noteMidi = getNoteMidi(note);
      const distance = noteMidi - bassMidi;

      const interval =
        (distance % 12 + 12) % 12;

      bassIntervals.push(interval);

      let weight = this.intervalDissonanceWeight(interval);

      // Register-dependent amplification
      if (distance < 12) {
        weight *= 1.5;
      }

      // Lower strings amplify dissonance
      if (stringIndex <= 2) {
        weight *= 1.5;
      }

      // Chord type softens/permits certain tensions
      if (hasSeventhChord(chord) && interval === 10) {
        weight *= 0.5;
      }

      // Dominant-specific low-register penalty
      if (interval === 10) { // minor 7th
        // If within one octave AND close to the bass
        if (distance < 10) {
          score += 3;
        }
      }

      score += weight;
    }

    // Double 7ths / stacked tensions
    const seventhCount = bassIntervals.filter(i => i === 10 || i === 11).length;

    if (seventhCount > 1) {
      score += 3; // a doubled 7th makes dominant voicings sound very rough
    }

    // Additional voice-to-voice dissonance
    for (let i = 0; i < played.length; i++) {
      for (let j = i + 1; j < played.length; j++) {
        const interval =
          Math.abs(getNoteMidi(played[i].note) - getNoteMidi(played[j].note)) % 12;

        if (interval === 1 || interval === 2) {
          score += 3; // very noticeable
        }
      }
    }

    return Math.round(score);
  }

  private determineInversion(chord: ExtendedChord, notes: (Note | null)[]): 'root' | '1st' | '2nd' | 'other' | undefined {
      const playedNotes = notes.filter(n => n !== null).map(n => n.semitone);
      if (playedNotes.length === 0) return undefined;

      let baseNote: Semitone;
      if (chord.bass === undefined || chord.bass === chord.root) {
        baseNote = playedNotes[0];
      } else {
        baseNote = playedNotes[1];
      }

      if (baseNote === chord.root) return 'root';

      const index = chord.notes.indexOf(baseNote);
      if (index === 1) return '1st';
      if (index === 2) return '2nd';
      if (index > 2) return 'other'; // 3rd inversion or higher
      
      return undefined;
    }
}

type Finger = {
  finger: 'thumb' |'index' | 'middle' | 'ring' | 'pinky';
  strings: number[];
  barreeRange: number;
}

type FingerPlacement = {
  fret: number;
  strings: number[];
}

export type DissonanceProfile = 'harmonic' | 'neutral' | 'dissonant'

export type GripGeneratorOptions = {
  minFretToConsider?: number;
  maxFretToConsider?: number;
  minimalPlayableStrings?: number;
  allowBarree?: boolean;
  allowInversions?: boolean;
  allowIncompleteChords?: boolean;
  allowMutedStringsInside?: boolean;
  allowDuplicateNotes?: boolean;
  dissonanceProfile?: DissonanceProfile;
}

type GripGenerationConfig = {
  minFretToConsider: number;
  maxFretToConsider: number;
  minimalPlayableStrings: number;
  allowBarree: boolean;
  allowInversions: boolean;
  allowIncompleteChords: boolean;
  allowMutedStringsInside: boolean;
  allowDuplicateNotes: boolean;
  dissonanceProfile: DissonanceProfile;
}

type GripGenerationContext = {
  grips: TunedGrip[];
  fretboardMatrix: Note[][];
  fingers: Finger[];
  expectedNotes: Semitone[];
}
