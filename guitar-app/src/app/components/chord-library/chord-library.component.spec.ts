import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ChordLibraryComponent } from './chord-library.component';

describe('ChordLibraryComponent', () => {
  let component: ChordLibraryComponent;
  let fixture: ComponentFixture<ChordLibraryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChordLibraryComponent, HttpClientTestingModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChordLibraryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
