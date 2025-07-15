import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { provideRouter } from '@angular/router';
import { SongSheetsService } from './services/song-sheets.service';
import { Component } from '@angular/core';

// Mock component for router testing
@Component({ template: '' })
class MockComponent { }

describe('AppComponent', () => {
  let mockSongSheetsService: jest.Mocked<SongSheetsService>;

  beforeEach(async () => {
    // Create mock service
    mockSongSheetsService = {
      getAll: jest.fn().mockReturnValue([]),
      getPinnedSongSheet: jest.fn().mockReturnValue(undefined),
      pinSongSheet: jest.fn(),
      unpinSongSheet: jest.fn(),
      getSongSheets: jest.fn().mockReturnValue([]),
      getSongSheet: jest.fn(),
      createSongSheet: jest.fn(),
      updateSongSheet: jest.fn(),
      deleteSongSheet: jest.fn()
    } as any;

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([
          { path: 'song-sheets', component: MockComponent },
          { path: 'chord', component: MockComponent },
          { path: 'rhythm-patterns', component: MockComponent },
          { path: 'settings', component: MockComponent },
          { path: 'midi-test', component: MockComponent }
        ]),
        { provide: SongSheetsService, useValue: mockSongSheetsService }
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
});
