import { isTimeSignature, getTimeSignatureParts } from '@/app/core/music/rhythm/time-signature.model';
import { SEMITONES } from '@/app/core/music/semitones';
import { parseGrip } from '@/app/features/grips/services/grips/grip.model';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';

export const FORMAT_VERSION = 1;
/** Portable record version, independent of Dexie's schema/upgrade history. */
export const MODEL_VERSION = 1;
export type TransferKind = 'guitar-song-sheet' | 'guitar-playing-pattern' | 'guitar-backup';
export interface PracticeData { songSheets: SongSheet[]; playingPatterns: PlayingPattern[]; }
interface Metadata {
  formatVersion: number;
  modelVersion: number;
  exportedAt: number;
  appVersion: string;
}
export type TransferFile = Metadata & (
  { format: 'guitar-song-sheet'; data: SongSheet } |
  { format: 'guitar-playing-pattern'; data: PlayingPattern } |
  { format: 'guitar-backup'; data: PracticeData }
);

type RecordValue = Record<string, unknown>;
function fail(path: string, reason: string): never { throw new Error(`${path}: ${reason}`); }
function object(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  return value as RecordValue;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  return value;
}
function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') fail(path, 'expected text');
}
function id(value: unknown, path: string): asserts value is string {
  text(value, path);
  if (!value.length) fail(path, 'ID must not be empty');
}
function number(value: unknown, path: string, min = -Infinity, max = Infinity, integer = true): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value)) || value < min || value > max) {
    fail(path, `expected ${integer ? 'an integer' : 'a finite number'} between ${min} and ${max}`);
  }
}
function choice(value: unknown, values: readonly unknown[], path: string): void {
  if (!values.includes(value)) fail(path, `unsupported value ${JSON.stringify(value)}`);
}
function optional(o: RecordValue, key: string, check: (v: unknown, p: string) => void, path: string): void {
  if (o[key] !== undefined) check(o[key], `${path}.${key}`);
}
function records(value: unknown, path: string, check: (v: unknown, p: string) => void): RecordValue[] {
  const seen = new Set<string>();
  return array(value, path).map((v, i) => {
    const p = `${path}[${i}]`, o = object(v, p);
    id(o['id'], `${p}.id`);
    if (seen.has(o['id'])) fail(`${p}.id`, `duplicate ID ${o['id']}`);
    seen.add(o['id']);
    check(v, p);
    return o;
  });
}
function grip(value: unknown, path: string): void {
  text(value, path);
  try {
    const parsed = parseGrip(value);
    if (parsed.strings.length !== 6 || parsed.strings.some(s => Array.isArray(s) && s.some(n => !Number.isSafeInteger(n.fret)))) {
      fail(path, 'expected a six-string grip encoding');
    }
  } catch { fail(path, 'invalid six-string grip encoding'); }
}
const STRINGS = ['bass', 'second-from-bass', 'lower-middle', 'upper-middle', 'second-from-top', 'top'];
function endpoint(value: unknown, path: string): void {
  const o = object(value, path);
  choice(o['anchor'], ['base-note', 'grip-note'], `${path}.anchor`);
  if (o['anchor'] === 'grip-note') number(o['fretOffset'], `${path}.fretOffset`);
}
function action(value: unknown, path: string): void {
  if (value === null) return;
  const o = object(value, path), technique = o['technique'];
  choice(technique, ['strum', 'pick', 'hammer-on', 'pull-off', 'slide', 'percussive'], `${path}.technique`);
  optional(o, 'modifiers', (v, p) => array(v, p).forEach((m, i) => choice(m, ['mute', 'palm-mute', 'accent'], `${p}[${i}]`)), path);
  optional(o, 'legatoMode', (v, p) => choice(v, ['explicit', 'relative'], p), path);
  if (technique === 'strum' && o['strum'] === undefined) fail(path, 'strum technique needs strum data');
  optional(o, 'strum', (v, p) => {
    const s = object(v, p);
    choice(s['direction'], ['D', 'U'], `${p}.direction`);
    const range = s['strings'];
    if (Array.isArray(range)) range.forEach((n, i) => number(n, `${p}.strings[${i}]`, 0, 5));
    else if (typeof range === 'object' && range) {
      const r = object(range, `${p}.strings`);
      choice(r['from'], STRINGS, `${p}.strings.from`); choice(r['to'], STRINGS, `${p}.strings.to`);
    } else choice(range, ['all', 'bass', 'treble', 'middle', 'power'], `${p}.strings`);
  }, path);
  if (technique === 'pick' && o['pick'] === undefined) fail(path, 'pick technique needs pick data');
  optional(o, 'pick', (v, p) => array(v, p).forEach((note, i) => {
    const n = object(note, `${p}[${i}]`), np = `${p}[${i}]`;
    choice(n['mode'], ['explicit', 'relative'], `${np}.mode`);
    if (n['mode'] === 'explicit') {
      number(n['string'], `${np}.string`, 0, 5); number(n['fret'], `${np}.fret`, -1);
    } else { choice(n['string'], STRINGS, `${np}.string`); endpoint(n, np); }
  }), path);
  optional(o, 'legato', (v, p) => {
    const n = object(v, p);
    if ((o['legatoMode'] ?? 'explicit') === 'relative') {
      choice(n['string'], STRINGS, `${p}.string`); endpoint(n['target'], `${p}.target`);
    } else { number(n['string'], `${p}.string`, 0, 5); number(n['toFret'], `${p}.toFret`, 0); }
  }, path);
  optional(o, 'slide', (v, p) => number(object(v, p)['fretOffset'], `${p}.fretOffset`), path);
  optional(o, 'percussive', (v, p) => choice(object(v, p)['technique'], ['body-knock', 'string-slap'], `${p}.technique`), path);
  if (['hammer-on', 'pull-off'].includes(String(technique)) && o['legato'] === undefined) fail(path, 'legato technique needs a target');
  if (technique === 'slide' && o['slide'] === undefined && o['legato'] === undefined) fail(path, 'slide needs an offset or target');
  if (technique === 'percussive' && o['percussive'] === undefined) fail(path, 'percussion needs a technique');
}
function actionGrips(value: unknown, path: string, measures: RecordValue[]): void {
  const positions = new Set<string>();
  array(value, path).forEach((v, i) => {
    const p = `${path}[${i}]`, o = object(v, p);
    number(o['measureIndex'], `${p}.measureIndex`, 0, measures.length - 1);
    const actions = array(measures[o['measureIndex']]['actions'], p);
    number(o['actionIndex'], `${p}.actionIndex`, 0, actions.length - 1);
    grip(o['gripId'], `${p}.gripId`); text(o['name'], `${p}.name`);
    const position = `${o['measureIndex']}:${o['actionIndex']}`;
    if (positions.has(position)) fail(p, 'duplicate grip assignment position');
    positions.add(position);
  });
}
function measure(value: unknown, path: string): void {
  const o = object(value, path), signature = o['timeSignature'];
  if (!isTimeSignature(signature)) fail(`${path}.timeSignature`, 'unsupported time signature');
  const actions = array(o['actions'], `${path}.actions`);
  const { top, bottom } = getTimeSignatureParts(signature);
  if (actions.length !== top * (bottom === 4 ? 4 : 2)) fail(`${path}.actions`, 'slot count does not match time signature');
  actions.forEach((v, i) => action(v, `${path}.actions[${i}]`));
  optional(o, 'actionGrips', (v, p) => actionGrips(v, p, [o]), path);
}
function pattern(value: unknown, path: string): void {
  const o = object(value, path);
  id(o['id'], `${path}.id`);
  for (const key of ['name', 'description', 'category', 'suggestedGenre', 'exampleSong']) text(o[key], `${path}.${key}`);
  for (const key of ['createdAt', 'updatedAt']) number(o[key], `${path}.${key}`, 0);
  optional(o, 'isCustom', (v, p) => { if (typeof v !== 'boolean') fail(p, 'expected a boolean'); }, path);
  const measures = array(o['measures'], `${path}.measures`);
  measures.forEach((v, i) => measure(v, `${path}.measures[${i}]`));
  optional(o, 'actionGrips', (v, p) => actionGrips(v, p, measures.map((m, i) => object(m, `${path}.measures[${i}]`))), path);
}
function sheet(value: unknown, path: string): void {
  const o = object(value, path);
  id(o['id'], `${path}.id`); text(o['name'], `${path}.name`);
  for (const key of ['created', 'updated']) number(o[key], `${path}.${key}`, 0);
  number(o['tempo'], `${path}.tempo`, 1, Infinity, false); number(o['capodaster'], `${path}.capodaster`, 0);
  const tuning = array(o['tuning'], `${path}.tuning`);
  if (tuning.length !== 6) fail(`${path}.tuning`, 'expected six strings');
  tuning.forEach((v, i) => {
    const n = object(v, `${path}.tuning[${i}]`);
    choice(n['semitone'], SEMITONES, `${path}.tuning[${i}].semitone`);
    number(n['octave'], `${path}.tuning[${i}].octave`);
  });
  records(o['links'], `${path}.links`, (v, p) => {
    const link = object(v, p); text(link['url'], `${p}.url`); text(link['description'], `${p}.description`);
  });
  const gripIds = new Set<string>();
  array(o['grips'], `${path}.grips`).forEach((v, i) => {
    const p = `${path}.grips[${i}]`, g = object(v, p);
    grip(g['gripId'], `${p}.gripId`); text(g['name'], `${p}.name`);
    if (gripIds.has(g['gripId'] as string)) fail(p, 'duplicate grip ID');
    gripIds.add(g['gripId'] as string);
  });
  records(o['patterns'], `${path}.patterns`, pattern);
  const parts = records(o['parts'], `${path}.parts`, (v, p) => {
    const part = object(v, p); text(part['section'], `${p}.section`); text(part['notes'], `${p}.notes`);
    optional(part, 'lyrics', text, p);
    records(part['measures'], `${p}.measures`, (m, mp) => measure(object(m, mp)['measure'], `${mp}.measure`));
  });
  optional(o, 'arrangement', (v, p) => records(v, p, (occurrence, op) => {
    const a = object(occurrence, op); id(a['partId'], `${op}.partId`); text(a['lyrics'], `${op}.lyrics`);
    if (!parts.some(part => part['id'] === a['partId'])) fail(`${op}.partId`, 'references a missing part');
  }), path);
}

/** Validate unknown JSON without normalizing, dropping fields, or writing storage. */
export function parseTransferFile(json: string, expected?: TransferKind): TransferFile {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('The file is not readable JSON. It may be truncated. Choose a complete Guitar JSON file.'); }
  const o = object(value, 'File');
  choice(o['format'], ['guitar-song-sheet', 'guitar-playing-pattern', 'guitar-backup'], 'File.format');
  if (expected && o['format'] !== expected) {
    throw new Error(o['format'] === 'guitar-backup' ? 'This is a backup. Restore it in Settings → Data Management.' : `Choose a ${expected === 'guitar-backup' ? 'backup from Settings' : expected === 'guitar-song-sheet' ? 'song sheet' : 'playing pattern'} JSON file.`);
  }
  if (o['formatVersion'] !== FORMAT_VERSION) fail('File.formatVersion', 'unsupported format version. Use a file with format version 1; update Guitar if this file is newer.');
  if (o['modelVersion'] !== MODEL_VERSION) fail('File.modelVersion', 'unsupported model version. Use a file with model version 1; update Guitar if this file is newer.');
  number(o['exportedAt'], 'File.exportedAt', 0); text(o['appVersion'], 'File.appVersion');
  if (o['format'] === 'guitar-song-sheet') sheet(o['data'], 'Song sheet');
  else if (o['format'] === 'guitar-playing-pattern') pattern(o['data'], 'Playing pattern');
  else {
    const data = object(o['data'], 'Backup.data');
    records(data['songSheets'], 'Backup.songSheets', sheet);
    records(data['playingPatterns'], 'Backup.playingPatterns', pattern);
  }
  // The validators above establish the discriminated record shape; keep every additional JSON field.
  return value as TransferFile;
}

export function importedName(name: string, names: readonly string[]): string {
  const used = new Set(names);
  if (!used.has(name)) return name;
  let result = `${name} (Imported)`, count = 2;
  while (used.has(result)) result = `${name} (Imported ${count++})`;
  return result;
}

export function transferFilename(kind: TransferKind, name: string): string {
  const safe = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return `${kind}-${safe || 'untitled'}.json`;
}
