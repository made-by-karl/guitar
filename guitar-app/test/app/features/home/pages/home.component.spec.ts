import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomeComponent } from '@/app/features/home/pages/home-page/home.component';
import { UpdateService } from '@/app/core/services/update.service';

describe('HomeComponent', () => {
  const updateService = {
    appVersion: '1.2.3',
    updatePending: signal(false),
    checkingForUpdate: signal(false),
    updatesEnabled: signal(true)
  };

  beforeEach(async () => {
    updateService.updatePending.set(false);

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: UpdateService, useValue: updateService }
      ]
    }).compileComponents();
  });

  it('renders the welcome copy and feature entry links', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Guitar Companion');
    expect(root.textContent).toContain('Self-guided guitar practice');
    expect(root.textContent).toContain('Playing Patterns');
    expect(root.textContent).toContain('Start where you need support');
    expect(root.textContent).not.toContain('Open Song Sheets');
    expect(root.textContent).not.toContain('Explore Grips');

    const heroImage = root.querySelector('.hero-image');
    expect(heroImage?.getAttribute('src')).toBe('images/home-hero-banner-v2.png');
  });

  it('shows an update notice only when an update is pending', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();

    let root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).not.toContain('Update available');

    updateService.updatePending.set(true);
    fixture.detectChanges();

    root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Update available');
    expect(root.textContent).toContain('Open About');
  });
});
