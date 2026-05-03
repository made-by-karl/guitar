import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { UpdateService } from '@/app/core/services/update.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div>
          <h2 class="mb-1"><i class="bi bi-info-circle me-2"></i>About</h2>
          <p class="text-muted mb-0">Version and update status for the installed app.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <dl class="row mb-4">
            <dt class="col-sm-4 text-muted">Application</dt>
            <dd class="col-sm-8">My Guitar Sheets</dd>

            <dt class="col-sm-4 text-muted">Current version</dt>
            <dd class="col-sm-8"><code>{{ updateService.appVersion }}</code></dd>

            <dt class="col-sm-4 text-muted">Update status</dt>
            <dd class="col-sm-8">{{ statusText() }}</dd>
          </dl>

          <div class="d-flex flex-wrap align-items-center gap-2">
            @if (updateService.updatesEnabled()) {
              <button
                class="btn"
                type="button"
                [class.btn-primary]="updateService.updatePending()"
                [class.btn-outline-primary]="!updateService.updatePending()"
                [disabled]="isActionDisabled()"
                (click)="handleAction()">
                @if (updateService.updatePending()) {
                  Update
                } @else if (updateService.checkingForUpdate()) {
                  Searching...
                } @else {
                  Search for update
                }
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    dt,
    dd {
      margin-bottom: 0.75rem;
    }
  `]
})
export class AboutComponent {
  protected readonly updateService = inject(UpdateService);

  protected readonly statusText = computed(() => {
    if (this.updateService.updatePending()) {
      return 'A new version is ready. Reload when convenient to apply it.';
    }

    if (this.updateService.checkingForUpdate()) {
      return 'Checking for updates...';
    }

    if (!this.updateService.updatesEnabled()) {
      return 'Automatic update checks are unavailable in this build.';
    }

    return 'No pending update. You are using the latest loaded version.';
  });

  protected isActionDisabled(): boolean {
    return !this.updateService.updatePending()
      && (!this.updateService.updatesEnabled() || this.updateService.checkingForUpdate());
  }

  protected async handleAction(): Promise<void> {
    if (this.updateService.updatePending()) {
      this.updateService.applyPendingUpdate();
      return;
    }

    await this.updateService.checkForUpdates();
  }
}
