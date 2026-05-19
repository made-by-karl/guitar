import { TestBed } from '@angular/core/testing';
import { MODAL_DATA, MODAL_REF } from '@/app/core/services/modal.service';
import { SongSheetLinkEditorModalComponent } from '@/app/features/sheets/pages/song-sheet/song-sheet-link-editor-modal.component';

describe('SongSheetLinkEditorModalComponent', () => {
  async function createComponent() {
    const modalRef = {
      close: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [SongSheetLinkEditorModalComponent],
      providers: [
        {
          provide: MODAL_REF,
          useValue: modalRef
        },
        {
          provide: MODAL_DATA,
          useValue: {
            title: 'Add Link',
            link: null
          }
        }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(SongSheetLinkEditorModalComponent);
    fixture.detectChanges();

    return {
      fixture,
      modalRef
    };
  }

  it('rejects invalid URLs without closing the modal', async () => {
    const { fixture, modalRef } = await createComponent();

    fixture.componentInstance.url = 'ftp://example.com/tutorial';
    fixture.componentInstance.description = 'Unsupported protocol';
    fixture.componentInstance.save();
    fixture.detectChanges();

    expect(modalRef.close).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Enter a valid http(s) URL.');
  });
});
