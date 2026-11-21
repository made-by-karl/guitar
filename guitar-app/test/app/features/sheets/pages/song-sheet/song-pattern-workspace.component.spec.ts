import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MODAL_DATA, MODAL_REF, ModalService } from '@/app/core/services/modal.service';
import { DialogService } from '@/app/core/services/dialog.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { SongPatternWorkspaceComponent, SongPatternWorkspaceData } from '@/app/features/sheets/pages/song-sheet/song-pattern-workspace/song-pattern-workspace.component';
import { createEmptySongSheetPattern } from '@/app/features/sheets/pages/song-sheet/song-sheet.helpers';

describe('SongPatternWorkspaceComponent', () => {
  async function setup(create = false) {
    const pattern = { ...createEmptySongSheetPattern(), name: 'Original' };
    const save = jest.fn().mockResolvedValue(undefined), close = jest.fn(), show = jest.fn();
    const data: SongPatternWorkspaceData = {
      pattern, create, save,
      sheet: { id: 'sheet', name: 'Song', tuning: [], capodaster: 0, tempo: 80, links: [], parts: [], patterns: [pattern], grips: [], created: 0, updated: 0 }
    };
    await TestBed.configureTestingModule({ imports: [SongPatternWorkspaceComponent], providers: [
      { provide: MODAL_DATA, useValue: data }, { provide: MODAL_REF, useValue: { close } },
      { provide: ModalService, useValue: { show } },
      { provide: DialogService, useValue: {} }, { provide: NotificationService, useValue: {} },
      { provide: PatternPlaybackService, useValue: { state$: of({ status: 'idle' }), getSnapshot: () => ({ status: 'idle' }), stopPatternPreview: jest.fn() } }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(SongPatternWorkspaceComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, pattern, save, close, show };
  }

  it('renders required child inputs safely and isolates canceled edits from the source', async () => {
    const { fixture, component, pattern, save, close } = await setup();
    expect(fixture.nativeElement.querySelector('#playingPatternName')).not.toBeNull();
    expect(component.hasUnsavedChanges()).toBe(false);
    component.draft.name = 'Pending';
    component.draft.measures[0].actions[0] = { technique: 'percussive', percussive: { technique: 'body-knock' } };
    expect(component.hasUnsavedChanges()).toBe(true);
    component.cancel();
    expect(pattern.name).toBe('Original');
    expect(pattern.measures[0].actions[0]).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(undefined);
  });

  it('retains the draft after a failed save and blocks navigation and repeat submissions while saving', async () => {
    const { component, save, close } = await setup(true);
    component.draft.name = 'My pattern';
    let reject!: (error: Error) => void;
    save.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    const saving = component.save();
    expect(await component.canLeave()).toBe(false);
    expect(await component.save()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    reject(new Error('storage full'));
    expect(await saving).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(component.error()).toContain('Try again');
    expect(component.draft.name).toBe('My pattern');
    expect(await component.save()).toBe(true);
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ name: 'My pattern' }));
  });

  it.each(['stay', 'discard', 'save'])('guards pattern navigation with %s', async choice => {
    const { component, save, show } = await setup(true);
    component.draft.name = 'My draft';
    show.mockReturnValue({ afterClosed: async () => choice });
    expect(await component.canLeave()).toBe(choice !== 'stay');
    expect(save).toHaveBeenCalledTimes(choice === 'save' ? 1 : 0);
    expect(component.draft.name).toBe('My draft');
  });
});
