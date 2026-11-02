import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ModalService } from '@/app/core/services/modal.service';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { SongGripsTabComponent } from '@/app/features/sheets/pages/song-sheet/song-grips-tab/song-grips-tab.component';
import { SongSheetLinkEditorModalComponent } from '@/app/features/sheets/pages/song-sheet/song-sheet-link-editor-modal.component';
import { SongPartsTabComponent } from '@/app/features/sheets/pages/song-sheet/song-parts-tab/song-parts-tab.component';
import { SongPatternsTabComponent } from '@/app/features/sheets/pages/song-sheet/song-patterns-tab/song-patterns-tab.component';
import { SongArrangementComponent } from '@/app/features/sheets/pages/song-sheet/song-arrangement/song-arrangement.component';
import { SongSheetComponent } from '@/app/features/sheets/pages/song-sheet/song-sheet.component';
import { SongTuningEditorComponent } from '@/app/features/sheets/pages/song-sheet/song-tuning-editor/song-tuning-editor.component';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';

@Component({ selector: 'app-song-arrangement', standalone: true, template: '' })
class StubSongArrangementComponent {
  @Input() sheet!: SongSheetWithData;
  @Output() changed = new EventEmitter<void>();
}

@Component({ selector: 'app-song-sheet-parts-tab', standalone: true, template: '' })
class StubSongPartsTabComponent {
  @Input() sheet!: SongSheetWithData;
  @Output() changed = new EventEmitter<void>();
}

@Component({ selector: 'app-song-sheet-grips-tab', standalone: true, template: '' })
class StubSongGripsTabComponent {
  @Input() sheet!: SongSheetWithData;
  @Output() changed = new EventEmitter<void>();
}

@Component({ selector: 'app-song-sheet-patterns-tab', standalone: true, template: '' })
class StubSongPatternsTabComponent {
  @Input() sheet!: SongSheetWithData;
  @Output() changed = new EventEmitter<void>();
}

@Component({ selector: 'app-song-tuning-editor', standalone: true, template: '' })
class StubSongTuningEditorComponent {
  @Input() tuning: unknown;
  @Input() semitones: unknown;
  @Input() octaves: unknown;
  @Input() capodaster = 0;
  @Input() tempo = 0;
  @Output() capodasterChange = new EventEmitter<number>();
  @Output() tempoChange = new EventEmitter<number>();
  @Input() saveState = 'saved';
  @Output() changed = new EventEmitter<void>();
  @Output() discard = new EventEmitter<void>();
}

describe('SongSheetComponent', () => {
  const sheet: SongSheetWithData = {
    id: 'sheet-1',
    name: 'Song',
    tuning: [],
    capodaster: 0,
    tempo: 90,
    links: [
      {
        id: 'link-1',
        url: 'https://www.youtube.com/watch?v=abc123',
        description: 'Acoustic tutorial'
      },
      {
        id: 'link-2',
        url: 'https://example.com/tab',
        description: ''
      }
    ],
    grips: [],
    patterns: [],
    parts: [],
    created: 0,
    updated: 0
  };

  async function createComponent(overrides?: {
    sheet?: SongSheetWithData;
    linkEditorResult?: { url: string; description: string } | undefined;
  }) {
    const update = jest.fn().mockResolvedValue(undefined);
    const getByIdWithData = jest.fn().mockResolvedValue(overrides?.sheet ?? sheet);
    const show = jest.fn(() => ({
      afterClosed: jest.fn().mockResolvedValue(overrides?.linkEditorResult),
      close: jest.fn()
    }));

    await TestBed.configureTestingModule({
      imports: [SongSheetComponent],
      providers: [
        {
          provide: SongSheetsService,
          useValue: {
            getByIdWithData,
            update
          }
        },
        {
          provide: SongPartPlaybackService,
          useValue: {
            stopMeasurePreview: jest.fn(),
            stopSongPart: jest.fn(),
            stopSong: jest.fn()
          }
        },
        {
          provide: PatternPlaybackService,
          useValue: {
            stopPatternPreview: jest.fn()
          }
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: 'sheet-1' })
            }
          }
        },
        {
          provide: ModalService,
          useValue: {
            show
          }
        }
      ]
    })
      .overrideComponent(SongSheetComponent, {
        remove: {
          imports: [
            SongPartsTabComponent,
            SongArrangementComponent,
            SongGripsTabComponent,
            SongPatternsTabComponent,
            SongTuningEditorComponent
          ]
        },
        add: {
          imports: [
            StubSongPartsTabComponent,
            StubSongArrangementComponent,
            StubSongGripsTabComponent,
            StubSongPatternsTabComponent,
            StubSongTuningEditorComponent
          ]
        }
      })
      .compileComponents();

    const fixture = TestBed.createComponent(SongSheetComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    return {
      fixture,
      update,
      show
    };
  }

  it('shows the Song tab first and keeps the library and settings tabs and keeps tuning and links in their own panels', async () => {
    const { fixture } = await createComponent();
    const element: HTMLElement = fixture.nativeElement;
    const tabs = Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map(tab => tab.getAttribute('aria-label')))
      .toEqual(['Song', 'Parts', 'Grips', 'Patterns', 'Tempo & Tuning', 'Links']);
    expect(element.querySelector('app-song-arrangement')).not.toBeNull();
    expect(element.querySelector('app-song-tuning-editor')).toBeNull();
    expect(element.querySelector('.sheet-links')).toBeNull();
    expect(element.querySelector('.sheet-meta')).toBeNull();

    const selectors = ['app-song-arrangement', 'app-song-sheet-parts-tab', 'app-song-sheet-grips-tab', 'app-song-sheet-patterns-tab',
      'app-song-tuning-editor', '.sheet-links'];
    const select = jest.spyOn(fixture.componentInstance, 'selectTab');
    for (const [index, tab] of tabs.entries()) {
      tab.click();
      await select.mock.results.at(-1)!.value;
      fixture.detectChanges();
      const panel = element.querySelector('[role="tabpanel"]');
      expect(panel?.id).toBe(tab.getAttribute('aria-controls'));
      expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
      expect(tab.getAttribute('aria-selected')).toBe('true');
      expect(tab.tabIndex).toBe(0);
      expect(tabs.filter(button => button.tabIndex === 0)).toHaveLength(1);
      expect(panel?.querySelector(selectors[index])).not.toBeNull();
      expect(tab.querySelector('i[aria-hidden="true"]')).not.toBeNull();
      expect(tab.title).toBe(tab.getAttribute('aria-label'));
    }
  });

  it('automatically saves tuning changes before switching tabs', async () => {
    const originalSheet: SongSheetWithData = {
      ...sheet, tuning: [{ semitone: 'E', octave: 2 }], capodaster: 1, tempo: 90
    };
    const { fixture, update } = await createComponent({ sheet: originalSheet });
    const component = fixture.componentInstance;
    await component.selectTab('tuning');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-song-tuning-editor')).not.toBeNull();
    component.tempTuning[0].semitone = 'D';
    component.tempCapodaster = 3;
    component.tempTempo = 110;
    const save = component.saveTuning();
    expect(component.tuningSaveState()).toBe('saving');
    await component.selectTab('parts');
    await component.selectTab('tuning');
    await save;
    expect(component.tempTuning[0].semitone).toBe('D');
    expect(component.sheet?.tuning[0].semitone).toBe('D');
    expect(component.sheet?.capodaster).toBe(3);
    expect(component.tuningSaveState()).toBe('saved');
    expect(update).toHaveBeenCalledTimes(1);

  });

  it('saves tuning settings from the tab without sharing mutable tuning notes', async () => {
    const { fixture, update, show } = await createComponent({
      sheet: { ...sheet, tuning: [{ semitone: 'E', octave: 2 }] }
    });
    const component = fixture.componentInstance;
    await component.selectTab('tuning');
    component.tempTuning[0].semitone = 'D';
    component.tempCapodaster = 2;
    component.tempTempo = 110;
    await component.saveTuning();

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      tuning: [{ semitone: 'D', octave: 2 }], capodaster: 2, tempo: 110
    }));
    expect(show).not.toHaveBeenCalled();
    expect(component.activeTab).toBe('tuning');
    component.tempTuning[0].semitone = 'C';
    expect(component.sheet?.tuning[0].semitone).toBe('D');
  });

  it('serializes rapid settings changes and keeps the most recent settings', async () => {
    const { fixture, update } = await createComponent();
    const component = fixture.componentInstance;
    let finishFirst!: () => void;
    update.mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve; }));
    component.tempTempo = 110;
    const first = component.saveTuning();
    component.tempTempo = 120;
    const second = component.saveTuning();
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);
    expect(component.tuningSaveState()).toBe('saving');
    finishFirst();
    await Promise.all([first, second]);
    expect(update.mock.calls.map(([saved]) => saved.tempo)).toEqual([110, 120]);
    expect(component.sheet?.tempo).toBe(120);
    expect(component.tuningSaveState()).toBe('saved');
  });

  it('preserves failed settings edits, prevents navigation and supports retry', async () => {
    const { fixture, update } = await createComponent();
    const component = fixture.componentInstance;
    await component.selectTab('tuning');
    update.mockRejectedValueOnce(new Error('Storage failed'));
    component.tempTempo = 115;
    await component.saveTuning();
    expect(component.tuningSaveState()).toBe('error');
    expect(component.tempTempo).toBe(115);
    await component.selectTab('parts');
    expect(component.activeTab).toBe('tuning');
    await component.saveTuning();
    expect(component.tuningSaveState()).toBe('saved');
    expect(component.sheet?.tempo).toBe(115);
    expect(await component.canDeactivate()).toBe(true);
  });

  it('does not store invalid settings or report them as saved', async () => {
    const { fixture, update } = await createComponent();
    const component = fixture.componentInstance;
    component.tempCapodaster = -1;
    await component.saveTuning();
    expect(component.tuningSaveState()).toBe('invalid');
    expect(update).not.toHaveBeenCalled();
    expect(await component.canDeactivate()).toBe(false);
    component.tempCapodaster = 2;
    await component.saveTuning();
    expect(component.tuningSaveState()).toBe('saved');
  });

  it('can discard invalid settings and leave with the last saved values', async () => {
    const { fixture } = await createComponent();
    const component = fixture.componentInstance;
    component.tempCapodaster = -1;
    await component.saveTuning();
    expect(await component.canDeactivate()).toBe(false);
    await component.discardTuningChanges();
    expect(component.tempCapodaster).toBe(component.sheet?.capodaster);
    expect(component.tuningSaveState()).toBe('saved');
    expect(await component.canDeactivate()).toBe(true);
  });

  it.each([
    { start: 0, key: 'ArrowRight', end: 1 },
    { start: 0, key: 'ArrowLeft', end: 5 },
    { start: 5, key: 'Home', end: 0 },
    { start: 0, key: 'End', end: 5 }
  ])('supports $key keyboard navigation', async ({ start, key, end }) => {
    const { fixture } = await createComponent();
    const element: HTMLElement = fixture.nativeElement;
    const tabs = element.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await fixture.componentInstance.selectTab(fixture.componentInstance.tabs[start].id);
    fixture.detectChanges();
    tabs[start].focus();
    const keydown = jest.spyOn(fixture.componentInstance, 'onTabKeydown');
    tabs[start].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await keydown.mock.results[0].value;
    fixture.detectChanges();
    expect(document.activeElement).toBe(tabs[end]);
    expect(tabs[end].getAttribute('aria-selected')).toBe('true');
    expect(tabs[end].tabIndex).toBe(0);
  });

  it('renders external links with optional descriptions and safe new-window attributes', async () => {
    const { fixture } = await createComponent();
    await fixture.componentInstance.selectTab('links');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const anchors = Array.from(compiled.querySelectorAll('.sheet-link-anchor')) as HTMLAnchorElement[];

    expect(anchors).toHaveLength(2);
    expect(anchors[0].textContent?.trim()).toBe('Acoustic tutorial');
    expect(anchors[0].getAttribute('title')).toBe('https://www.youtube.com/watch?v=abc123');
    expect(anchors[1].textContent?.trim()).toBe('example.com/tab');
    expect(anchors[0].getAttribute('target')).toBe('_blank');
    expect(anchors[0].getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('opens the link editor modal and persists the returned link', async () => {
    const { fixture, update, show } = await createComponent({
      sheet: { ...sheet, links: [] },
      linkEditorResult: {
        url: 'https://example.com/tutorial',
        description: 'Lesson notes'
      }
    });

    await fixture.componentInstance.startAddingLink();

    expect(show).toHaveBeenCalledWith(
      SongSheetLinkEditorModalComponent,
      expect.objectContaining({
        closeOnBackdropClick: false,
        data: {
          title: 'Add Link',
          link: null
        }
      })
    );
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      links: [{
        id: expect.any(String),
        url: 'https://example.com/tutorial',
        description: 'Lesson notes'
      }]
    }));
  });
});
