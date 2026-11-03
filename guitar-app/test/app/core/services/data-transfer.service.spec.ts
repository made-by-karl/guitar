import { DataTransferService, LAST_BACKUP_DOWNLOAD } from '@/app/core/services/data-transfer.service';
import { DatabaseService } from '@/app/core/services/database.service';
import { PracticeData } from '@/app/core/services/data-transfer-format';
import { richPattern, richSheet, transferEnvelope } from '../../../fixtures/data-transfer';
import { cloneMeasure } from '@/app/features/patterns/services/playing-pattern-clone';

describe('DataTransferService', () => {
  function setup(data: PracticeData = { songSheets: [], playingPatterns: [] }) {
    const table = <T extends { id: string }>(rows: T[]) => ({
      toArray: jest.fn(async () => rows), get: jest.fn(async (id: string) => rows.find(r => r.id === id)),
      add: jest.fn(async (row: T) => { rows.push(row); })
    });
    const db = {
      songSheets: table(data.songSheets), playingPatterns: table(data.playingPatterns),
      metadata: { put: jest.fn().mockResolvedValue(undefined) },
      readPracticeData: jest.fn(async () => data), restorePracticeData: jest.fn(),
      transaction: jest.fn((_mode: string, _tables: unknown, fn: () => Promise<unknown>) => fn())
    };
    return { data, db, service: new DataTransferService(db as unknown as DatabaseService) };
  }

  beforeEach(() => {
    localStorage.clear();
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `new-${++sequence}` });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:test') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('inspects without writing, then imports repeated sheets as independent copies', async () => {
    const original = richSheet(), originalJSON = JSON.stringify(original);
    const { db, data, service } = setup({ songSheets: [original], playingPatterns: [] });
    const json = JSON.stringify(transferEnvelope('guitar-song-sheet', original));
    const first = await service.inspect(json, 'guitar-song-sheet');
    expect(first.resultingName).toBe('My song (Imported)');
    expect(db.songSheets.add).not.toHaveBeenCalled();
    await service.importCopy(first);
    await service.importCopy(await service.inspect(json, 'guitar-song-sheet'));
    expect(data.songSheets.map(s => s.name)).toEqual(['My song', 'My song (Imported)', 'My song (Imported 2)']);
    expect(new Set(data.songSheets.map(s => s.id)).size).toBe(3);
    expect(data.songSheets[1].created).not.toBe(original.created);
    expect(data.songSheets[1].arrangement).toEqual(original.arrangement);
    data.songSheets[1].arrangement![0].lyrics = 'Changed';
    data.songSheets[1].patterns[0].measures[0].actions[0]!.strum!.strings = [5];
    expect(JSON.stringify(original)).toBe(originalJSON);
    expect(data.songSheets[2].arrangement![0].lyrics).toBe('Morning words');
    expect(data.songSheets[2].patterns[0].measures[0].actions[0]!.strum!.strings).toEqual([0, 2, 5]);
    expect(data.playingPatterns).toEqual([]);
  });

  it('makes imported built-ins custom and checks concurrent name changes', async () => {
    const pattern = richPattern(), { service, data, db } = setup();
    const json = JSON.stringify(transferEnvelope('guitar-playing-pattern', pattern));
    const preview = await service.inspect(json, 'guitar-playing-pattern');
    await service.importCopy(preview);
    expect(data.playingPatterns[0].isCustom).toBe(true);
    await expect(service.importCopy(preview)).rejects.toThrow('library changed');
    expect(db.playingPatterns.add).toHaveBeenCalledTimes(1);
    db.playingPatterns.add.mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(service.importCopy(await service.inspect(json, 'guitar-playing-pattern'))).rejects.toThrow('Quota');
    expect(data.playingPatterns).toHaveLength(1);
  });

  it('creates distinct copies on HTTP origins where randomUUID is unavailable', async () => {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
    const { service, data } = setup();
    const json = JSON.stringify(transferEnvelope('guitar-playing-pattern', richPattern()));
    await service.importCopy(await service.inspect(json, 'guitar-playing-pattern'));
    await service.importCopy(await service.inspect(json, 'guitar-playing-pattern'));
    expect(data.playingPatterns[0].id).toMatch(/^import-[0-9a-f]{32}$/);
    expect(data.playingPatterns[0].id).not.toBe(data.playingPatterns[1].id);
  });

  it('keeps backup identities, timestamps, extra fields, and file-wins restore mode', async () => {
    const { service, db } = setup({ songSheets: [richSheet('B'), richSheet('A')], playingPatterns: [richPattern('B')] });
    const payload = { songSheets: [{ ...richSheet('B'), extra: { keep: true } }, richSheet('C')], playingPatterns: [richPattern('B'), richPattern('C')] };
    const preview = await service.inspect(JSON.stringify(transferEnvelope('guitar-backup', payload)), 'guitar-backup');
    expect(preview.matching).toEqual({ sheets: 1, patterns: 1 });
    expect(preview.current).toEqual({ sheets: 2, patterns: 1 });
    expect(db.restorePracticeData).not.toHaveBeenCalled();
    await service.restore(preview, 'merge');
    expect(db.restorePracticeData).toHaveBeenCalledWith(payload, 'merge');
    await service.restore(preview, 'replace');
    expect(db.restorePracticeData).toHaveBeenLastCalledWith(payload, 'replace');
    expect(service.lastBackupDownload()).toBeUndefined();
  });

  it('hands off complete readable JSON and only then records backup metadata', async () => {
    const { service, db } = setup({ songSheets: [richSheet()], playingPatterns: [richPattern()] });
    await service.downloadBackup();
    expect(db.readPracticeData).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(service.lastBackupDownload()).toBeGreaterThan(0);
    const previous = localStorage.getItem(LAST_BACKUP_DOWNLOAD);
    await service.exportSheet('sheet'); service.exportPattern(richPattern());
    expect(localStorage.getItem(LAST_BACKUP_DOWNLOAD)).toBe(previous);
    db.readPracticeData.mockRejectedValueOnce(new Error('Read failed'));
    await expect(service.downloadBackup()).rejects.toThrow('Read failed');
    expect(localStorage.getItem(LAST_BACKUP_DOWNLOAD)).toBe(previous);
    (HTMLAnchorElement.prototype.click as jest.Mock).mockImplementationOnce(() => { throw new Error('Download failed'); });
    await expect(service.downloadBackup()).rejects.toThrow('Download failed');
    expect(localStorage.getItem(LAST_BACKUP_DOWNLOAD)).toBe(previous);
  });

  it('clones array ranges, measure grips and nested legato endpoints without widening them', () => {
    const source = richPattern().measures[0], original = JSON.stringify(source), copy = cloneMeasure(source);
    const strings = copy.actions[0]!.strum!.strings;
    expect(Array.isArray(strings)).toBe(true);
    if (Array.isArray(strings)) strings[0] = 5;
    const legato = copy.actions[4]!.legato!;
    if ('target' in legato && legato.target.anchor === 'grip-note') legato.target.fretOffset = 10;
    copy.actionGrips![0].name = 'Other';
    expect(JSON.stringify(source)).toBe(original);
  });

  it('excludes resolved sheet grips without dropping similarly named additional user fields', async () => {
    const sheet = richSheet();
    Object.assign(sheet.grips[0], { grip: { strings: ['runtime'] } });
    sheet.grips.push({ gripId: '3|2|o|o|o|3', name: 'G', ...{ grip: 'Additional user text' } });
    const additional = { grip: { strings: ['user content'] } };
    Object.assign(sheet, { additional });
    const { service } = setup({ songSheets: [sheet], playingPatterns: [] });
    await service.downloadBackup();
    const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob;
    const json = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blob);
    });
    const saved = JSON.parse(json).data.songSheets[0];
    expect(saved.additional).toEqual(additional);
    expect(saved.grips[0]).not.toHaveProperty('grip');
    expect(saved.grips[1].grip).toBe('Additional user text');
    expect(sheet.grips[0]).toHaveProperty('grip');
  });
});
