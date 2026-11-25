import { ClipboardKind } from '@/app/core/services/music-clipboard.service';
import { ModalService } from '@/app/core/services/modal.service';
import { ClipboardPickerComponent } from './clipboard-picker.component';

export async function pickClipboardEntry(modals: ModalService, kind: ClipboardKind): Promise<number | undefined> {
  const opener = document.activeElement;
  try {
    return await modals.show(ClipboardPickerComponent, { data: { kind }, width: '600px', maxWidth: '95vw', maxHeight: '85vh' }).afterClosed();
  } finally {
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
  }
}
