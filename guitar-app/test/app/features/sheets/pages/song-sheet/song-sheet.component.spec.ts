import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ModalService } from '@/app/core/services/modal.service';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { SongGripsTabComponent } from '@/app/features/sheets/pages/song-sheet/song-grips-tab/song-grips-tab.component';
import { SongSheetLinkEditorModalComponent } from '@/app/features/sheets/pages/song-sheet/song-sheet-link-editor-modal.component';
import { SongPartsTabComponent } from '@/app/features/sheets/pages/song-sheet/song-parts-tab/song-parts-tab.component';
import { SongPatternsTabComponent } from '@/app/features/sheets/pages/song-sheet/song-patterns-tab/song-patterns-tab.component';
import { SongSheetComponent } from '@/app/features/sheets/pages/song-sheet/song-sheet.component';
import { SongTuningEditorComponent } from '@/app/features/sheets/pages/song-sheet/song-tuning-editor/song-tuning-editor.component';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';

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
  @Output() cancel = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
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
            stopSongPart: jest.fn()
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
            show,
            showTemplate: jest.fn(() => ({
              afterClosed: jest.fn().mockResolvedValue(undefined),
              close: jest.fn()
            }))
          }
        }
      ]
    })
      .overrideComponent(SongSheetComponent, {
        remove: {
          imports: [
            SongPartsTabComponent,
            SongGripsTabComponent,
            SongPatternsTabComponent,
            SongTuningEditorComponent
          ]
        },
        add: {
          imports: [
            StubSongPartsTabComponent,
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

  it('renders external links with optional descriptions and safe new-window attributes', async () => {
    const { fixture } = await createComponent();

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
