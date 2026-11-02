import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { MODAL_DATA, MODAL_REF, ModalService } from '@/app/core/services/modal.service';
import {
  SongPartMeasureEditorModalComponent,
  SongPartMeasureEditorModalData
} from '@/app/features/sheets/pages/song-sheet/song-part-editor/song-part-measure-editor-modal.component';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { SongPartPlaybackService, SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';

describe('SongPartMeasureEditorModalComponent', () => {
  const close = jest.fn();
  const state = new BehaviorSubject<SongSheetPlaybackState>({ type: 'none', status: 'idle' });
  const playback = {
    state$: state.asObservable(),
    getSnapshot: () => state.value,
    canPlayMeasure: jest.fn(() => true),
    toggleMeasurePreview: jest.fn().mockResolvedValue(undefined),
    stopMeasurePreview: jest.fn()
  };
  const data: SongPartMeasureEditorModalData = {
    part: {
      id: 'part-1', section: 'Verse', lyrics: '', notes: '',
      measures: [{ id: 'measure-1', measure: { timeSignature: '4/4', actions: [] } }]
    },
    measureId: 'measure-1',
    sheet: {
      id: 'sheet-1',
      name: 'Song',
      tuning: [],
      capodaster: 0,
      tempo: 90,
      links: [],
      grips: [],
      patterns: [],
      parts: [],
      created: 0,
      updated: 0
    },
    measure: {
      timeSignature: '4/4',
      actions: Array(16).fill(null)
    },
    actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'grip-c', name: 'C' }],
    measureLabel: 'Measure 1'
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    state.next({ type: 'none', status: 'idle' });
    playback.canPlayMeasure.mockReturnValue(true);

    await TestBed.configureTestingModule({
      imports: [SongPartMeasureEditorModalComponent],
      providers: [
        { provide: MODAL_REF, useValue: { close, afterClosed: jest.fn() } },
        { provide: MODAL_DATA, useValue: data },
        { provide: ModalService, useValue: { show: jest.fn() } },
        { provide: SongPartPlaybackService, useValue: playback },
        { provide: SongSheetsService, useValue: { addGrip: jest.fn(), addGrips: jest.fn(), getByIdWithData: jest.fn() } }
      ]
    }).compileComponents();
  });

  it('previews the latest unsaved measure and grip edits in the original part context', async () => {
    const fixture = TestBed.createComponent(SongPartMeasureEditorModalComponent);
    const component = fixture.componentInstance;
    component.editedMeasure.actions[0] = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    component.editedActionGrips = [];
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[aria-label="Play measure"]');
    expect(button.disabled).toBe(false);
    button.click();
    await fixture.whenStable();
    expect(playback.toggleMeasurePreview).toHaveBeenCalledWith(data.sheet, {
      ...data.part,
      measures: [{ id: 'measure-1', measure: { ...component.editedMeasure, actionGrips: [] } }]
    }, 'measure-1', undefined);
    expect(data.measure.actions[0]).toBeNull();
    expect(data.part.measures[0].measure.actions).toEqual([]);
  });

  it('disables silent playback, keeps Stop available after edits, and stops on destruction', () => {
    const fixture = TestBed.createComponent(SongPartMeasureEditorModalComponent);
    playback.canPlayMeasure.mockReturnValue(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Play measure"]').disabled).toBe(true);
    state.next({ type: 'measure', status: 'playing', partId: 'part-1', measureId: 'measure-1' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Stop measure"]').disabled).toBe(false);
    fixture.destroy();
    expect(playback.stopMeasurePreview).toHaveBeenCalledTimes(1);
  });

  it('leaves playback of a different measure running when destroyed', () => {
    const fixture = TestBed.createComponent(SongPartMeasureEditorModalComponent);
    state.next({ type: 'measure', status: 'playing', partId: 'part-1', measureId: 'another' });
    fixture.destroy();
    expect(playback.stopMeasurePreview).not.toHaveBeenCalled();
  });

  it('saves edited measure data without mutating the source before save', () => {
    const fixture = TestBed.createComponent(SongPartMeasureEditorModalComponent);
    const component = fixture.componentInstance;

    component.editedMeasure.actions[0] = {
      technique: 'strum',
      strum: { direction: 'D', strings: 'all' },
      modifiers: []
    };
    component.editedActionGrips = [
      { measureIndex: 0, actionIndex: 0, gripId: 'grip-g', name: 'G' }
    ];

    expect(data.measure.actions[0]).toBeNull();

    component.save();

    expect(close).toHaveBeenCalledWith({
      measure: expect.objectContaining({
        timeSignature: '4/4',
        actions: expect.arrayContaining([
          {
            technique: 'strum',
            strum: { direction: 'D', strings: 'all' },
            modifiers: []
          }
        ])
      }),
      actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'grip-g', name: 'G' }]
    });
  });

  it('closes without a result on cancel', () => {
    const fixture = TestBed.createComponent(SongPartMeasureEditorModalComponent);

    fixture.componentInstance.cancel();

    expect(close).toHaveBeenCalledWith(undefined);
  });
});
