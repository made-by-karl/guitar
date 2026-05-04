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
          { path: 'maintenance/midi-test', component: MockComponent }
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

  it(`should have the 'My Guitar Sheets' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('My Guitar Sheets');
  });

  it('should render root outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('should release wake lock on destroy', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;

    component.ngOnDestroy();

    expect(mockWakeLockService.releaseWakeLock).toHaveBeenCalled();
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
});
