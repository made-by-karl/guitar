import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LogPageComponent } from '@/app/features/maintenance/logs/pages/log-page.component';
import { DialogService } from '@/app/core/services/dialog.service';
import { ConsoleLogStoreService } from '@/app/core/services/console-log-store.service';

describe('LogPageComponent', () => {
  const fakeStore = {
    entries: signal([
      {
        id: 1,
        timestamp: '2026-04-12T10:00:00.000Z',
        level: 'error' as const,
        messageText: 'Sample error',
        rawArgs: ['Sample error']
      }
    ]),
    clear: jest.fn(),
    exportJson: jest.fn().mockReturnValue('[{"message":"x"}]')
  };

  const dialogService = {
    confirm: jest.fn().mockResolvedValue(true),
    alert: jest.fn().mockResolvedValue(undefined)
  };

  beforeEach(async () => {
    fakeStore.entries.set([
      {
        id: 1,
        timestamp: '2026-04-12T10:00:00.000Z',
        level: 'error' as const,
        messageText: 'Sample error',
        rawArgs: ['Sample error']
      }
    ]);
    fakeStore.clear.mockClear();
    fakeStore.exportJson.mockClear();
    dialogService.confirm.mockClear();
    dialogService.alert.mockClear();

    await TestBed.configureTestingModule({
      imports: [LogPageComponent],
      providers: [
        { provide: ConsoleLogStoreService, useValue: fakeStore },
        { provide: DialogService, useValue: dialogService }
      ]
    }).compileComponents();
  });

  it('renders captured entries', () => {
    const fixture = TestBed.createComponent(LogPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sample error');
    expect(fixture.nativeElement.textContent).toContain('Application Logs');
  });

  it('clears logs after confirmation', async () => {
    const fixture = TestBed.createComponent(LogPageComponent);
    fixture.detectChanges();

    await fixture.componentInstance.clear();
    expect(dialogService.confirm).toHaveBeenCalled();
    expect(fakeStore.clear).toHaveBeenCalled();
  });

  it('copies all logs to clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    const fixture = TestBed.createComponent(LogPageComponent);
    fixture.detectChanges();

    await fixture.componentInstance.copyAll();
    expect(fakeStore.exportJson).toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('[{"message":"x"}]');
  });

  it('shows alert when clipboard api is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });

    const fixture = TestBed.createComponent(LogPageComponent);
    fixture.detectChanges();

    await fixture.componentInstance.copyAll();
    expect(dialogService.alert).toHaveBeenCalled();
  });
});
