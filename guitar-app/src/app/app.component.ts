import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SongSheetsService } from './services/song-sheets.service';
import { SongSheet } from './services/song-sheets.model';
import { UpdateService } from './services/update.service';
import { ScreenWakeLockService } from './services/screen-wake-lock.service';
import { timer, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterViewInit, OnDestroy {
  title = 'My Guitar Sheets';
  isNavbarCollapsed = true;
  private routerSubscription?: Subscription;
  private pinnedSheetSubscription?: Subscription;
  pinnedSongSheet: SongSheet | undefined;

  constructor(
    public songSheetsService: SongSheetsService,
    private updateService: UpdateService,
    public wakeLockService: ScreenWakeLockService,
    private router: Router
  ) {
    this.setupRouterListener();
    this.subscribeToPinnedSheet();
  }

  private subscribeToPinnedSheet() {
    this.pinnedSheetSubscription = this.songSheetsService.observePinnedSongSheet()
      .subscribe(sheet => {
        this.pinnedSongSheet = sheet;
      });
  }

  ngAfterViewInit(): void {
    timer(1).subscribe(() => {
      this.updateService.checkVersion();
    });
  }

  /**
   * Setup router event listener to automatically unpin song sheets
   * when navigating away from chord and rhythm pattern pages
   */
  private setupRouterListener(): void {
    this.routerSubscription = this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd)
      )
      .subscribe((event: NavigationEnd) => {
        // Check if the current URL is NOT the chord or rhythm pattern page
        const url = event.urlAfterRedirects;
        const isChordPage = url.includes('/chord');
        const isRhythmPatternPage = url.includes('/rhythm-patterns');
        
        // If navigating away from chord/rhythm pattern pages, unpin the song sheet
        if (!isChordPage && !isRhythmPatternPage) {
          this.songSheetsService.unpinSongSheet();
        }
      });
  }

  get pinnedSheetId(): string | null {
    return this.pinnedSongSheet?.id ?? null;
  }
  set pinnedSheetId(id: string | null) {
    if (id) {
      this.songSheetsService.pinSongSheet(id);
    } else {
      this.songSheetsService.unpinSongSheet();
    }
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
    // Unsubscribe from router events
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    
    // Unsubscribe from pinned sheet observable
    if (this.pinnedSheetSubscription) {
      this.pinnedSheetSubscription.unsubscribe();
    }
    
    // Release wake lock when app is destroyed
    this.wakeLockService.releaseWakeLock();
  }
}
