import {AfterViewInit, Component, OnDestroy} from '@angular/core';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {UpdateService} from '@/app/core/services/update.service';
import {ScreenWakeLockService} from '@/app/core/services/screen-wake-lock.service';
import {AudioService} from '@/app/core/services/audio.service';
import {timer} from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, FormsModule, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterViewInit, OnDestroy {
  title = 'My Guitar Sheets';
  isNavbarCollapsed = true;

  constructor(
    private updateService: UpdateService,
    public wakeLockService: ScreenWakeLockService,
    // Instantiate early so auto-resume handlers are installed app-wide
    private audioService: AudioService
  ) {
  }

  ngAfterViewInit(): void {
    timer(1).subscribe(() => {
      this.updateService.checkVersion();
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

  ngOnDestroy() {
    // Release wake lock when app is destroyed
    this.wakeLockService.releaseWakeLock();
  }
}
