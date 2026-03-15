import { Injectable } from '@angular/core';

/**
 * Service to manage Screen Wake Lock API
 * Keeps the screen on while the user is viewing song sheets
 */
@Injectable({
  providedIn: 'root'
})
export class ScreenWakeLockService {
  private wakeLock: WakeLockSentinel | null = null;
  private isSupported: boolean = false;

  constructor() {
    // Check if Wake Lock API is supported
    this.isSupported = 'wakeLock' in navigator;
  }

  /**
   * Check if the Wake Lock API is supported in this browser
   */
  isWakeLockSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Request a wake lock to keep the screen on
   */
  async requestWakeLock(): Promise<boolean> {
    if (!this.isSupported) {
      console.warn('Wake Lock API is not supported in this browser');
      return false;
    }

    try {
      // Request a screen wake lock
      this.wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock is active');

      // Listen for wake lock release
      this.wakeLock.addEventListener('release', () => {
        console.log('Wake Lock was released');
      });

      // Handle visibility change - re-request wake lock when page becomes visible
      this.setupVisibilityHandler();

      return true;
    } catch (error) {
      console.error('Failed to request wake lock:', error);
      return false;
    }
  }

  /**
   * Release the wake lock to allow the screen to turn off normally
   */
  async releaseWakeLock(): Promise<void> {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
        console.log('Wake Lock released manually');
      } catch (error) {
        console.error('Failed to release wake lock:', error);
      }
    }
  }

  /**
   * Check if wake lock is currently active
   */
  isWakeLockActive(): boolean {
    return this.wakeLock !== null && !this.wakeLock.released;
  }

  /**
   * Setup handler to re-request wake lock when page becomes visible
   * The wake lock is automatically released when the page is hidden
   */
  private setupVisibilityHandler(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', async () => {
        if (!document.hidden && this.wakeLock?.released) {
          // Wake lock was released, try to re-request it
          console.log('Page became visible, re-requesting wake lock');
          await this.requestWakeLock();
        }
      });
    }
  }

  /**
   * Toggle wake lock on/off
   */
  async toggleWakeLock(): Promise<boolean> {
    if (this.isWakeLockActive()) {
      await this.releaseWakeLock();
      return false;
    } else {
      return await this.requestWakeLock();
    }
  }
}
