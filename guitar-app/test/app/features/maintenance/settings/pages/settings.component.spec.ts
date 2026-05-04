import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DebugSettingsService } from '@/app/core/services/debug-settings.service';
import { DatabaseService } from '@/app/core/services/database.service';
import { DialogService } from '@/app/core/services/dialog.service';
import { SettingsComponent } from '@/app/features/maintenance/settings/pages/settings.component';

describe('SettingsComponent', () => {
  let debugSettings: {
    tunerDebugEnabled: WritableSignal<boolean>;
    setTunerDebugEnabled: jest.Mock<void, [boolean]>;
  };
  const dialogService = {
    confirm: jest.fn(),
    alert: jest.fn()
  };
  const databaseService = {
    songSheets: { clear: jest.fn() },
    playingPatterns: { clear: jest.fn() }
  };

  beforeEach(async () => {
    jest.restoreAllMocks();
    debugSettings = {
      tunerDebugEnabled: signal(false),
      setTunerDebugEnabled: jest.fn((enabled: boolean) => debugSettings.tunerDebugEnabled.set(enabled))
    };
    debugSettings.tunerDebugEnabled.set(false);
    debugSettings.setTunerDebugEnabled.mockClear();

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: DialogService, useValue: dialogService },
        { provide: DatabaseService, useValue: databaseService },
        { provide: DebugSettingsService, useValue: debugSettings }
      ]
    }).compileComponents();
  });

  it('renders the tuner debug toggle', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Enable tuner debug mode');
    expect(root.textContent).toContain('Developer Tools');
  });

  it('persists tuner debug mode changes through the settings service', () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#tunerDebugEnabled') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(debugSettings.setTunerDebugEnabled).toHaveBeenCalledWith(true);
    expect(debugSettings.tunerDebugEnabled()).toBe(true);
  });
});
