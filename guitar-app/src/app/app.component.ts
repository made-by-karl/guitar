import { MediaPlaybackControlsComponent } from '@/app/core/ui/media-playback-controls/media-playback-controls.component';
import {Component, OnDestroy, TemplateRef} from '@angular/core';
import {Data, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import { Subscription } from 'rxjs';
import { HtmlAudioPlaybackService } from '@/app/core/services/html-audio-playback.service';
import { ModalService } from '@/app/core/services/modal.service';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {UpdateService} from '@/app/core/services/update.service';
import {ScreenWakeLockService} from '@/app/core/services/screen-wake-lock.service';
import {ConsoleLogStoreService} from '@/app/core/services/console-log-store.service';
import {NotificationSnackbarComponent} from '@/app/core/ui/notification-snackbar/notification-snackbar.component';
import {isPageToolbarProvider} from '@/app/core/ui/page-toolbar-provider';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, FormsModule, RouterLinkActive, NotificationSnackbarComponent, MediaPlaybackControlsComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnDestroy {
  title = 'Guitar Companion';
  isNavbarCollapsed = true;
  pageToolbarTemplate: TemplateRef<object> | null = null;
  pageToolbarContext: object | null = null;
  playbackControls: 'inline' | 'overlay' | 'none' = 'inline';
  private readonly navigation: Subscription;

  constructor(
    private updateService: UpdateService,
    public wakeLockService: ScreenWakeLockService,
    private consoleLogStore: ConsoleLogStoreService,
    private media: HtmlAudioPlaybackService,
    router: Router,
    public readonly modals: ModalService
  ) {
    this.consoleLogStore.installConsoleCapture();
    this.navigation = router.events.subscribe(event => {
      if (event instanceof NavigationStart) this.media.stopAll();
    });
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

  onRouteActivate(component: unknown, data: Data = {}): void {
    const presentation = data['playbackControls'];
    this.playbackControls = presentation === 'overlay' || presentation === 'none' ? presentation : 'inline';
    if (!isPageToolbarProvider(component)) {
      this.clearPageToolbar();
      return;
    }

    this.pageToolbarTemplate = component.toolbarTemplate;
    this.pageToolbarContext = component.toolbarContext ?? null;
  }

  onRouteDeactivate(): void {
    this.clearPageToolbar();
    this.playbackControls = 'inline';
  }

  ngOnDestroy() {
    this.navigation.unsubscribe();
    this.media.stopAll();
    // Release wake lock when app is destroyed
    this.wakeLockService.releaseWakeLock();
  }

  private clearPageToolbar(): void {
    this.pageToolbarTemplate = null;
    this.pageToolbarContext = null;
  }
}
