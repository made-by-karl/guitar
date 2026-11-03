import { Injectable } from '@angular/core';
import { DatabaseService, PATTERNS_INITIALIZED } from '@/app/core/services/database.service';
import {
  FORMAT_VERSION, MODEL_VERSION, PracticeData, TransferFile, TransferKind,
  importedName, parseTransferFile, transferFilename
} from '@/app/core/services/data-transfer-format';
import { APP_VERSION } from '@/version';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';

export const LAST_BACKUP_DOWNLOAD = 'guitar.lastBackupDownload';
export interface TransferInspection {
  file: TransferFile;
  current: { sheets: number; patterns: number };
  matching: { sheets: number; patterns: number };
  resultingName?: string;
}

@Injectable({ providedIn: 'root' })
export class DataTransferService {
  constructor(private readonly db: DatabaseService) {}

  async inspect(json: string, expected: TransferKind): Promise<TransferInspection> {
    const file = parseTransferFile(json, expected);
    const current = await this.db.readPracticeData();
    const inspection: TransferInspection = {
      file,
      current: { sheets: current.songSheets.length, patterns: current.playingPatterns.length },
      matching: { sheets: 0, patterns: 0 }
    };
    if (file.format === 'guitar-backup') {
      const sheetIds = new Set(current.songSheets.map(s => s.id)), patternIds = new Set(current.playingPatterns.map(p => p.id));
      inspection.matching = {
        sheets: file.data.songSheets.filter(s => sheetIds.has(s.id)).length,
        patterns: file.data.playingPatterns.filter(p => patternIds.has(p.id)).length
      };
    } else {
      inspection.resultingName = importedName(file.data.name, (file.format === 'guitar-song-sheet' ? current.songSheets : current.playingPatterns).map(r => r.name));
    }
    return inspection;
  }

  async importCopy(inspection: TransferInspection): Promise<string> {
    // Revalidate and detach from mutable preview state before entering the transaction.
    const file = parseTransferFile(JSON.stringify(inspection.file));
    if (file.format === 'guitar-backup') throw new Error('Restore backups in Settings.');
    const isSheet = file.format === 'guitar-song-sheet';
    return this.db.transaction('rw', [this.db.songSheets, this.db.playingPatterns, this.db.metadata], async () => {
      const table = isSheet ? this.db.songSheets : this.db.playingPatterns;
      const names = (await table.toArray()).map(r => r.name);
      const name = importedName(file.data.name, names);
      // A concurrent tab can occupy the proposed name after inspection. Require a refreshed preview.
      if (name !== inspection.resultingName) throw new Error('Your library changed. Choose the file again to preview its new name.');
      const now = Date.now();
      // randomUUID is unavailable on HTTP/LAN origins; getRandomValues still supplies random IDs.
      const id = crypto.randomUUID?.() ?? `import-${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
      if (file.format === 'guitar-song-sheet') {
        await this.db.songSheets.add({ ...file.data, id, name, created: now, updated: now });
      } else {
        await this.db.playingPatterns.add({ ...file.data, id, name, isCustom: true, createdAt: now, updatedAt: now });
        await this.db.metadata.put({ key: PATTERNS_INITIALIZED, value: true });
      }
      return name;
    });
  }

  async restore(inspection: TransferInspection, mode: 'merge' | 'replace'): Promise<void> {
    const file = parseTransferFile(JSON.stringify(inspection.file), 'guitar-backup');
    if (file.format !== 'guitar-backup') throw new Error('Choose a backup.');
    await this.db.restorePracticeData(file.data, mode);
  }

  async exportSheet(id: string): Promise<void> {
    const sheet = await this.db.songSheets.get(id);
    if (!sheet) throw new Error('This song sheet no longer exists. Refresh the list.');
    this.download(this.envelope({ format: 'guitar-song-sheet', data: sheet }), transferFilename('guitar-song-sheet', sheet.name));
  }

  exportPattern(pattern: PlayingPattern): void {
    this.download(this.envelope({ format: 'guitar-playing-pattern', data: pattern }), transferFilename('guitar-playing-pattern', pattern.name));
  }

  async downloadBackup(): Promise<void> {
    const data = await this.db.readPracticeData();
    const file = this.envelope({ format: 'guitar-backup', data });
    this.download(file, transferFilename('guitar-backup', new Date(file.exportedAt).toISOString().slice(0, 10)));
    // Metadata failure must not misreport an already handed-off download as a failed export.
    try { localStorage.setItem(LAST_BACKUP_DOWNLOAD, String(file.exportedAt)); } catch { /* Storage may be disabled. */ }
  }

  lastBackupDownload(): number | undefined {
    try {
      const raw = localStorage.getItem(LAST_BACKUP_DOWNLOAD), value = Number(raw);
      return raw !== null && Number.isFinite(value) && value > 0 ? value : undefined;
    } catch { return undefined; }
  }

  private envelope(payload: { format: 'guitar-song-sheet'; data: SongSheet } | { format: 'guitar-playing-pattern'; data: PlayingPattern } | { format: 'guitar-backup'; data: PracticeData }): TransferFile {
    return { ...payload, formatVersion: FORMAT_VERSION, modelVersion: MODEL_VERSION, exportedAt: Date.now(), appVersion: APP_VERSION };
  }

  private download(file: TransferFile, filename: string): void {
    // Only resolved runtime grip objects are excluded; all other JSON fields travel intact.
    const sheets = file.format === 'guitar-backup' ? file.data.songSheets : file.format === 'guitar-song-sheet' ? [file.data] : [];
    const gripReferences = new Set<unknown>(sheets.flatMap(sheet => sheet.grips));
    const json = JSON.stringify(file, function(this: unknown, key, value: unknown) {
      return key === 'grip' && gripReferences.has(this) && value !== null && typeof value === 'object' && 'strings' in value ? undefined : value;
    }, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor);
    try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}
