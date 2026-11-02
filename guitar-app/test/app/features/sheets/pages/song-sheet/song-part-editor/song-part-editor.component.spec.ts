import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MODAL_DATA, MODAL_REF, ModalService } from '@/app/core/services/modal.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { SongPartEditorComponent } from '@/app/features/sheets/pages/song-sheet/song-part-editor/song-part-editor.component';
import { SongPartMeasureEditorModalComponent } from '@/app/features/sheets/pages/song-sheet/song-part-editor/song-part-measure-editor-modal.component';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetPattern, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { createEmptySongSheetPattern } from '@/app/features/sheets/pages/song-sheet/song-sheet.helpers';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';

describe('SongPartEditorComponent', () => {
  it('keeps shared music read-only while allowing lyrics to be saved independently', async () => {
    const part = createPart([createMeasure('m', '4/4')]);
    const sheet = { ...createSheet(), parts: [part], arrangement: [
      { id: 'occurrence-1', partId: part.id, lyrics: 'First' }, { id: 'occurrence-2', partId: part.id, lyrics: 'Second' }
    ] };
    await configureComponent({ part, sheet });
    const fixture = TestBed.createComponent(SongPartEditorComponent), component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.musicLocked()).toBe(true);
    component.updateSectionName('Changed');
    component.updateNotes('Changed');
    component.duplicateMeasure(0);
    component.removeMeasure(0);
    expect(component.tempPart()).toMatchObject({ section: 'Verse', notes: 'note', measures: [expect.objectContaining({ id: 'm' })] });
    component.updateLyrics('Local words');
    await component.save();
    expect(TestBed.inject(SongSheetsService).saveOccurrence).toHaveBeenCalledWith('sheet-1', 'occurrence-1', 'Local words', undefined);
  });

  it('makes a deep independent musical copy with new identities while preserving local lyrics', async () => {
    const part = createPart([createMeasure('m', '4/4')]);
    const sheet = { ...createSheet(), parts: [part], arrangement: [
      { id: 'occurrence-1', partId: part.id, lyrics: 'First' }, { id: 'occurrence-2', partId: part.id, lyrics: 'Second' }
    ] };
    await configureComponent({ part, sheet, modalService: { show: jest.fn(() => ({ afterClosed: async () => 'independent' })) } });
    const fixture = TestBed.createComponent(SongPartEditorComponent), component = fixture.componentInstance;
    component.updateLyrics('Keep my words');
    await component.unlockMusic();
    expect(component.musicLocked()).toBe(false);
    expect(component.tempPart().id).not.toBe(part.id);
    expect(component.tempPart().measures[0].id).not.toBe('m');
    expect(component.tempLyrics()).toBe('Keep my words');
    component.updateNotes('Only this copy');
    expect(part.notes).toBe('note');
    expect(component.data.occurrenceNumber).toBe(1);
  });

  it('opens one selected measure for editing and saves the returned changes', async () => {
    const editedMeasure = {
      timeSignature: '3/4' as const,
      actions: Array(12).fill(null)
    };
    editedMeasure.actions[0] = {
      technique: 'strum',
      strum: { direction: 'D', strings: 'all' },
      modifiers: []
    };
    const show = jest.fn(() => ({
      afterClosed: jest.fn().mockResolvedValue({
        measure: editedMeasure,
        actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'grip-g', name: 'G' }]
      })
    }));

    await TestBed.configureTestingModule({
      imports: [SongPartEditorComponent],
      providers: [
        { provide: MODAL_REF, useValue: { close: jest.fn(), afterClosed: jest.fn() } },
        {
          provide: MODAL_DATA,
          useValue: {
            sheet: createSheet(),
            editingPartIndex: 0,
            part: {
              id: 'part-1',
              section: 'Verse',
              lyrics: 'line',
              notes: 'note',
              measures: [{
                id: 'measure-1',
                measure: { timeSignature: '4/4', actions: Array(16).fill(null), actionGrips: [] }
              }]
            }
          }
        },
        { provide: ModalService, useValue: { show } },
        {
          provide: SongPartPlaybackService,
          useValue: {
            getSnapshot: jest.fn(() => ({ type: 'none', status: 'idle' })),
            canPlaySongPart: jest.fn(() => true),
            canPlayMeasure: jest.fn(() => true),
            state$: of({ type: 'none', status: 'idle' }),
            stopMeasurePreview: jest.fn(),
            stopSongPart: jest.fn(),
            toggleMeasurePreview: jest.fn(),
            playSongPart: jest.fn(),
            pauseSongPart: jest.fn(),
            resumeSongPart: jest.fn(),
            seekSongPartMeasure: jest.fn()
          }
        },
        {
          provide: SongSheetsService,
          useValue: {
            getByIdWithData: jest.fn().mockResolvedValue(createSheet()),
            createEmptyPartMeasure: jest.fn(),
            createMeasuresFromPattern: jest.fn()
          }
        },
        { provide: NotificationService, useValue: { success: jest.fn() } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(SongPartEditorComponent);

    await fixture.componentInstance.editMeasure(0);

    expect(show).toHaveBeenCalledWith(
      SongPartMeasureEditorModalComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          measureLabel: 'Measure 1',
          measureId: 'measure-1',
          part: expect.objectContaining({ id: 'part-1', measures: expect.arrayContaining([
            expect.objectContaining({ id: 'measure-1' })
          ]) })
        })
      })
    );
    expect(fixture.componentInstance.tempPart().measures[0]).toMatchObject({
      measure: {
        ...editedMeasure,
        actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'grip-g', name: 'G' }]
      }
    });
    expect(fixture.componentInstance.tempPart()).toMatchObject({
      lyrics: 'line',
      notes: 'note'
    });
  });

  it('keeps grip editing out of the measure card overview', async () => {
    await TestBed.configureTestingModule({
      imports: [SongPartEditorComponent],
      providers: [
        { provide: MODAL_REF, useValue: { close: jest.fn(), afterClosed: jest.fn() } },
        {
          provide: MODAL_DATA,
          useValue: {
            sheet: createSheet(),
            editingPartIndex: 0,
            part: {
              id: 'part-1',
              section: 'Verse',
              lyrics: '',
              notes: '',
              measures: [{
                id: 'measure-1',
                measure: {
                  timeSignature: '4/4',
                  actions: Array(16).fill(null),
                  actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'grip-g', name: 'G' }]
                }
              }]
            }
          }
        },
        { provide: ModalService, useValue: { show: jest.fn() } },
        {
          provide: SongPartPlaybackService,
          useValue: {
            getSnapshot: jest.fn(() => ({ type: 'none', status: 'idle' })),
            canPlaySongPart: jest.fn(() => true),
            canPlayMeasure: jest.fn(() => true),
            state$: of({ type: 'none', status: 'idle' }),
            stopMeasurePreview: jest.fn(),
            stopSongPart: jest.fn(),
            toggleMeasurePreview: jest.fn(),
            playSongPart: jest.fn(),
            pauseSongPart: jest.fn(),
            resumeSongPart: jest.fn(),
            seekSongPartMeasure: jest.fn()
          }
        },
        {
          provide: SongSheetsService,
          useValue: {
            getByIdWithData: jest.fn().mockResolvedValue(createSheet()),
            createEmptyPartMeasure: jest.fn(),
            createMeasuresFromPattern: jest.fn()
          }
        },
        { provide: NotificationService, useValue: { success: jest.fn() } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    selectTab(fixture.nativeElement, 'Music');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Clear Grips');
    expect(fixture.nativeElement.querySelector('.measure-grips-panel')).toBeNull();
  });

  it('selects a measure and updates the contextual toolbar label', async () => {
    await configureComponent({
      part: createPart([
        createMeasure('measure-1', '4/4'),
        createMeasure('measure-2', '3/4')
      ])
    });

    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    selectTab(fixture.nativeElement, 'Music');
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedMeasureIndex()).toBeNull();
    expect(fixture.nativeElement.querySelector('.selected-measure-toolbar')).toBeNull();

    fixture.nativeElement.querySelectorAll('.measure-row')[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedMeasureIndex()).toBe(1);
    expect(fixture.nativeElement.querySelector('.selected-measure-toolbar')?.textContent).toContain('Measure 2');
  });

  it('clears selection by clicking the selected measure again or dismissing the toolbar', async () => {
    await configureComponent();
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    selectTab(fixture.nativeElement, 'Music');
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const row = element.querySelector<HTMLElement>('.measure-row')!;
    row.click();
    fixture.detectChanges();
    expect(element.querySelector('.selected-measure-toolbar')).not.toBeNull();
    row.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedMeasureIndex()).toBeNull();
    expect(element.querySelector('.selected-measure-toolbar')).toBeNull();
    expect(row.getAttribute('aria-selected')).toBe('false');

    row.click();
    fixture.detectChanges();
    clickButton(element, 'Clear measure selection');
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedMeasureIndex()).toBeNull();
    expect(element.querySelector('.selected-measure-toolbar')).toBeNull();
  });

  it.each(['Enter', ' '])('toggles measure selection using the %s key', async key => {
    await configureComponent();
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    selectTab(fixture.nativeElement, 'Music');
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('.measure-row') as HTMLElement;
    row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedMeasureIndex()).toBe(0);
    row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedMeasureIndex()).toBeNull();
  });

  it('keeps selection empty when measures are reordered or removed', async () => {
    await configureComponent({
      part: createPart([
        createMeasure('measure-1', '4/4'),
        createMeasure('measure-2', '3/4'),
        createMeasure('measure-3', '6/8')
      ])
    });
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    const component = fixture.componentInstance;
    component.selectMeasure(0);
    component.clearMeasureSelection();
    component.dropMeasure({ previousIndex: 0, currentIndex: 0 } as never);
    expect(component.selectedMeasureIndex()).toBeNull();
    component.dropMeasure({ previousIndex: 0, currentIndex: 1 } as never);
    expect(component.selectedMeasureIndex()).toBeNull();
    component.removeMeasure(0);
    expect(component.selectedMeasureIndex()).toBeNull();
    expect(component.tempPart().measures).toHaveLength(2);
  });

  it('runs toolbar edit, duplicate, and remove actions against the selected measure', async () => {
    const show = jest.fn(() => ({
      afterClosed: jest.fn().mockResolvedValue(undefined)
    }));
    const notification = { success: jest.fn() };

    await configureComponent({
      part: createPart([
        createMeasure('measure-1', '4/4'),
        createMeasure('measure-2', '3/4')
      ]),
      modalService: { show },
      notificationService: notification
    });

    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    selectTab(fixture.nativeElement, 'Music');
    fixture.detectChanges();

    fixture.nativeElement.querySelectorAll('.measure-row')[1].click();
    fixture.detectChanges();

    clickButton(fixture.nativeElement, 'Edit selected measure');
    await fixture.whenStable();

    expect(show).toHaveBeenCalledWith(
      SongPartMeasureEditorModalComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          measure: expect.objectContaining({ timeSignature: '3/4' }),
          measureLabel: 'Measure 2'
        })
      })
    );

    clickButton(fixture.nativeElement, 'Duplicate selected measure');
    fixture.detectChanges();

    expect(fixture.componentInstance.tempPart().measures).toHaveLength(3);
    expect(fixture.componentInstance.selectedMeasureIndex()).toBe(2);
    expect(fixture.componentInstance.tempPart().measures[2].measure.timeSignature).toBe('3/4');

    clickButton(fixture.nativeElement, 'Remove selected measure');
    fixture.detectChanges();

    expect(fixture.componentInstance.tempPart().measures).toHaveLength(2);
    expect(fixture.componentInstance.selectedMeasureIndex()).toBe(1);
    expect(notification.success).toHaveBeenCalledWith('Copied measure 2');
  });

  it('selects the nearest remaining measure after removing the selected measure', async () => {
    await configureComponent({
      part: createPart([
        createMeasure('measure-1', '4/4'),
        createMeasure('measure-2', '3/4'),
        createMeasure('measure-3', '6/8')
      ])
    });

    const fixture = TestBed.createComponent(SongPartEditorComponent);

    fixture.componentInstance.selectMeasure(2);
    fixture.componentInstance.removeSelectedMeasure();

    expect(fixture.componentInstance.selectedMeasureIndex()).toBe(1);
    expect(fixture.componentInstance.getSelectedMeasure()?.id).toBe('measure-2');

    fixture.componentInstance.removeSelectedMeasure();

    expect(fixture.componentInstance.selectedMeasureIndex()).toBe(0);
    expect(fixture.componentInstance.getSelectedMeasure()?.id).toBe('measure-1');

    fixture.componentInstance.removeSelectedMeasure();

    expect(fixture.componentInstance.selectedMeasureIndex()).toBeNull();
  });

  it('keeps the same selected measure valid after reordering measures', async () => {
    await configureComponent({
      part: createPart([
        createMeasure('measure-1', '4/4'),
        createMeasure('measure-2', '3/4'),
        createMeasure('measure-3', '6/8')
      ])
    });

    const fixture = TestBed.createComponent(SongPartEditorComponent);

    fixture.componentInstance.selectMeasure(1);
    fixture.componentInstance.dropMeasure({ previousIndex: 1, currentIndex: 0 } as never);

    expect(fixture.componentInstance.selectedMeasureIndex()).toBe(0);
    expect(fixture.componentInstance.getSelectedMeasure()?.id).toBe('measure-2');
  });

  it('opens with Music, keeps notes behind a button and exposes two tabs with matching panels', async () => {
    await configureComponent();
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const tabs = Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

    expect(tabs.map(tab => tab.textContent?.trim())).toEqual(['Music', 'Lyrics']);
    expect(element.querySelector('#partSectionName')).not.toBeNull();
    expect(element.querySelector('#partNotes')).toBeNull();
    expect(element.querySelector('.notes-button')).not.toBeNull();
    expect(element.querySelector('#partLyrics')).toBeNull();
    expect(element.querySelector('.selected-measure-toolbar')).toBeNull();

    for (const tab of tabs) {
      tab.click();
      fixture.detectChanges();
      const panel = element.querySelector('[role="tabpanel"]');
      expect(panel?.id).toBe(tab.getAttribute('aria-controls'));
      expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
      expect(tab.getAttribute('aria-selected')).toBe('true');
      expect(tab.tabIndex).toBe(0);
      expect(tabs.filter(button => button.tabIndex === 0)).toHaveLength(1);
      expect(element.querySelector('.modal-footer')).not.toBeNull();
    }
  });

  it('keeps edits and the selected measure when switching tabs and saves all fields', async () => {
    await configureComponent({
      part: createPart([createMeasure('measure-1', '4/4'), createMeasure('measure-2', '3/4')])
    });
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    fixture.componentInstance.updateNotes('Play softly');
    for (const [id, value] of [['partSectionName', 'Bridge']]) {
      const field = element.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await fixture.whenStable();
    selectTab(element, 'Lyrics');
    fixture.detectChanges();
    const lyrics = element.querySelector<HTMLTextAreaElement>('#partLyrics')!;
    lyrics.value = 'New lyrics';
    lyrics.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();

    selectTab(element, 'Music');
    fixture.detectChanges();
    element.querySelectorAll<HTMLElement>('.measure-row')[1].click();
    selectTab(element, 'Music');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector<HTMLInputElement>('#partSectionName')?.value).toBe('Bridge');
    expect(fixture.componentInstance.tempPart().notes).toBe('Play softly');
    selectTab(element, 'Lyrics');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector<HTMLTextAreaElement>('#partLyrics')?.value).toBe('New lyrics');
    selectTab(element, 'Music');
    fixture.detectChanges();
    expect(element.querySelector('.selected-measure-toolbar')?.textContent).toContain('Measure 2');

    await fixture.componentInstance.save();
    expect(TestBed.inject(SongSheetsService).saveOccurrence).toHaveBeenCalledWith('sheet-1', 'occurrence-1', 'New lyrics',
      expect.objectContaining({ section: 'Bridge', notes: 'Play softly' }));
  });

  it('shows unsaved, saving and saved states while keeping the embedded editor open', async () => {
    await configureComponent();
    TestBed.inject(MODAL_DATA).embedded = true;
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const status = () => element.querySelector('.part-save-status')!.textContent!.trim();
    const saveButton = () => Array.from(element.querySelectorAll<HTMLButtonElement>('.modal-footer button'))
      .find(button => button.textContent!.includes('Save changes'))!;
    expect(status()).toBe('All changes saved');
    expect(saveButton().disabled).toBe(true);
    component.updateLyrics('New words');
    fixture.detectChanges();
    expect(status()).toBe('Unsaved changes');
    expect(saveButton().disabled).toBe(false);

    let finishSave!: () => void;
    jest.mocked(TestBed.inject(SongSheetsService).saveOccurrence).mockImplementationOnce(() => new Promise<void>(resolve => { finishSave = resolve; }));
    const saving = component.save();
    fixture.detectChanges();
    expect(status()).toBe('Saving…');
    finishSave();
    expect(await saving).toBe(true);
    fixture.detectChanges();
    expect(status()).toBe('All changes saved');
    expect(saveButton().disabled).toBe(true);
    expect(component.hasUnsavedChanges()).toBe(false);
    expect(element.querySelector('#partSectionName')).not.toBeNull();
  });

  it('keeps failed saves unsaved and does not allow Save and continue to leave', async () => {
    await configureComponent();
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    const component = fixture.componentInstance;
    component.updateLyrics('Keep these edits');
    jest.mocked(TestBed.inject(ModalService).show).mockReturnValueOnce({ afterClosed: async () => 'save' } as never);
    jest.mocked(TestBed.inject(SongSheetsService).saveOccurrence).mockRejectedValueOnce(new Error('Storage failed'));
    expect(await component.canLeave()).toBe(false);
    fixture.detectChanges();
    expect(component.tempLyrics()).toBe('Keep these edits');
    expect(component.hasUnsavedChanges()).toBe(true);
    expect(component.saving()).toBe(false);
    expect(fixture.nativeElement.querySelector('.part-save-status').textContent).toContain('Could not save');
    expect(TestBed.inject(MODAL_REF).close).not.toHaveBeenCalled();
    expect(await component.save()).toBe(true);
    expect(component.saveError()).toBe('');
    expect(component.hasUnsavedChanges()).toBe(false);
  });

  it('offers Save and close for a new part even before making an edit', async () => {
    await configureComponent();
    const data = TestBed.inject(MODAL_DATA);
    data.occurrence = undefined;
    data.editingPartIndex = null;
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true);
    const element: HTMLElement = fixture.nativeElement;
    const saveButton = Array.from(element.querySelectorAll<HTMLButtonElement>('.modal-footer button'))
      .find(button => button.textContent!.includes('Save and close'))!;
    expect(saveButton.disabled).toBe(false);
    expect(await fixture.componentInstance.save()).toBe(true);
    expect(TestBed.inject(SongSheetsService).addPart).toHaveBeenCalled();
    expect(TestBed.inject(MODAL_REF).close).toHaveBeenCalledWith(true);
  });

  it.each([
    { start: 0, key: 'ArrowRight', end: 1 },
    { start: 0, key: 'ArrowLeft', end: 1 },
    { start: 1, key: 'Home', end: 0 },
    { start: 0, key: 'End', end: 1 }
  ])('supports $key keyboard navigation', async ({ start, key, end }) => {
    await configureComponent();
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const tabs = element.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[start].click();
    fixture.detectChanges();
    tabs[start].focus();
    tabs[start].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(tabs[end]);
    expect(tabs[end].getAttribute('aria-selected')).toBe('true');
    expect(tabs[end].tabIndex).toBe(0);
  });

  it('places playback and close alongside the title and removes the introduction', async () => {
    await configureComponent();
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector('.part-editor-title-row');
    expect(header.textContent).toContain('Edit Song Part');
    expect(header.textContent).toContain('Play');
    expect(header.querySelector('button[aria-label="Close song part editor"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Build the part measure by measure');
    expect(fixture.nativeElement.textContent).not.toContain('Add Measure');
    expect(fixture.nativeElement.textContent).not.toContain('Add Pattern');
  });

  it('inserts a new measure at the clicked boundary and inherits the preceding time signature', async () => {
    const show = jest.fn(() => ({ afterClosed: jest.fn().mockResolvedValue('new-measure') }));
    await configureComponent({
      part: createPart([createMeasure('measure-1', '3/4'), createMeasure('measure-2', '6/8')]),
      modalService: { show }
    });
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    selectTab(fixture.nativeElement, 'Music');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.measure-add-button')).toHaveLength(3);

    clickButton(fixture.nativeElement, 'Add after measure 1');
    await fixture.whenStable();

    expect(TestBed.inject(SongSheetsService).createEmptyPartMeasure).toHaveBeenCalledWith('3/4');
    expect(fixture.componentInstance.tempPart().measures.map(measure => measure.id))
      .toEqual(['measure-1', 'measure-new', 'measure-2']);
    expect(fixture.componentInstance.selectedMeasureIndex()).toBe(1);
    expect(show).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      data: expect.objectContaining({
        title: 'Add after Measure 1',
        choices: expect.arrayContaining([
          { value: 'new-measure', text: 'New measure' },
          { value: 'from-library', text: 'Import pattern from library' },
          { value: 'create-new', text: 'Create new pattern' }
        ])
      })
    }));
  });

  it.each(['new-measure', 'from-sheet'])('inserts %s at position zero before existing measures', async source => {
    const pattern: SongSheetPattern = {
      ...createEmptySongSheetPattern(),
      id: 'pattern-start',
      measures: [createMeasure('unused', '4/4').measure]
    };
    const show = jest.fn()
      .mockReturnValueOnce({ afterClosed: jest.fn().mockResolvedValue(source) })
      .mockReturnValueOnce({ afterClosed: jest.fn().mockResolvedValue(pattern.id) });
    await configureComponent({
      part: createPart([createMeasure('measure-1', '3/4'), createMeasure('measure-2', '6/8')]),
      sheet: { ...createSheet(), patterns: [pattern] },
      modalService: { show }
    });
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.componentInstance.selectMeasure(1);

    await fixture.componentInstance.addContent(0);

    const firstId = source === 'new-measure' ? 'measure-new' : 'pattern-start-0';
    expect(fixture.componentInstance.tempPart().measures.map(measure => measure.id))
      .toEqual([firstId, 'measure-1', 'measure-2']);
    expect(fixture.componentInstance.selectedMeasureIndex()).toBe(0);
  });

  it('adds the first measure through the empty state', async () => {
    await configureComponent({
      part: createPart([]),
      modalService: { show: jest.fn(() => ({ afterClosed: jest.fn().mockResolvedValue('new-measure') })) }
    });
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    selectTab(fixture.nativeElement, 'Music');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.empty-part-state button').click();
    await fixture.whenStable();

    expect(TestBed.inject(SongSheetsService).createEmptyPartMeasure).toHaveBeenCalledWith('4/4');
    expect(fixture.componentInstance.tempPart().measures).toHaveLength(1);
    expect(fixture.componentInstance.selectedMeasureIndex()).toBe(0);
  });

  it.each(['from-sheet', 'from-library', 'create-new'])('inserts all pattern measures in order via %s', async source => {
    const pattern: SongSheetPattern = {
      ...createEmptySongSheetPattern(),
      id: 'pattern-1',
      name: 'Two measures',
      measures: [createMeasure('unused-1', '3/4').measure, createMeasure('unused-2', '6/8').measure]
    };
    const show = jest.fn()
      .mockReturnValueOnce({ afterClosed: jest.fn().mockResolvedValue(source) })
      .mockReturnValueOnce({
        afterClosed: jest.fn().mockResolvedValue(
          source === 'from-sheet' ? pattern.id : source === 'from-library' ? { patterns: [pattern] } : pattern
        )
      });
    const sheet = { ...createSheet(), patterns: [pattern] };
    await configureComponent({
      sheet,
      part: createPart([createMeasure('measure-1', '4/4'), createMeasure('measure-2', '4/4')]),
      modalService: { show }
    });
    const fixture = TestBed.createComponent(SongPartEditorComponent);

    await fixture.componentInstance.addContent(1);

    const measures = fixture.componentInstance.tempPart().measures;
    expect(measures.map(measure => measure.measure.timeSignature)).toEqual(['4/4', '3/4', '6/8', '4/4']);
    expect(measures[0].id).toBe('measure-1');
    expect(measures[3].id).toBe('measure-2');
    expect(fixture.componentInstance.selectedMeasureIndex()).toBe(1);
    expect(show.mock.calls[0][1].data.choices).toContainEqual({
      value: 'from-sheet', text: 'Use existing sheet pattern'
    });
    if (source === 'from-library') {
      expect(TestBed.inject(SongSheetsService).addPatterns).toHaveBeenCalledWith([expect.objectContaining({ name: pattern.name, measures: pattern.measures })], sheet.id);
    } else if (source === 'create-new') {
      expect(TestBed.inject(SongSheetsService).addPattern).toHaveBeenCalledWith(expect.objectContaining({ name: pattern.name, measures: pattern.measures }), sheet.id);
    }
  });

  it.each([undefined, 'from-sheet', 'from-library', 'create-new'])('leaves measures and selection unchanged when canceling %s', async source => {
    const show = jest.fn()
      .mockReturnValueOnce({ afterClosed: jest.fn().mockResolvedValue(source) })
      .mockReturnValueOnce({ afterClosed: jest.fn().mockResolvedValue(undefined) });
    await configureComponent({
      sheet: { ...createSheet(), patterns: [createEmptySongSheetPattern()] },
      modalService: { show }
    });
    const fixture = TestBed.createComponent(SongPartEditorComponent);
    const originalPart = fixture.componentInstance.tempPart();

    await fixture.componentInstance.addContent(1);

    expect(fixture.componentInstance.tempPart()).toEqual(originalPart);
    expect(fixture.componentInstance.selectedMeasureIndex()).toBeNull();
    expect(TestBed.inject(SongSheetsService).addPattern).not.toHaveBeenCalled();
    expect(TestBed.inject(SongSheetsService).addPatterns).not.toHaveBeenCalled();
  });

  it('shows one empty state add button without the contextual toolbar', async () => {
    await configureComponent({
      part: createPart([])
    });

    const fixture = TestBed.createComponent(SongPartEditorComponent);
    fixture.detectChanges();
    selectTab(fixture.nativeElement, 'Music');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No measures yet.');
    expect(fixture.nativeElement.querySelector('.selected-measure-toolbar')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.empty-part-state .btn')).toHaveLength(1);
  });
});

async function configureComponent(options: {
  part?: ReturnType<typeof createPart>;
  sheet?: SongSheetWithData;
  modalService?: Partial<ModalService>;
  notificationService?: Partial<NotificationService>;
} = {}) {
  await TestBed.configureTestingModule({
    imports: [SongPartEditorComponent],
    providers: [
      { provide: MODAL_REF, useValue: { close: jest.fn(), afterClosed: jest.fn() } },
      {
        provide: MODAL_DATA,
        useValue: {
          sheet: options.sheet ?? createSheet(),
          editingPartIndex: 0,
          part: options.part ?? createPart([createMeasure('measure-1', '4/4')]),
          occurrence: { id: 'occurrence-1', partId: options.part?.id ?? 'part-1', lyrics: options.part?.lyrics ?? 'line' }
        }
      },
      { provide: ModalService, useValue: { show: jest.fn(), ...options.modalService } },
      {
        provide: SongPartPlaybackService,
        useValue: {
          getSnapshot: jest.fn(() => ({ type: 'none', status: 'idle' })),
          canPlaySongPart: jest.fn(() => true),
          canPlayMeasure: jest.fn(() => true),
          state$: of({ type: 'none', status: 'idle' }),
          stopMeasurePreview: jest.fn(),
          stopSongPart: jest.fn(),
          toggleMeasurePreview: jest.fn(),
          playSongPart: jest.fn(),
          pauseSongPart: jest.fn(),
          resumeSongPart: jest.fn(),
          seekSongPartMeasure: jest.fn()
        }
      },
      {
        provide: SongSheetsService,
        useValue: {
          getByIdWithData: jest.fn().mockResolvedValue(options.sheet ?? createSheet()),
          createEmptyPartMeasure: jest.fn(timeSignature => createMeasure('measure-new', timeSignature)),
          createMeasuresFromPattern: jest.fn((pattern: SongSheetPattern) => pattern.measures.map((measure, index) => ({
            id: `${pattern.id}-${index}`, measure
          }))),
          addPattern: jest.fn(),
          addPatterns: jest.fn(),
          addPart: jest.fn(),
          updatePart: jest.fn(),
          saveOccurrence: jest.fn()
        }
      },
      { provide: NotificationService, useValue: { success: jest.fn(), ...options.notificationService } }
    ]
  }).compileComponents();
}

function selectTab(element: HTMLElement, label: string): void {
  const tab = Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    .find(button => button.textContent?.trim() === label);
  expect(tab).toBeDefined();
  tab?.click();
}

function clickButton(element: HTMLElement, ariaLabel: string): void {
  const button = element.querySelector<HTMLButtonElement>(`button[aria-label="${ariaLabel}"]`);
  expect(button).not.toBeNull();
  button?.click();
}

function createPart(measures: ReturnType<typeof createMeasure>[]) {
  return {
    id: 'part-1',
    section: 'Verse',
    lyrics: 'line',
    notes: 'note',
    measures
  };
}

function createMeasure(id: string, timeSignature: '3/4' | '4/4' | '6/8') {
  return {
    id,
    measure: {
      timeSignature,
      actions: Array(timeSignature === '3/4' ? 12 : timeSignature === '6/8' ? 6 : 16).fill(null),
      actionGrips: []
    }
  };
}

function createSheet(): SongSheetWithData {
  return {
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
  };
}
