import { TestBed } from '@angular/core/testing';
import { DataTransferService } from '@/app/core/services/data-transfer.service';
import { ExportButtonComponent } from '@/app/core/ui/export-button/export-button.component';

describe('Export button', () => {
  const transfer = { export: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    await TestBed.configureTestingModule({
      imports: [ExportButtonComponent],
      providers: [{ provide: DataTransferService, useValue: transfer }]
    }).compileComponents();
  });

  it('exports by ID and type, blocks duplicate downloads, and allows retry after failure', async () => {
    const fixture = TestBed.createComponent(ExportButtonComponent);
    fixture.componentRef.setInput('id', 'pattern');
    fixture.componentRef.setInput('type', 'guitar-playing-pattern');
    fixture.componentRef.setInput('sheetId', 'sheet');
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-label')).toBe('Export');
    expect(button.textContent).toContain('Export');
    expect(button.textContent).not.toContain('JSON');

    let reject!: (error: Error) => void;
    transfer.export.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Exporting…');
    expect(button.getAttribute('aria-busy')).toBe('true');
    await fixture.componentInstance.download();
    expect(transfer.export).toHaveBeenCalledTimes(1);
    expect(transfer.export).toHaveBeenCalledWith('pattern', 'guitar-playing-pattern', 'sheet');

    reject(new Error('Database unavailable'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Database unavailable');
    expect(button.disabled).toBe(false);
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(transfer.export).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[role=alert]')).toBeNull();
    expect(button.getAttribute('aria-label')).toBe('Export');
  });
});
