import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AboutComponent } from '@/app/features/maintenance/about/pages/about.component';
import { UpdateService } from '@/app/core/services/update.service';

describe('AboutComponent', () => {
  const updateService = {
    appVersion: '1.2.3',
    updatePending: signal(false),
    checkingForUpdate: signal(false),
    updatesEnabled: signal(true),
    checkForUpdates: jest.fn().mockResolvedValue(undefined),
    applyPendingUpdate: jest.fn()
  };

  beforeEach(async () => {
    updateService.updatePending.set(false);
    updateService.checkingForUpdate.set(false);
    updateService.updatesEnabled.set(true);
    updateService.checkForUpdates.mockClear();
    updateService.applyPendingUpdate.mockClear();

    await TestBed.configureTestingModule({
      imports: [AboutComponent],
      providers: [
        { provide: UpdateService, useValue: updateService }
      ]
    }).compileComponents();
  });

  it('renders the current version and search action when no update is pending', () => {
    const fixture = TestBed.createComponent(AboutComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Guitar Companion');
    expect(root.textContent).toContain('github.com/made-by-karl/guitar');
    expect(root.textContent).toContain('GNU GPL v3.0');
    expect(root.textContent).toContain('1.2.3');
    expect(root.textContent).toContain('No pending update');
    expect(root.querySelector('button')?.textContent).toContain('Search for update');
  });

  it('renders the update action when an update is pending', () => {
    updateService.updatePending.set(true);

    const fixture = TestBed.createComponent(AboutComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('A new version is ready');
    expect(root.querySelector('button')?.textContent).toContain('Update');
  });

  it('triggers a manual update check when no update is pending', async () => {
    const fixture = TestBed.createComponent(AboutComponent);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector('button')?.dispatchEvent(new Event('click'));
    await fixture.whenStable();

    expect(updateService.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updateService.applyPendingUpdate).not.toHaveBeenCalled();
  });

  it('reloads into the pending update when update is clicked', () => {
    updateService.updatePending.set(true);

    const fixture = TestBed.createComponent(AboutComponent);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector('button')?.dispatchEvent(new Event('click'));

    expect(updateService.applyPendingUpdate).toHaveBeenCalledTimes(1);
    expect(updateService.checkForUpdates).not.toHaveBeenCalled();
  });
});
