import { A11yModule } from '@angular/cdk/a11y';
import { Component, ElementRef, HostListener, Inject, inject, ViewChild } from '@angular/core';
import { ClipboardKind, MusicClipboardService } from '@/app/core/services/music-clipboard.service';
import { MODAL_DATA, MODAL_REF, ModalComponent, ModalDataComponent, ModalRef } from '@/app/core/services/modal.service';

@Component({
  selector: 'app-clipboard-picker', standalone: true, imports: [A11yModule],
  templateUrl: './clipboard-picker.component.html', styleUrl: './clipboard-picker.component.scss'
})
export class ClipboardPickerComponent implements ModalComponent<number | undefined>, ModalDataComponent<{ kind: ClipboardKind }> {
  readonly clipboard = inject(MusicClipboardService);
  @ViewChild('closeButton') private closeButton?: ElementRef<HTMLButtonElement>;
  remove(id: number): void { this.clipboard.remove(id); this.closeButton?.nativeElement.focus(); }
  get entries() { return this.clipboard.entries().filter(entry => entry.kind === this.data.kind); }
  constructor(@Inject(MODAL_REF) public modalRef: ModalRef<number | undefined>, @Inject(MODAL_DATA) public data: { kind: ClipboardKind }) {}
  @HostListener('keydown.escape', ['$event']) dismiss(event: Event): void { event.stopPropagation(); this.modalRef.close(); }
}
