import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationService } from '@/app/core/services/notification.service';
import { MidiService } from '@/app/core/services/midi.service';
import { PlaybackService } from '@/app/core/services/playback.service';
import { MidiTestComponent } from '@/app/features/maintenance/midi-test/pages/midi-test.component';

describe('MidiTestComponent', () => {
  let fixture: ComponentFixture<MidiTestComponent>;
  let component: MidiTestComponent;
  let mockPlaybackService: jest.Mocked<Pick<PlaybackService, 'playChordFromNotes'>>;
  let mockMidiService: jest.Mocked<Pick<MidiService, 'playPercussionTechnique'>>;
  let mockNotificationService: jest.Mocked<Pick<NotificationService, 'info' | 'error'>>;

  beforeEach(async () => {
    mockPlaybackService = {
      playChordFromNotes: jest.fn().mockResolvedValue(undefined)
    };
    mockMidiService = {
      playPercussionTechnique: jest.fn().mockResolvedValue(undefined)
    };
    mockNotificationService = {
      info: jest.fn(),
      error: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [MidiTestComponent],
      providers: [
        { provide: PlaybackService, useValue: mockPlaybackService },
        { provide: MidiService, useValue: mockMidiService },
        { provide: NotificationService, useValue: mockNotificationService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MidiTestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows a transient playing notification for chord playback', async () => {
    await component.playChord(['E4', 'G#4', 'B4']);

    expect(mockNotificationService.info).toHaveBeenCalledWith('Playing chord: E4, G#4, B4');
    expect(mockPlaybackService.playChordFromNotes).toHaveBeenCalledWith(['E4', 'G#4', 'B4'], 2.0, 0.7, 'normal');
  });

  it('shows an error notification when percussion playback fails', async () => {
    mockMidiService.playPercussionTechnique.mockRejectedValueOnce(new Error('missing sample'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await component.playPercussion('string_slap');

    expect(mockNotificationService.error).toHaveBeenCalledWith('Could not play string slap percussion.');
    consoleErrorSpy.mockRestore();
  });
});
