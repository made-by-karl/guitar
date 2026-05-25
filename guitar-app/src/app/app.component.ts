import {Component, OnDestroy, TemplateRef} from '@angular/core';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {UpdateService} from '@/app/core/services/update.service';
import {ScreenWakeLockService} from '@/app/core/services/screen-wake-lock.service';
import {AudioService} from '@/app/core/services/audio.service';
import {ConsoleLogStoreService} from '@/app/core/services/console-log-store.service';
import {NotificationSnackbarComponent} from '@/app/core/ui/notification-snackbar/notification-snackbar.component';
import {isPageToolbarProvider} from '@/app/core/ui/page-toolbar-provider';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, FormsModule, RouterLinkActive, NotificationSnackbarComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnDestroy {
  title = 'Guitar Companion';
  isNavbarCollapsed = true;
  pageToolbarTemplate: TemplateRef<object> | null = null;
  pageToolbarContext: object | null = null;

  constructor(
    private updateService: UpdateService,
    public wakeLockService: ScreenWakeLockService,
    // Instantiate early so auto-resume handlers are installed app-wide
    private audioService: AudioService,
    private consoleLogStore: ConsoleLogStoreService
  ) {
    this.consoleLogStore.installConsoleCapture();
  }

  closeNavbar() {
    this.isNavbarCollapsed = true;
    // Also programmatically close the Bootstrap navbar collapse
    const navbarCollapse = document.getElementById('mainNavbar');
    if (navbarCollapse && navbarCollapse.classList.contains('show')) {
      navbarCollapse.classList.remove('show');
    }
  }

  async toggleKeepScreenOn() {
    await this.wakeLockService.toggleWakeLock();
  }

  isKeepScreenOnActive(): boolean {
    return this.wakeLockService.isWakeLockActive();
  }

  isKeepScreenOnSupported(): boolean {
    return this.wakeLockService.isWakeLockSupported();
  }

  onRouteActivate(component: unknown): void {
    if (!isPageToolbarProvider(component)) {
      this.clearPageToolbar();
      return;
    }

    this.pageToolbarTemplate = component.toolbarTemplate;
    this.pageToolbarContext = component.toolbarContext ?? null;
  }

  onRouteDeactivate(): void {
    this.clearPageToolbar();
  }

  ngOnDestroy() {
    // Release wake lock when app is destroyed
    this.wakeLockService.releaseWakeLock();
  }

  private clearPageToolbar(): void {
    this.pageToolbarTemplate = null;
    this.pageToolbarContext = null;
  }
}
