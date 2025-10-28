import { Component, Input, Output, EventEmitter, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal-container.component.html',
  styleUrls: ['./modal-container.component.scss']
})
export class ModalContainerComponent {
  @Input() title?: string;
  @Input() showCloseButton = true;
  @Input() showDefaultFooter = false;
  @Input() bodyClass?: string;
  @Input() headerTemplate?: TemplateRef<any>;
  @Input() footerTemplate?: TemplateRef<any>;
  
  @Output() close = new EventEmitter<void>();

  onClose() {
    this.close.emit();
  }
}
