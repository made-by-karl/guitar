import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GripDiagramComponent } from './grip-diagram.component';

describe('GripDiagramComponent', () => {
  let component: GripDiagramComponent;
  let fixture: ComponentFixture<GripDiagramComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GripDiagramComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GripDiagramComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
