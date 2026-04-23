import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DialogService } from '@/app/core/services/dialog.service';
import { ModalService } from '@/app/core/services/modal.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { SongPatternsTabComponent } from '@/app/features/sheets/pages/song-sheet/song-patterns-tab/song-patterns-tab.component';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';

describe('SongPatternsTabComponent', () => {
  it('copies a sheet pattern and shows a success notification', async () => {
    const duplicatePattern = jest.fn().mockResolvedValue({
      id: 'pattern-2',
      name: 'Verse Pattern (Copy)',
      description: '',
      category: '',
      suggestedGenre: '',
      exampleSong: '',
      measures: [],
      actionGrips: [],
      createdAt: 0,
      updatedAt: 0
    });
    const notificationService = {
      success: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [SongPatternsTabComponent],
      providers: [
        {
          provide: SongSheetsService,
          useValue: {
            duplicatePattern,
            movePattern: jest.fn(),
            addPatterns: jest.fn(),
            addPattern: jest.fn()
          }
        },
        {
          provide: PatternPlaybackService,
          useValue: {
            getSnapshot: jest.fn(() => ({ status: 'idle' })),
            state$: of({ status: 'idle' }),
            togglePatternPreview: jest.fn(),
            stopPatternPreview: jest.fn()
          }
        },
        {
          provide: SongPartPlaybackService,
          useValue: {
            stopMeasurePreview: jest.fn(),
            stopSongPart: jest.fn()
          }
        },
        { provide: DialogService, useValue: { alert: jest.fn() } },
        { provide: ModalService, useValue: { show: jest.fn() } },
        { provide: NotificationService, useValue: notificationService }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(SongPatternsTabComponent);
    fixture.componentRef.setInput('sheet', {
      id: 'sheet-1',
      name: 'Song',
      tuning: [],
      capodaster: 0,
      tempo: 90,
      grips: [],
      patterns: [{
        id: 'pattern-1',
        name: 'Verse Pattern',
        description: '',
        category: '',
        suggestedGenre: '',
        exampleSong: '',
        measures: [],
        actionGrips: [],
        createdAt: 0,
        updatedAt: 0
      }],
      parts: [],
      created: 0,
      updated: 0
    } satisfies SongSheetWithData);

    const emitSpy = jest.spyOn(fixture.componentInstance.changed, 'emit');

    await fixture.componentInstance.copyPattern('pattern-1');

    expect(duplicatePattern).toHaveBeenCalledWith('sheet-1', 'pattern-1', 'Copy');
    expect(notificationService.success).toHaveBeenCalledWith('Copied pattern "Verse Pattern (Copy)"');
    expect(emitSpy).toHaveBeenCalled();
  });
});
