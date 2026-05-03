import { Injectable, ApplicationRef, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { interval, first } from 'rxjs';
import { filter } from 'rxjs/operators';
import { APP_VERSION } from '@/version';
import { NotificationService } from '@/app/core/services/notification.service';

const CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes
const VERSION_KEY = 'app_version';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  readonly appVersion = APP_VERSION;

  private readonly _updatePending = signal(false);
  readonly updatePending = this._updatePending.asReadonly();

  private readonly _checkingForUpdate = signal(false);
  readonly checkingForUpdate = this._checkingForUpdate.asReadonly();

  private readonly _updatesEnabled = signal(false);
  readonly updatesEnabled = this._updatesEnabled.asReadonly();

  constructor(
    private updates: SwUpdate,
    private appRef: ApplicationRef,
    private notificationService: NotificationService
  ) {
    this._updatesEnabled.set(this.updates.isEnabled);
    this.syncStoredVersion();
    this.setupAutoUpdate();
  }

  async checkForUpdates(options?: { silent?: boolean }): Promise<void> {
    if (!this.updatesEnabled()) {
      if (!options?.silent) {
        this.notificationService.info('Update checks are unavailable in this build.', 3200);
      }
      return;
    }

    if (this.updatePending()) {
      if (!options?.silent) {
        this.notificationService.info('A new version is ready. Open About to apply it.', 3200);
      }
      return;
    }

    if (this.checkingForUpdate()) {
      return;
    }

    this._checkingForUpdate.set(true);

    try {
      const updateFound = await this.updates.checkForUpdate();
      if (!updateFound && !options?.silent) {
        this.notificationService.info('No update available.', 2200);
      }
    } catch (err) {
      console.warn('Service worker update check failed:', err);
      if (!options?.silent) {
        this.notificationService.error('Could not check for updates.');
      }
    } finally {
      this._checkingForUpdate.set(false);
    }
  }

  applyPendingUpdate(): void {
    if (!this.updatePending()) {
      return;
    }

    this.reloadPage();
  }

  private setupAutoUpdate(): void {
    if (!this.updatesEnabled()) return;

    // Check for updates on app startup
    this.appRef.isStable.pipe(first(stable => stable)).subscribe(() => {
      void this.checkForUpdates({ silent: true });
    });

    // Check every 15 minutes
    interval(CHECK_INTERVAL).subscribe(() => {
      void this.checkForUpdates({ silent: true });
    });

    // Listen for version updates
    this.updates.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => {
        this.updates.activateUpdate().then(() => {
          if (!this._updatePending()) {
            this._updatePending.set(true);
            this.notificationService.info('A new version is available. Open About to update.', 4500);
          }
        }).catch(err => {
          console.warn('Service worker activation failed:', err);
        });
      });
  }

  private reloadPage(): void {
    window.location.reload();
  }

  private syncStoredVersion(): void {
    try {
      const storedVersion = localStorage.getItem(VERSION_KEY);
      if (storedVersion && storedVersion !== this.appVersion) {
        this.notificationService.success(`The app was updated to version ${this.appVersion}.`, 4500);
      }

      localStorage.setItem(VERSION_KEY, this.appVersion);
    } catch (err) {
      console.warn('Could not access localStorage for app version tracking:', err);
    }
  }
}
