import {TestBed} from '@angular/core/testing';
import {AppComponent} from '@/app/app.component';
import {provideRouter, Router} from '@angular/router';
import {SongSheetsService} from '@/app/features/sheets/services/song-sheets.service';
import {UpdateService} from '@/app/core/services/update.service';
import {ScreenWakeLockService} from '@/app/core/services/screen-wake-lock.service';
import {AudioService} from '@/app/core/services/audio.service';
import {Component, TemplateRef, ViewChild} from '@angular/core';
import {of} from 'rxjs';
import {PageToolbarProvider} from '@/app/core/ui/page-toolbar-provider';
import { HtmlAudioPlaybackService } from '@/app/core/services/html-audio-playback.service';

// Mock component for router testing
@Component({ standalone: true, template: '' })
class MockComponent { }

@Component({
  standalone: true,
  template: `
    <p>Toolbar page</p>
    <ng-template #toolbarTemplate>
      <button class="mock-page-toolbar-button" type="button">Toolbar Action</button>
    </ng-template>
  `
})
class MockToolbarPageComponent implements PageToolbarProvider {
  @ViewChild('toolbarTemplate', { static: true }) private templateRef?: TemplateRef<object>;

  get toolbarTemplate(): TemplateRef<object> | null {
    return this.templateRef ?? null;
  }
}

describe('AppComponent', () => {
  let mockSongSheetsService: jest.Mocked<SongSheetsService>;
  let mockUpdateService: jest.Mocked<UpdateService>;
  let mockWakeLockService: jest.Mocked<ScreenWakeLockService>;
  let router: Router;

  beforeEach(async () => {
    // Create mock services
    mockSongSheetsService = {
      getAll: jest.fn().mockReturnValue([]),
      getPinnedSongSheet: jest.fn().mockReturnValue(undefined),
      observePinnedSongSheet: jest.fn().mockReturnValue(of(undefined)),
      pinSongSheet: jest.fn(),
      unpinSongSheet: jest.fn(),
      getSongSheets: jest.fn().mockReturnValue([]),
      getSongSheet: jest.fn(),
      createSongSheet: jest.fn(),
      updateSongSheet: jest.fn(),
      deleteSongSheet: jest.fn()
    } as any;

    mockUpdateService = {
    } as any;

    mockWakeLockService = {
      isWakeLockSupported: jest.fn().mockReturnValue(true),
      isWakeLockActive: jest.fn().mockReturnValue(false),
      toggleWakeLock: jest.fn().mockResolvedValue(true),
      releaseWakeLock: jest.fn().mockResolvedValue(undefined)
    } as any;

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([
          { path: '', component: MockComponent },
          { path: 'sheets', component: MockComponent },
          { path: 'sheets/:id', component: MockComponent },
          { path: 'grips', component: MockComponent },
          { path: 'grips/:chord', component: MockComponent },
          { path: 'patterns', component: MockComponent },
          { path: 'patterns/editor', component: MockComponent },
          { path: 'toolbar', component: MockToolbarPageComponent },
          { path: 'tuner', component: MockComponent },
          { path: 'maintenance/about', component: MockComponent },
          { path: 'maintenance/settings', component: MockComponent },
          { path: 'maintenance/logs', component: MockComponent },
          { path: 'maintenance/midi-test', component: MockComponent, data: { playbackControls: 'overlay' } },
          { path: 'own-playback-controls', component: MockComponent, data: { playbackControls: 'none' } }
        ]),
        { provide: SongSheetsService, useValue: mockSongSheetsService },
        { provide: UpdateService, useValue: mockUpdateService },
        { provide: ScreenWakeLockService, useValue: mockWakeLockService },
        { provide: AudioService, useValue: {} }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'Guitar Companion' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('Guitar Companion');
  });

  it('should render root outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('releases wake lock and playback on app destruction independently of the panel', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    const stop = jest.spyOn(TestBed.inject(HtmlAudioPlaybackService), 'stopAll');

    component.ngOnDestroy();

    expect(mockWakeLockService.releaseWakeLock).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('renders page toolbar content for routes that provide it', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    await fixture.ngZone!.run(async () => {
      await router.navigateByUrl('/toolbar');
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.mock-page-toolbar-button')).toBeTruthy();
    expect(compiled.querySelector('#keepScreenOnSwitch')).toBeTruthy();
  });

  it('clears page toolbar content when navigating to a route without a toolbar', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    await fixture.ngZone!.run(async () => {
      await router.navigateByUrl('/toolbar');
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.mock-page-toolbar-button')).toBeTruthy();

    await fixture.ngZone!.run(async () => {
      await router.navigateByUrl('/sheets');
    });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.mock-page-toolbar-button')).toBeNull();
  });

  it('chooses playback presentation per route and stops audio even when no panel is mounted', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const media = TestBed.inject(HtmlAudioPlaybackService);
    const stop = jest.spyOn(media, 'stopAll');
    fixture.detectChanges();
    await fixture.ngZone!.run(() => router.navigateByUrl('/maintenance/midi-test'));
    fixture.detectChanges();
    expect(fixture.componentInstance.playbackControls).toBe('overlay');
    expect(fixture.nativeElement.querySelector('app-media-playback-controls.overlay')).toBeTruthy();
    await fixture.ngZone!.run(() => router.navigateByUrl('/sheets'));
    fixture.detectChanges();
    expect(fixture.componentInstance.playbackControls).toBe('inline');
    expect(fixture.nativeElement.querySelector('app-media-playback-controls.overlay')).toBeNull();
    await fixture.ngZone!.run(() => router.navigateByUrl('/own-playback-controls'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-media-playback-controls')).toBeNull();
    stop.mockClear();
    await fixture.ngZone!.run(() => router.navigateByUrl('/grips'));
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
