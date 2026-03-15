import { TestBed } from '@angular/core/testing';
import { AppComponent } from '@/app/app.component';
import { provideRouter, Router } from '@angular/router';
import { SongSheetsService } from '@/app/services/song-sheets.service';
import { UpdateService } from '@/app/services/update.service';
import { ScreenWakeLockService } from '@/app/services/screen-wake-lock.service';
import { AudioService } from '@/app/services/audio.service';
import { Component } from '@angular/core';
import { of } from 'rxjs';

// Mock component for router testing
@Component({ template: '' })
class MockComponent { }

describe('AppComponent', () => {
  let mockSongSheetsService: jest.Mocked<SongSheetsService>;
  let mockUpdateService: jest.Mocked<UpdateService>;
  let mockWakeLockService: jest.Mocked<ScreenWakeLockService>;

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
      checkVersion: jest.fn()
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
          { path: 'song-sheets', component: MockComponent },
          { path: 'song-sheets/:id', component: MockComponent },
          { path: 'chord', component: MockComponent },
          { path: 'rhythm-patterns', component: MockComponent },
          { path: 'settings', component: MockComponent },
          { path: 'midi-test', component: MockComponent }
        ]),
        { provide: SongSheetsService, useValue: mockSongSheetsService },
        { provide: UpdateService, useValue: mockUpdateService },
        { provide: ScreenWakeLockService, useValue: mockWakeLockService },
        { provide: AudioService, useValue: {} }
      ]
    }).compileComponents();
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

  it('should unpin song sheet when navigating to song sheets page', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    
    await router.navigate(['/song-sheets']);
    fixture.detectChanges();
    
    expect(mockSongSheetsService.unpinSongSheet).toHaveBeenCalled();
  });

  it('should NOT unpin song sheet when navigating to chord page', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    
    mockSongSheetsService.unpinSongSheet.mockClear();
    
    await router.navigate(['/chord']);
    fixture.detectChanges();
    
    expect(mockSongSheetsService.unpinSongSheet).not.toHaveBeenCalled();
  });

  it('should NOT unpin song sheet when navigating to rhythm patterns page', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    
    mockSongSheetsService.unpinSongSheet.mockClear();
    
    await router.navigate(['/rhythm-patterns']);
    fixture.detectChanges();
    
    expect(mockSongSheetsService.unpinSongSheet).not.toHaveBeenCalled();
  });

  it('should unpin song sheet when navigating to settings page', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    
    mockSongSheetsService.unpinSongSheet.mockClear();
    
    await router.navigate(['/settings']);
    fixture.detectChanges();
    
    expect(mockSongSheetsService.unpinSongSheet).toHaveBeenCalled();
  });

  it('should release wake lock on destroy', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    
    component.ngOnDestroy();
    
    expect(mockWakeLockService.releaseWakeLock).toHaveBeenCalled();
  });
});
