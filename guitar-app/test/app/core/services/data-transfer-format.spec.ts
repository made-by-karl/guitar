import { importedName, parseTransferFile, transferFilename } from '@/app/core/services/data-transfer-format';
import { createDefaultPlayingPatterns } from '@/app/features/patterns/services/playing-pattern-defaults';
import { PlayingPatternPlaybackPlannerService } from '@/app/features/patterns/services/playing-pattern-playback-planner.service';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { transpose } from '@/app/core/music/semitones';
import { richPattern, richSheet, transferEnvelope } from '../../../fixtures/data-transfer';

describe('Portable Guitar JSON', () => {
  const read = (format: 'guitar-song-sheet' | 'guitar-playing-pattern' | 'guitar-backup', data: unknown) => parseTransferFile(JSON.stringify(transferEnvelope(format, data)));

  it('preserves the complete sheet aggregate and additional JSON fields', () => {
    const sheet = { ...richSheet(), extra: { nested: ['kept'] } };
    expect(read('guitar-song-sheet', sheet).data).toEqual(JSON.parse(JSON.stringify(sheet)));
    sheet.arrangement = [];
    expect(read('guitar-song-sheet', sheet).data).toEqual(JSON.parse(JSON.stringify(sheet)));
  });

  it('accepts every supported action variant, defaults, empty content and built-in patterns', () => {
    for (const pattern of [richPattern(), ...createDefaultPlayingPatterns()]) expect(read('guitar-playing-pattern', pattern).data).toEqual(pattern);
    const sheet = richSheet();
    sheet.name = ''; sheet.parts = []; delete sheet.arrangement;
    const pattern = richPattern(); pattern.name = ''; pattern.measures = []; delete pattern.actionGrips; delete pattern.isCustom;
    expect(() => read('guitar-song-sheet', sheet)).not.toThrow();
    expect(() => read('guitar-playing-pattern', pattern)).not.toThrow();
    expect(() => read('guitar-backup', { songSheets: [], playingPatterns: [] })).not.toThrow();
  });

  it('retains musical playback planning across a portable pattern round trip', () => {
    const pattern = richPattern(), sheet = richSheet();
    const file = read('guitar-playing-pattern', pattern);
    if (file.format !== 'guitar-playing-pattern') throw new Error('Expected pattern');
    const planner = new PlayingPatternPlaybackPlannerService();
    const plan = (p: PlayingPattern) => planner.buildPlaybackPlan(
      p.measures.map((measure, index) => ({ measure, actionGrips: [
        ...(measure.actionGrips ?? []), ...(p.actionGrips ?? []).filter(g => g.measureIndex === index)
      ] })),
      sheet.tuning.map(note => transpose(note, sheet.capodaster)), sheet.tempo
    );
    const before = plan(pattern);
    expect(before.instructions.length).toBeGreaterThan(0);
    expect(plan(file.data)).toEqual(before);
  });

  it.each([
    ['truncated JSON', '{'],
    ['another app', JSON.stringify({ format: 'traccoon-backup' })],
    ['null', 'null'],
    ['old format', JSON.stringify({ ...transferEnvelope('guitar-playing-pattern', richPattern()), formatVersion: 0 })],
    ['future format', JSON.stringify({ ...transferEnvelope('guitar-playing-pattern', richPattern()), formatVersion: 2 })],
    ['old model', JSON.stringify({ ...transferEnvelope('guitar-playing-pattern', richPattern()), modelVersion: 0 })],
    ['future model', JSON.stringify({ ...transferEnvelope('guitar-playing-pattern', richPattern()), modelVersion: 2 })]
  ])('rejects %s', (_name, json) => expect(() => parseTransferFile(json)).toThrow());

  it('directs a backup selected in a library to Settings', () => {
    expect(() => parseTransferFile(JSON.stringify(transferEnvelope('guitar-backup', { songSheets: [], playingPatterns: [] })), 'guitar-song-sheet')).toThrow('Settings');
  });

  it.each([
    ['required field', (s: ReturnType<typeof richSheet>) => { delete (s as Partial<typeof s>).tempo; }, 'tempo'],
    ['wrong field type', (s: ReturnType<typeof richSheet>) => { Object.assign(s, { tempo: '90' }); }, 'tempo'],
    ['non-finite number', (s: ReturnType<typeof richSheet>) => { s.tempo = Infinity; }, 'tempo'],
    ['duplicate part ID', (s: ReturnType<typeof richSheet>) => { s.parts.push(s.parts[0]); }, 'duplicate ID'],
    ['duplicate measure ID', (s: ReturnType<typeof richSheet>) => { s.parts[0].measures.push(s.parts[0].measures[0]); }, 'duplicate ID'],
    ['duplicate occurrence ID', (s: ReturnType<typeof richSheet>) => { s.arrangement!.push(s.arrangement![0]); }, 'duplicate ID'],
    ['dangling part', (s: ReturnType<typeof richSheet>) => { s.arrangement![0].partId = 'missing'; }, 'partId'],
    ['invalid grip', (s: ReturnType<typeof richSheet>) => { s.grips[0].gripId = 'bad'; }, 'grip'],
    ['unsupported action', (s: ReturnType<typeof richSheet>) => { Object.assign(s.patterns[0].measures[0].actions[0]!, { technique: 'future' }); }, 'technique'],
    ['invalid signature', (s: ReturnType<typeof richSheet>) => { Object.assign(s.patterns[0].measures[0], { timeSignature: '13/9' }); }, 'timeSignature'],
    ['wrong slot count', (s: ReturnType<typeof richSheet>) => { s.patterns[0].measures[0].actions.pop(); }, 'slot count'],
    ['invalid string', (s: ReturnType<typeof richSheet>) => { s.patterns[0].measures[0].actions[2]!.pick![0].string = 6; }, 'string'],
    ['invalid action position', (s: ReturnType<typeof richSheet>) => { s.patterns[0].actionGrips![0].actionIndex = 12; }, 'actionIndex'],
    ['invalid measure position', (s: ReturnType<typeof richSheet>) => { s.patterns[0].actionGrips![0].measureIndex = 4; }, 'measureIndex'],
    ['invalid legato target', (s: ReturnType<typeof richSheet>) => { Object.assign(s.patterns[0].measures[0].actions[4]!.legato!, { target: { anchor: 'future' } }); }, 'anchor'],
    ['invalid range', (s: ReturnType<typeof richSheet>) => { Object.assign(s.patterns[0].measures[0].actions[1]!.strum!, { strings: { from: 'middle', to: 'top' } }); }, 'strings.from']
  ])('rejects %s with a useful location', (_name, mutate, message) => {
    const sheet = richSheet(); mutate(sheet);
    expect(() => read('guitar-song-sheet', sheet)).toThrow(message);
  });

  it('rejects partial backups and duplicate IDs only within their identity scope', () => {
    const sheet = richSheet('same'), pattern = richPattern('same');
    expect(() => read('guitar-backup', { songSheets: [sheet], playingPatterns: [pattern] })).not.toThrow();
    expect(() => read('guitar-backup', { songSheets: [sheet] })).toThrow('playingPatterns');
    expect(() => read('guitar-backup', { songSheets: [sheet, sheet], playingPatterns: [] })).toThrow('duplicate ID');
    expect(() => read('guitar-backup', { songSheets: [], playingPatterns: [pattern, pattern] })).toThrow('duplicate ID');
    const another = richSheet('other', sheet.name);
    expect(() => read('guitar-backup', { songSheets: [sheet, another], playingPatterns: [] })).not.toThrow();
  });

  it('chooses copy names and safe filenames deterministically', () => {
    expect(importedName('Song', [])).toBe('Song');
    expect(importedName('Song', ['Song', 'Song (Imported)', 'Song (Imported 2)'])).toBe('Song (Imported 3)');
    expect(transferFilename('guitar-song-sheet', '../My / Söng?')).toBe('guitar-song-sheet-my-song.json');
    expect(transferFilename('guitar-playing-pattern', '🎸')).toBe('guitar-playing-pattern-untitled.json');
  });
});
