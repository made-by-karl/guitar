import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogService, DialogConfig } from '../../services/dialog.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.scss']
})
export class DialogComponent implements OnInit, OnDestroy {
  config: DialogConfig | null = null;
  isVisible = false;
  private subscription: Subscription | null = null;

  constructor(private dialogService: DialogService) {}

  ngOnInit() {
    this.subscription = this.dialogService.dialog$.subscribe((config: DialogConfig) => {
      this.config = config;
      this.isVisible = true;
      // Add modal backdrop class to body
      document.body.classList.add('modal-open');
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    // Clean up modal classes
    document.body.classList.remove('modal-open');
  }

  onConfirm() {
    this.hideModal();
    this.dialogService.close(true);
  }

  onCancel() {
    this.hideModal();
    this.dialogService.close(false);
  }

  onBackdropClick(event: Event) {
    // Close dialog when clicking the backdrop
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }

  private hideModal() {
    this.isVisible = false;
    this.config = null;
    // Remove modal backdrop class from body
    document.body.classList.remove('modal-open');
  }

  getVariantClass(): string {
    return this.config?.variant || 'primary';
  }
}
