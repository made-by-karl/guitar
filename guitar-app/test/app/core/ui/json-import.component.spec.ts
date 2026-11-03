import { TestBed } from '@angular/core/testing';
import { JsonImportComponent } from '@/app/core/ui/json-import/json-import.component';
import { DataTransferService, TransferInspection } from '@/app/core/services/data-transfer.service';
import { richPattern, transferEnvelope } from '../../../fixtures/data-transfer';

describe('JSON import interactions', () => {
  const preview: TransferInspection = {
    file: { ...transferEnvelope('guitar-playing-pattern', richPattern()), format: 'guitar-playing-pattern', data: richPattern() },
    current: { sheets: 0, patterns: 0 }, matching: { sheets: 0, patterns: 0 }, resultingName: 'Fingerpicking'
  };
  const transfer = { inspect: jest.fn(), importCopy: jest.fn(), restore: jest.fn() };
  const select = (text: () => Promise<string>) => ({ target: { value: 'chosen.json', files: [{ name: 'chosen.json', text }] } } as unknown as Event);
  beforeEach(async () => {
    jest.resetAllMocks(); transfer.inspect.mockResolvedValue(preview); transfer.importCopy.mockResolvedValue('Fingerpicking');
    await TestBed.configureTestingModule({ imports: [JsonImportComponent], providers: [{ provide: DataTransferService, useValue: transfer }] }).compileComponents();
  });

  it('allows same-file retry, disables obsolete previews while reading, and ignores stale reads', async () => {
    const component = new JsonImportComponent(transfer as unknown as DataTransferService);
    component.kind = 'guitar-playing-pattern';
    transfer.inspect.mockImplementation(async (json: string) => ({ ...preview, resultingName: json }));
    await component.choose(select(async () => 'first'));
    expect(component.inspection?.resultingName).toBe('first');
    let finish!: (s: string) => void;
    const slow = component.choose(select(() => new Promise<string>(resolve => { finish = resolve; })));
    expect(component.inspection).toBeUndefined();
    await component.apply(); expect(transfer.importCopy).not.toHaveBeenCalled();
    const same = select(async () => 'second');
    await component.choose(same);
    expect((same.target as HTMLInputElement).value).toBe('');
    finish('late'); await slow;
    expect(component.inspection?.resultingName).toBe('second');
    expect(component.reading).toBe(false);
    component.cancel();
    expect(component.inspection).toBeUndefined(); expect(transfer.importCopy).not.toHaveBeenCalled();
  });

  it('preserves the file after failure and blocks duplicate submissions and file/mode changes while writing', async () => {
    const fixture = TestBed.createComponent(JsonImportComponent), component = fixture.componentInstance;
    component.kind = 'guitar-playing-pattern'; component.inspection = preview;
    fixture.detectChanges();
    let reject!: (error: Error) => void;
    transfer.importCopy.mockImplementation(() => new Promise((_resolve, r) => { reject = r; }));
    const writing = component.apply(); fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('input[type=file]') as HTMLInputElement).disabled).toBe(true);
    await component.apply(); await component.choose(select(async () => 'another')); component.cancel();
    expect(transfer.importCopy).toHaveBeenCalledTimes(1);
    expect(component.inspection).toBe(preview);
    reject(new Error('Storage full')); await writing; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Storage full');
    expect(component.inspection).toBe(preview);
    transfer.importCopy.mockResolvedValue('Fingerpicking');
    const imported = jest.spyOn(component.imported, 'emit'); await component.apply();
    expect(imported).toHaveBeenCalledTimes(1); expect(component.inspection).toBeUndefined();
  });

  it('reports validation errors and restores focus to the labeled picker on cancel', async () => {
    const fixture = TestBed.createComponent(JsonImportComponent), component = fixture.componentInstance;
    component.kind = 'guitar-song-sheet'; fixture.detectChanges();
    transfer.inspect.mockRejectedValueOnce(new Error('Song sheet.parts[1]: missing measures'));
    await component.choose(select(async () => 'bad')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('parts[1]');
    const focus = jest.spyOn(component.picker!.nativeElement, 'focus'); component.cancel();
    expect(focus).toHaveBeenCalled(); expect(component.error).toBe('');
  });
});
