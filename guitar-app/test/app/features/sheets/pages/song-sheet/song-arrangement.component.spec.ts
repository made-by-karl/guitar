import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { DialogService } from '@/app/core/services/dialog.service';
import { ModalService } from '@/app/core/services/modal.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { SongArrangementComponent } from '@/app/features/sheets/pages/song-sheet/song-arrangement/song-arrangement.component';
import { SongPartPlaybackService, SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';

describe('SongArrangementComponent', () => {
  let fixture: ComponentFixture<SongArrangementComponent>;
  let sheet: SongSheetWithData;
  let state: BehaviorSubject<SongSheetPlaybackState>;
  const playback = {
    seekSongOccurrence: jest.fn(),
    canPlaySong: jest.fn(() => true),
    canPlaySongPart: jest.fn(() => true),
    stop: jest.fn(), playSongPart: jest.fn(), pauseSongPart: jest.fn(), resumeSongPart: jest.fn(), stopSongPart: jest.fn(), stopSong: jest.fn()
  };
  const service = {
    addOccurrence: jest.fn(), getByIdWithData: jest.fn(), removeOccurrence: jest.fn(), moveOccurrence: jest.fn()
  };
  const modal = { show: jest.fn() };
  const dialogs = { confirm: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    playback.canPlaySongPart.mockReturnValue(true);
    sheet = {
      id: 'song', name: 'Song', tuning: [], capodaster: 0, tempo: 80,
      links: [], grips: [], patterns: [], created: 0, updated: 0,
      parts: [{ id: 'verse', section: 'Verse', notes: '', measures: [] }],
      arrangement: [
        { id: 'v1', partId: 'verse', lyrics: 'First words' },
        { id: 'v2', partId: 'verse', lyrics: 'Second words' }
      ]
    };
    state = new BehaviorSubject<SongSheetPlaybackState>({ type: 'none', status: 'idle' });
    service.getByIdWithData.mockResolvedValue(sheet);
    service.addOccurrence.mockResolvedValue({ id: 'new', partId: 'verse', lyrics: '' });
    modal.show.mockReturnValue({ afterClosed: async () => 'verse' });
    dialogs.confirm.mockResolvedValue(true);
    await TestBed.configureTestingModule({
      imports: [SongArrangementComponent],
      providers: [
        { provide: SongSheetsService, useValue: service },
        { provide: SongPartPlaybackService, useValue: { ...playback, state$: state, getSnapshot: () => state.value } },
        { provide: ModalService, useValue: modal },
        { provide: DialogService, useValue: dialogs },
        { provide: NotificationService, useValue: { error: jest.fn() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(SongArrangementComponent);
    fixture.componentRef.setInput('sheet', sheet);
    fixture.detectChanges();
  });

  function button(label: string): HTMLButtonElement {
    const root: HTMLElement = fixture.nativeElement;
    const element: HTMLButtonElement | undefined = Array.from(
      root.querySelectorAll<HTMLButtonElement>('button')
    ).find((item: HTMLButtonElement) => item.getAttribute('aria-label') === label);
    if (!element) throw new Error(`Missing button: ${label}`);
    return element;
  }

  it('plays each occurrence with its own history and toggles pause and resume', async () => {
    const component = fixture.componentInstance;
    const toggle = jest.spyOn(component, 'toggleOccurrence');
    button('Play Verse, occurrence 2').click();
    await toggle.mock.results[0].value;
    expect(playback.playSongPart).toHaveBeenCalledWith(sheet, sheet.parts[0], 'v2', 'song');
    expect(component.selectedId()).toBeUndefined();

    state.next({ type: 'part', status: 'playing', partId: 'verse', occurrenceId: 'v2' });
    fixture.detectChanges();
    button('Pause Verse, occurrence 2').click();
    expect(playback.pauseSongPart).toHaveBeenCalled();
    expect(button('Play Verse, occurrence 1')).toBeTruthy();
    state.next({ type: 'part', status: 'paused', partId: 'verse', occurrenceId: 'v2' });
    fixture.detectChanges();
    button('Resume Verse, occurrence 2').click();
    expect(playback.resumeSongPart).toHaveBeenCalled();
  });

  it('seeks sections without navigating the selected editor or its draft', () => {
    const component = fixture.componentInstance;
    component.selectedId.set('v2');
    const confirm = jest.spyOn(component, 'confirmNavigation');
    expect(button('Previous part').disabled).toBe(true);
    expect(button('Next part').disabled).toBe(true);
    state.next({ type: 'song', status: 'paused', canPreviousPart: false, canNextPart: true }); fixture.detectChanges();
    button('Next part').click();
    expect(playback.seekSongOccurrence).toHaveBeenLastCalledWith(1);
    state.next({ ...state.value, canPreviousPart: true, canNextPart: false }); fixture.detectChanges();
    button('Previous part').click();
    expect(playback.seekSongOccurrence).toHaveBeenLastCalledWith(-1);
    expect(button('Next part').disabled).toBe(true);
    expect(component.selectedId()).toBe('v2');
    expect(confirm).not.toHaveBeenCalled();
    expect(modal.show).not.toHaveBeenCalled();
  });

  it('disables playback for sections without playable content', () => {
    playback.canPlaySongPart.mockReturnValue(false);
    fixture.componentRef.setInput('sheet', { ...sheet });
    fixture.detectChanges();
    expect(button('Play Verse, occurrence 1').disabled).toBe(true);
    expect(button('Play Verse, occurrence 2').disabled).toBe(true);
  });

  it.each([
    ['Add before first section', null],
    ['Add after section 1', 'v1'],
    ['Add after section 2', 'v2']
  ])('adds existing music at the chosen boundary: %s', async (label, afterId) => {
    const select = jest.spyOn(fixture.componentInstance, 'selectOccurrence').mockResolvedValue();
    const choose = jest.spyOn(fixture.componentInstance, 'chooseSection');
    expect(fixture.nativeElement.querySelectorAll('.occurrence-add-button')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.occurrence-menu')).toBeNull();
    button(label!).click();
    await choose.mock.results[0].value;
    expect(service.addOccurrence).toHaveBeenCalledWith('song', 'verse', afterId);
    expect(select).toHaveBeenCalledWith('new');
  });

  it('adds new music at the chosen boundary and leaves cancellation unchanged', async () => {
    jest.spyOn(fixture.componentInstance, 'selectOccurrence').mockResolvedValue();
    modal.show.mockReturnValueOnce({ afterClosed: async () => 'new' });
    await fixture.componentInstance.chooseSection(null);
    expect(service.addOccurrence).toHaveBeenCalledWith('song', undefined, null);

    service.addOccurrence.mockClear();
    modal.show.mockReturnValueOnce({ afterClosed: async () => undefined });
    await fixture.componentInstance.chooseSection('v1');
    expect(service.addOccurrence).not.toHaveBeenCalled();
  });

  it('keeps unsaved edits when navigation is declined before playing or adding', async () => {
    jest.spyOn(fixture.componentInstance, 'confirmNavigation').mockResolvedValue(false);
    await fixture.componentInstance.toggleOccurrence(sheet.arrangement![1]);
    await fixture.componentInstance.chooseSection(null);
    expect(playback.playSongPart).not.toHaveBeenCalled();
    expect(modal.show).not.toHaveBeenCalled();
    expect(service.addOccurrence).not.toHaveBeenCalled();
  });

  it('deletes an occurrence directly after confirmation, preserving the cancellation path', async () => {
    state.next({ type: 'part', status: 'playing', partId: 'verse', occurrenceId: 'v2' });
    const remove = jest.spyOn(fixture.componentInstance, 'remove');
    button('Delete Verse, occurrence 2').click();
    await remove.mock.results[0].value;
    expect(service.removeOccurrence).toHaveBeenCalledWith('song', 'v2');
    expect(playback.stopSongPart).toHaveBeenCalled();
    service.removeOccurrence.mockClear();
    dialogs.confirm.mockResolvedValueOnce(false);
    await fixture.componentInstance.remove(sheet.arrangement![0]);
    expect(service.removeOccurrence).not.toHaveBeenCalled();
  });

  it('cancels play-view entry before stopping playback or opening an overlay', async () => {
    jest.spyOn(fixture.componentInstance, 'confirmNavigation').mockResolvedValue(false);
    await fixture.componentInstance.openPlayView(document.createElement('button'));
    expect(playback.stop).not.toHaveBeenCalled();
    expect(modal.show).not.toHaveBeenCalled();
  });

  it.each(['playing', 'paused', 'preparing'] as const)('attaches the same %s song snapshot and preserves editor selection on exit', async status => {
    fixture.componentInstance.selectedId.set('v2');
    const snapshot = { ...sheet, name: 'Scheduled snapshot' };
    state.next({ type: 'song', status, songSnapshot: snapshot });
    let close!: () => void;
    const closed = new Promise<void>(resolve => close = resolve);
    modal.show.mockReturnValueOnce({ afterClosed: () => closed, close });
    const opener = document.createElement('button');
    document.body.append(opener);
    const opened = fixture.componentInstance.openPlayView(opener);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(modal.show).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ data: { sheet: snapshot }, panelClass: 'modal-fullscreen' }));
    expect(playback.stop).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-song-playback')).toBeNull();
    close(); await opened; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-song-playback')).not.toBeNull();
    expect(fixture.componentInstance.selectedId()).toBe('v2');
    expect(document.activeElement).toBe(opener);
    expect(playback.stopSong).not.toHaveBeenCalled();
    opener.remove();
  });

  it('stops an unrelated preview only after entry is allowed and starts no audio', async () => {
    state.next({ type: 'part', status: 'playing', source: 'song' });
    modal.show.mockReturnValueOnce({ afterClosed: async () => undefined });
    await fixture.componentInstance.openPlayView(document.createElement('button'));
    expect(playback.stop).toHaveBeenCalledTimes(1);
    expect(playback.playSongPart).not.toHaveBeenCalled();
  });

  it('stops section playback when leaving the arrangement', () => {
    fixture.destroy();
    expect(playback.stopSongPart).toHaveBeenCalled();
  });
});
