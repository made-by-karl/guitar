import { Injectable, ApplicationRef } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { interval, first } from 'rxjs';
import { filter } from 'rxjs/operators';
import { APP_VERSION } from '../../version';
import { DialogService } from '../services/dialog.service'; // fixed path

const VERSION_KEY = 'app_version';
const CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes

@Injectable({ providedIn: 'root' })
export class UpdateService {
  constructor(
    private updates: SwUpdate,
    private appRef: ApplicationRef,
    private dialog: DialogService
  ) {
    this.setupAutoUpdate();
  }

  public checkVersion() {
    try {
      const storedVersion = localStorage.getItem(VERSION_KEY);
      if (storedVersion && storedVersion !== APP_VERSION) {
        console.log(`App version changed from ${storedVersion} to ${APP_VERSION}`);
        this.dialog.alert('A new version is available. Please reload the app.');
      }
      localStorage.setItem(VERSION_KEY, APP_VERSION);
    } catch (e) {
      // Fallback: ignore version check if localStorage is not available
      console.warn('Could not access localStorage for version check:', e);
    }
  }

  private setupAutoUpdate() {
    if (!this.updates.isEnabled) return;

    // Check for updates on app startup
    this.appRef.isStable.pipe(first(stable => stable)).subscribe(() => {
      this.updates.checkForUpdate().catch(err => {
        console.warn('Service worker update check failed:', err);
      });
    });

    // Check every 15 minutes
    interval(CHECK_INTERVAL).subscribe(() => {
      this.updates.checkForUpdate().catch(err => {
        console.warn('Service worker update check failed:', err);
      });
    });

    // Listen for version updates
    this.updates.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => {
        this.updates.activateUpdate().then(() => {
          try {
            localStorage.setItem(VERSION_KEY, APP_VERSION);
          } catch (e) {
            console.warn('Could not update version in localStorage:', e);
          }
        }).catch(err => {
          console.warn('Service worker activation failed:', err);
        });
      });
  }
}