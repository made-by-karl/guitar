import { Injectable, signal } from '@angular/core';
import { Measure, PlayingAction, PlayingPatternActionGrip } from '@/app/features/patterns/services/playing-patterns.model';
import { cloneMeasure } from '@/app/features/patterns/services/playing-pattern-clone';
import { parseGrip } from '@/app/features/grips/services/grips/grip.model';

export type ClipboardKind = 'measures' | 'action';
export interface ClipboardEntry {
  readonly id: number;
  readonly kind: ClipboardKind;
  readonly source: string;
  readonly preview: string;
}
interface Snapshot extends ClipboardEntry { measures: Measure[]; }

/** Session-only snapshots. Payloads never escape without a fresh deep clone. */
@Injectable({ providedIn: 'root' })
export class MusicClipboardService {
  private nextId = 1;
  private readonly snapshots = new Map<number, Snapshot>();
  private readonly history = signal<readonly ClipboardEntry[]>([]);
  readonly entries = this.history.asReadonly();

  copyMeasures(measures: readonly Measure[], source: string): void {
    if (!measures.length) return;
    const techniques = [...new Set(measures.flatMap(measure => measure.actions.flatMap(action => action ? [action.technique] : [])))];
    const grips = [...new Set(measures.flatMap(measure => (measure.actionGrips ?? []).map(grip => grip.name)))];
    const preview = [
      `${measures.length} ${measures.length === 1 ? 'measure' : 'measures'}`,
      measures.map(measure => measure.timeSignature).join(', '),
      techniques.join(', ') || 'empty rhythm',
      ...(grips.length ? [`Grips: ${grips.join(', ')}`] : [])
    ].join(' · ');
    this.add('measures', measures, source, preview);
  }

  copyAction(action: PlayingAction, grip: PlayingPatternActionGrip | undefined, source: string): void {
    this.add('action', [{ timeSignature: '4/4', actions: [action], actionGrips: grip ? [{ ...grip, measureIndex: 0, actionIndex: 0 }] : [] }], source, describeAction(action) + (grip ? ` · Grip: ${grip.name}` : ' · Inherits destination grip'));
  }

  private add(kind: ClipboardKind, measures: readonly Measure[], source: string, preview: string): void {
    // Explicit grips are serialized fingerings, independent of a sheet/library record.
    for (const measure of measures) for (const ref of measure.actionGrips ?? []) {
      try {
        if (parseGrip(ref.gripId).strings.length !== 6) throw new Error();
      } catch {
        throw new Error(`Cannot copy: explicit grip “${ref.name}” is unavailable. Assign a valid grip first.`);
      }
    }
    const entry: Snapshot = { id: this.nextId++, kind, source, preview, measures: measures.map(m => cloneMeasure({ ...m, actionGrips: (m.actionGrips ?? []).map(g => ({ ...g, measureIndex: 0 })) })) };
    this.snapshots.set(entry.id, entry);
    this.history.update(entries => [{ id: entry.id, kind, source, preview }, ...entries]);
  }

  read(id: number, kind: ClipboardKind): Measure[] | undefined {
    const entry = this.snapshots.get(id);
    return entry?.kind === kind ? entry.measures.map(m => cloneMeasure(m)) : undefined;
  }

  remove(id: number): void {
    this.snapshots.delete(id);
    this.history.update(entries => entries.filter(entry => entry.id !== id));
  }
}

function describeAction(action: PlayingAction): string {
  const details: string[] = [action.technique, action.articulation ?? 'normal', ...(action.modifiers ?? [])];
  if (action.strum) {
    const strings = action.strum.strings;
    const range = typeof strings === 'string' ? strings : Array.isArray(strings)
      ? `strings ${strings.map(index => 6 - index).join(', ')}`
      : `${strings.from} to ${strings.to}`;
    details.push(action.strum.direction === 'D' ? 'down' : 'up', range);
  }
  for (const note of action.pick ?? []) {
    details.push(note.mode === 'explicit'
      ? `string ${6 - note.string}, fret ${note.fret}`
      : `${note.string}, ${note.anchor}${'fretOffset' in note ? ` ${signedOffset(note.fretOffset)}` : ''}`);
  }
  const legato = action.legato;
  if (legato) {
    if ('toFret' in legato) details.push(`string ${6 - legato.string}, to fret ${legato.toFret}`);
    else details.push(`${legato.string}, to ${legato.target.anchor}${'fretOffset' in legato.target ? ` ${signedOffset(legato.target.fretOffset)}` : ''}`);
  }
  if (action.slide) details.push(`all fretted strings ${signedOffset(action.slide.fretOffset)}`);
  if (action.percussive) details.push(action.percussive.technique);
  return details.join(' · ');
}

function signedOffset(offset: number): string {
  return `${offset >= 0 ? '+' : ''}${offset}`;
}
