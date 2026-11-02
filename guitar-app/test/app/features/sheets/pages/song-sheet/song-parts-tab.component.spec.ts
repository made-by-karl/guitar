import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DialogService } from '@/app/core/services/dialog.service';
import { ModalService } from '@/app/core/services/modal.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { SongPartsTabComponent } from '@/app/features/sheets/pages/song-sheet/song-parts-tab/song-parts-tab.component';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { Measure, PlayingAction } from '@/app/features/patterns/services/playing-patterns.model';
import { ResolvedSongPartMeasure, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';

function createMeasure(actions: (PlayingAction | null)[]): Measure {
  return {
    timeSignature: '4/4',
    actions
  };
}

describe('SongPartsTabComponent', () => {
  it('copies a part and shows a success notification', async () => {
    const duplicatePart = jest.fn().mockResolvedValue({
      id: 'part-2',
      section: 'Intro (Copy)',
      lyrics: '',
      notes: '',
      measures: []
    });
    const notificationService = {
      success: jest.fn()
    };
    const songPartPlaybackService = {
      getSnapshot: jest.fn(() => ({ type: 'none', status: 'idle' })),
      canPlaySongPart: jest.fn(() => true),
      canPlayMeasure: jest.fn(() => true),
      state$: of({ type: 'none', status: 'idle' }),
      playSongPart: jest.fn(),
      pauseSongPart: jest.fn(),
      resumeSongPart: jest.fn(),
      stopSongPart: jest.fn(),
      seekSongPartMeasure: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [SongPartsTabComponent],
      providers: [
        { provide: SongSheetsService, useValue: { duplicatePart, resolvePartMeasures: jest.fn(() => []) } },
        { provide: SongPartPlaybackService, useValue: songPartPlaybackService },
        { provide: DialogService, useValue: { confirm: jest.fn() } },
        { provide: ModalService, useValue: { show: jest.fn() } },
        { provide: NotificationService, useValue: notificationService }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(SongPartsTabComponent);
    fixture.componentRef.setInput('sheet', {
      id: 'sheet-1',
      name: 'Song',
      tuning: [],
      capodaster: 0,
      tempo: 80,
      links: [],
      grips: [],
      patterns: [],
      parts: [{ id: 'part-1', section: 'Intro', lyrics: '', notes: '', measures: [] }],
      created: 0,
      updated: 0
    } satisfies SongSheetWithData);

    const emitSpy = jest.spyOn(fixture.componentInstance.changed, 'emit');

    await fixture.componentInstance.copyPart(0);

    expect(duplicatePart).toHaveBeenCalledWith('sheet-1', 0);
    expect(notificationService.success).toHaveBeenCalledWith('Copied part "Intro (Copy)"');
    expect(emitSpy).toHaveBeenCalled();
  });

  it('renders part notes, actions with effective grip labels, and part lyrics', async () => {
    const actions = Array(16).fill(null) as (PlayingAction | null)[];
    actions[0] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    actions[4] = { technique: 'strum', strum: { direction: 'U', strings: 'treble' } };
    const measure = createMeasure(actions);
    const resolvedMeasure: ResolvedSongPartMeasure = {
      measureId: 'measure-1',
      measureIndex: 0,
      measure: {
        ...measure,
        actionGrips: [
          { measureIndex: 0, actionIndex: 0, gripId: 'grip-g', name: 'G' },
          { measureIndex: 0, actionIndex: 4, gripId: 'grip-em', name: 'Em' }
        ]
      }
    };
    const songSheetsService = {
      resolvePartMeasures: jest.fn(() => [resolvedMeasure])
    };
    const songPartPlaybackService = {
      getSnapshot: jest.fn(() => ({ type: 'none', status: 'idle' })),
      canPlaySongPart: jest.fn(() => true),
      canPlayMeasure: jest.fn(() => true),
      state$: of({ type: 'none', status: 'idle' }),
      playSongPart: jest.fn(),
      pauseSongPart: jest.fn(),
      resumeSongPart: jest.fn(),
      stopSongPart: jest.fn(),
      seekSongPartMeasure: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [SongPartsTabComponent],
      providers: [
        { provide: SongSheetsService, useValue: songSheetsService },
        { provide: SongPartPlaybackService, useValue: songPartPlaybackService },
        { provide: DialogService, useValue: { confirm: jest.fn() } },
        { provide: ModalService, useValue: { show: jest.fn() } },
        { provide: NotificationService, useValue: { success: jest.fn() } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(SongPartsTabComponent);
    fixture.componentRef.setInput('sheet', {
      id: 'sheet-1',
      name: 'Song',
      tuning: [],
      capodaster: 0,
      tempo: 80,
      links: [],
      grips: [],
      patterns: [{
        id: 'pattern-1',
        name: 'Country Boom-Chick',
        description: '',
        category: '',
        suggestedGenre: '',
        exampleSong: '',
        measures: [measure],
        actionGrips: [],
        createdAt: 0,
        updatedAt: 0
      }],
      parts: [{
        id: 'part-1',
        section: 'Intro',
        lyrics: 'Walk down slow',
        notes: 'Let the bass ring',
        measures: [{
          id: 'measure-1',
          measure: {
            ...measure,
            actionGrips: []
          }
        }]
      }],
      created: 0,
      updated: 0
    } satisfies SongSheetWithData);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Let the bass ring');
    expect(text).toContain('Walk down slow');
    expect(text).toContain('1 measure(s)');
    expect(text).not.toContain('Country Boom-Chick');

    const gripLabels = Array.from(fixture.nativeElement.querySelectorAll('.action-grip-label'))
      .map((node: any) => node.textContent.trim());
    expect(gripLabels).toEqual(['G', 'Em']);
    songSheetsService.resolvePartMeasures.mockReturnValue([
      resolvedMeasure,
      { measureId: 'measure-2', measureIndex: 1, measure: { ...measure, actionGrips: [] } }
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-playing-actions')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.measure-divider')).toHaveLength(1);

  });

  it('renders empty measure parts without pattern warnings', async () => {
    const songSheetsService = {
      resolvePartMeasures: jest.fn(() => [])
    };
    const songPartPlaybackService = {
      getSnapshot: jest.fn(() => ({ type: 'none', status: 'idle' })),
      canPlaySongPart: jest.fn(() => true),
      canPlayMeasure: jest.fn(() => true),
      state$: of({ type: 'none', status: 'idle' }),
      playSongPart: jest.fn(),
      pauseSongPart: jest.fn(),
      resumeSongPart: jest.fn(),
      stopSongPart: jest.fn(),
      seekSongPartMeasure: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [SongPartsTabComponent],
      providers: [
        { provide: SongSheetsService, useValue: songSheetsService },
        { provide: SongPartPlaybackService, useValue: songPartPlaybackService },
        { provide: DialogService, useValue: { confirm: jest.fn() } },
        { provide: ModalService, useValue: { show: jest.fn() } },
        { provide: NotificationService, useValue: { success: jest.fn() } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(SongPartsTabComponent);
    fixture.componentRef.setInput('sheet', {
      id: 'sheet-1',
      name: 'Song',
      tuning: [],
      capodaster: 0,
      tempo: 80,
      links: [],
      grips: [],
      patterns: [],
      parts: [{
        id: 'part-1',
        section: 'Intro',
        lyrics: '',
        notes: '',
        measures: []
      }],
      created: 0,
      updated: 0
    } satisfies SongSheetWithData);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('0 measure(s)');
    expect(fixture.nativeElement.textContent).not.toContain('missing pattern');
  });
});
