import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlaybackHighlight } from '@/app/core/services/playback-highlight';
import { PlaybackHighlightDirective } from '@/app/core/ui/playback-highlight/playback-highlight.directive';
import { PlayingActionsComponent } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { Measure } from '@/app/features/patterns/services/playing-patterns.model';
import { BehaviorSubject, Observable } from 'rxjs';

@Component({
  imports: [PlayingActionsComponent, PlaybackHighlightDirective],
  template: '<app-playing-actions [measures]="measures" [appPlaybackHighlight]="position()" />'
})
class DrawingHost {
  readonly measures: Measure[] = [{ timeSignature: '4/4', actions: [null, null, null, null] }];
  readonly position = signal<PlaybackHighlight | undefined | Observable<PlaybackHighlight | undefined>>(undefined);
}

it('renders clock emissions immediately and releases replaced/destroyed subscriptions', async () => {
  await TestBed.configureTestingModule({ imports: [DrawingHost] }).compileComponents();
  const fixture = TestBed.createComponent(DrawingHost);
  const source = new BehaviorSubject<PlaybackHighlight | undefined>(undefined);
  fixture.componentInstance.position.set(source);
  fixture.detectChanges();
  source.next({ measureIndex: 0, actionIndex: 1, status: 'playing' });
  // No fixture.detectChanges: the media callback must update the DOM before
  // returning, rather than leaving this slot for another application render.
  expect(fixture.nativeElement.querySelector('.playback-action-slot').dataset.slotIndex).toBe('1');
  source.next({ measureIndex: 0, actionIndex: 2, status: 'paused' });
  expect(fixture.nativeElement.querySelector('.playback-action-slot').dataset.slotIndex).toBe('2');
  expect(fixture.nativeElement.querySelector('.playback-paused')).not.toBeNull();
  const replacement = new BehaviorSubject<PlaybackHighlight | undefined>(undefined);
  fixture.componentInstance.position.set(replacement);
  fixture.detectChanges();
  expect(source.observed).toBe(false);
  source.next({ measureIndex: 0, actionIndex: 3, status: 'playing' });
  expect(fixture.nativeElement.querySelector('.playback-action-slot')).toBeNull();
  replacement.next({ measureIndex: 0, actionIndex: 0, status: 'playing' });
  expect(fixture.nativeElement.querySelector('.playback-action-slot').dataset.slotIndex).toBe('0');
  replacement.next(undefined);
  expect(fixture.nativeElement.querySelector('.playback-action-slot')).toBeNull();
  fixture.destroy();
  expect(replacement.observed).toBe(false);
});

it('binds resolved positions through the drawing interface and clears the previous marker', async () => {
  await TestBed.configureTestingModule({ imports: [DrawingHost] }).compileComponents();
  const fixture = TestBed.createComponent(DrawingHost);
  fixture.detectChanges();
  fixture.componentInstance.position.set({ measureIndex: 0, actionIndex: 0, status: 'playing' });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('.playback-action-slot').dataset.slotIndex).toBe('0');
  fixture.componentInstance.position.set({ measureIndex: 0, actionIndex: 2, status: 'paused' });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelectorAll('.playback-action-slot')).toHaveLength(1);
  expect(fixture.nativeElement.querySelector('.playback-action-slot').dataset.slotIndex).toBe('2');
  expect(fixture.nativeElement.querySelector('.playback-paused')).not.toBeNull();
  fixture.componentInstance.position.set(undefined);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('.playback-action-slot')).toBeNull();
});
