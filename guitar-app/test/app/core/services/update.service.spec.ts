import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { UpdateService } from '@/app/core/services/update.service';
import { APP_VERSION } from '@/version';

describe('UpdateService', () => {
  let service: UpdateService;
  let versionUpdates: Subject<VersionReadyEvent>;
  let isStable: Subject<boolean>;
  let swUpdate: {
    isEnabled: boolean;
    checkForUpdate: jest.Mock<Promise<boolean>, []>;
    activateUpdate: jest.Mock<Promise<void>, []>;
    versionUpdates: Subject<VersionReadyEvent>;
  };
  let notificationService: {
    info: jest.Mock<void, [string, number?]>;
    success: jest.Mock<void, [string, number?]>;
    error: jest.Mock<void, [string, number?]>;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.localStorage.clear();

    versionUpdates = new Subject<VersionReadyEvent>();
    isStable = new Subject<boolean>();
    swUpdate = {
      isEnabled: true,
      checkForUpdate: jest.fn().mockResolvedValue(false),
      activateUpdate: jest.fn().mockResolvedValue(undefined),
      versionUpdates
    };
    notificationService = {
      info: jest.fn(),
      success: jest.fn(),
      error: jest.fn()
    };

    service = new UpdateService(
      swUpdate as unknown as SwUpdate,
      { isStable } as never,
      notificationService as never
    );
  });

  afterEach(() => {
    versionUpdates.complete();
    isStable.complete();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('checks for updates when the app becomes stable', async () => {
    isStable.next(false);
    isStable.next(true);
    await Promise.resolve();

    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('stores the current app version without notifying on first load', () => {
    expect(window.localStorage.getItem('app_version')).toBe(APP_VERSION);
    expect(notificationService.success).not.toHaveBeenCalled();
  });

  it('shows an updated notification when the stored version changed', () => {
    window.localStorage.setItem('app_version', '0.0.9');

    service = new UpdateService(
      swUpdate as unknown as SwUpdate,
      { isStable } as never,
      notificationService as never
    );

    expect(notificationService.success).toHaveBeenCalledWith(
      `The app was updated to version ${APP_VERSION}.`,
      4500
    );
    expect(window.localStorage.getItem('app_version')).toBe(APP_VERSION);
  });

  it('marks an update as pending after a ready event and does not reload automatically', async () => {
    const reloadSpy = jest.spyOn(service as any, 'reloadPage');

    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'old', appData: undefined },
      latestVersion: { hash: 'new', appData: undefined }
    });
    await Promise.resolve();

    expect(swUpdate.activateUpdate).toHaveBeenCalledTimes(1);
    expect(service.updatePending()).toBe(true);
    expect(notificationService.info).toHaveBeenCalledWith(
      'A new version is available. Open About to update.',
      4500
    );
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('reloads only when a pending update exists', async () => {
    const reloadSpy = jest.spyOn(service as any, 'reloadPage').mockImplementation(() => {});

    service.applyPendingUpdate();
    expect(reloadSpy).not.toHaveBeenCalled();

    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'old', appData: undefined },
      latestVersion: { hash: 'new', appData: undefined }
    });
    await Promise.resolve();

    service.applyPendingUpdate();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('shows a manual success message when no update is found', async () => {
    await service.checkForUpdates();

    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(notificationService.info).toHaveBeenCalledWith('No update available.', 2200);
  });

  it('handles manual check failures without throwing', async () => {
    swUpdate.checkForUpdate.mockRejectedValueOnce(new Error('boom'));

    await expect(service.checkForUpdates()).resolves.toBeUndefined();
    expect(notificationService.error).toHaveBeenCalledWith('Could not check for updates.');
  });

  it('skips update checks when the service worker is disabled', async () => {
    service = new UpdateService(
      {
        isEnabled: false,
        checkForUpdate: jest.fn(),
        activateUpdate: jest.fn(),
        versionUpdates: new Subject<VersionReadyEvent>()
      } as unknown as SwUpdate,
      { isStable: new Subject<boolean>() } as never,
      notificationService as never
    );

    await service.checkForUpdates();

    expect(service.updatesEnabled()).toBe(false);
    expect(notificationService.info).toHaveBeenCalledWith(
      'Update checks are unavailable in this build.',
      3200
    );
  });
});
