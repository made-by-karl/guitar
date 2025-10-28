# Modal Service Developer Guide

A comprehensive guide for creating and using modal dialogs in the application.

## Table of Contents
- [Quick Start](#quick-start)
- [Creating a Modal Component](#creating-a-modal-component)
- [Using the Modal Service](#using-the-modal-service)
- [Configuration Options](#conf### 3. Component Lifecycle

Modal components### 5. Passing Data

**Two ways to pass data:**e created dynamically:
- Use `ngOnInit()` for initialization
- Access injected `MODAL_DATA` in the constructor
- Clean up subscriptions in `ngOnDestroy()`

### 4. Template-Based Modals

When using template-based modals, you must inject `ViewContainerRef`:

```typescript
import { ViewContainerRef, ViewChild, TemplateRef } from '@angular/core';

export class MyComponent {
  @ViewChild('myModal') modalTemplate!: TemplateRef<any>;
  
  constructor(
    private modalService: ModalService,
    private viewContainerRef: ViewContainerRef
  ) {}
  
  openModal() {
    const modalRef = this.modalService.showTemplate(
      this.modalTemplate,
      this.viewContainerRef,
      { width: '600px' }
    );
  }
}
```

**Why ViewContainerRef is required:**
- Template portals need a view container to render into
- The ViewContainerRef tells Angular where the template belongs in the component tree
- This ensures proper change detection and dependency injection context

### 5. Passing Datan-options)
- [Important Considerations](#important-considerations)
- [Common Patterns](#common-patterns)
- [Dialog Service](#dialog-service)

## Quick Start

### Opening a Modal

```typescript
import { ModalService } from './services/modal.service';

constructor(private modalService: ModalService) {}

async openMyModal() {
  const modalRef = this.modalService.show(MyModalComponent, {
    width: '800px',
    height: '600px',
    data: { key: 'value' }
  });

  const result = await modalRef.afterClosed();
  if (result) {
    // Handle result
  }
}
```

## Creating a Modal Component

### 1. Component Structure

Create three separate files for your modal component:

**my-modal.component.ts**
```typescript
import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MODAL_REF, MODAL_DATA, ModalRef } from '../../services/modal.service';

export interface MyModalData {
  title: string;
  // Add your data properties
}

@Component({
  selector: 'app-my-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-modal.component.html',
  styleUrls: ['./my-modal.component.scss']
})
export class MyModalComponent {
  constructor(
    @Inject(MODAL_REF) private modalRef: ModalRef<any>,
    @Inject(MODAL_DATA) public data: MyModalData
  ) {}

  onSave() {
    this.modalRef.close({ success: true, data: /* your result */ });
  }

  onCancel() {
    this.modalRef.close(null);
  }
}
```

**my-modal.component.html**
```html
<div class="modal-content-wrapper">
  <div class="modal-header">
    <h5 class="modal-title">{{ data.title }}</h5>
    <button type="button" class="btn-close" (click)="onCancel()"></button>
  </div>
  
  <div class="modal-body">
    <!-- Your content here -->
  </div>
  
  <div class="modal-footer">
    <button class="btn btn-secondary" type="button" (click)="onCancel()">
      Cancel
    </button>
    <button class="btn btn-primary" type="button" (click)="onSave()">
      Save
    </button>
  </div>
</div>
```

**my-modal.component.scss**
```scss
:host {
  display: block;
  height: 100%;
}

.modal-content-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid #dee2e6;
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 500;
}

.modal-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 1rem;
  min-height: 0;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 1rem;
  border-top: 1px solid #dee2e6;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  opacity: 0.5;
  padding: 0;
  width: 1em;
  height: 1em;

  &:hover {
    opacity: 1;
  }

  &::before {
    content: '×';
    display: block;
  }
}
```

### 2. Template Syntax

Use modern Angular control flow syntax:

```html
<!-- Use @if instead of *ngIf -->
@if (condition) {
  <div>Content</div>
}

@if (condition) {
  <div>True content</div>
} @else {
  <div>False content</div>
}

<!-- Use @for instead of *ngFor -->
@for (item of items; track item.id) {
  <div>{{ item.name }}</div>
}
```

## Using the Modal Service

### Import

```typescript
import { ModalService, MODAL_REF, MODAL_DATA, ModalRef } from './services/modal.service';
```

### Show Modal

```typescript
const modalRef = this.modalService.show(MyComponent, {
  width: '800px',
  height: '600px',
  data: { key: 'value' },
  closeOnBackdropClick: false
});
```

### Show Template-Based Modal

For template-based modals, you need to inject `ViewContainerRef` and pass it to the service:

```typescript
import { ViewContainerRef } from '@angular/core';

constructor(
  private modalService: ModalService,
  private viewContainerRef: ViewContainerRef
) {}

openModal() {
  const modalRef = this.modalService.showTemplate(
    this.myTemplate,
    this.viewContainerRef,
    {
      width: '800px',
      closeOnBackdropClick: true
    }
  );
}
```

### Get Result

```typescript
// Using await
const result = await modalRef.afterClosed();

// Using promise
modalRef.afterClosed().then(result => {
  if (result) {
    // Handle result
  }
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | string | 'auto' | Modal width (e.g., '500px', '80%') |
| `height` | string | 'auto' | Modal height (e.g., '600px', '90vh') |
| `maxWidth` | string | '95vw' | Maximum width |
| `maxHeight` | string | '95vh' | Maximum height |
| `closeOnBackdropClick` | boolean | true | Close when clicking backdrop |
| `hasBackdrop` | boolean | true | Show backdrop |
| `panelClass` | string \| string[] | - | Custom CSS classes |
| `data` | any | - | Data to pass to component |
| `centered` | boolean | true | Center the modal |

### Panel Class Variants

Predefined size variants you can use:

- `modal-sm` - Small modal (300px max width)
- `modal-lg` - Large modal (800px max width)
- `modal-xl` - Extra large modal (1140px max width)
- `modal-fullscreen` - Fullscreen modal

Example:
```typescript
this.modalService.show(MyComponent, {
  panelClass: 'modal-lg'
});
```

## Important Considerations

### 1. Scrolling in Modal Body

To ensure proper scrolling in the modal body:

**Required CSS Structure:**
```scss
.modal-content-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.modal-body {
  flex: 1 1 auto;      // Allow body to grow/shrink
  overflow-y: auto;     // Enable scrolling
  min-height: 0;        // Critical for flexbox scrolling
}
```

**Required Configuration:**
When opening a modal, you should specify either `height` or `maxHeight`:
```typescript
this.modalService.showTemplate(template, viewContainerRef, {
  width: '600px',
  maxHeight: '90vh'  // This ensures the modal has a defined height
});
```

**Why this matters:**
- The modal service uses `height` if specified, otherwise falls back to `maxHeight`
- This gives the CDK overlay pane a defined height (e.g., `90vh`)
- The `.modal-panel` global class applies `height: 100%` to fill that space
- For templates, the service applies `height: 100%` to the root element (`.modal-content-wrapper`)
- The wrapper uses flexbox with `display: flex` and `flex-direction: column`
- The body uses `flex: 1 1 auto` and `min-height: 0` for proper scrolling
- Without this complete chain, scrolling won't work correctly for long content

### 2. Component Lifecycle

Modal components are created dynamically:
- Use `ngOnInit()` for initialization
- Access injected `MODAL_DATA` in the constructor
- Clean up subscriptions in `ngOnDestroy()`

### 3. Passing Data

**Two ways to pass data:**

**Option 1: Via config.data (preferred)**
```typescript
modalRef = this.modalService.show(MyComponent, {
  data: { item: myItem }
});

// In component
constructor(@Inject(MODAL_DATA) public data: { item: Item }) {}
```

**Option 2: Via component instance**
```typescript
const modalRef = this.modalService.show(MyComponent, {});
if (modalRef.componentInstance) {
  modalRef.componentInstance.pattern = myPattern;
}
```

### 6. Type Safety

Use generics for type-safe results:

```typescript
interface SaveResult {
  success: boolean;
  data: MyData;
}

// In component
constructor(
  @Inject(MODAL_REF) private modalRef: ModalRef<SaveResult>
) {}

onSave() {
  this.modalRef.close({ success: true, data: this.myData });
}

// In caller
const result = await modalRef.afterClosed();
if (result?.success) {
  // TypeScript knows about success and data properties
}
```

## Common Patterns

### Edit Modal

```typescript
async editItem(item: Item) {
  const modalRef = this.modalService.show(ItemEditorComponent, {
    width: '800px',
    data: { item: { ...item } } // Pass a copy
  });

  const result = await modalRef.afterClosed();
  if (result) {
    // Update item with result
    Object.assign(item, result);
  }
}
```

### Create Modal

```typescript
async createItem() {
  const modalRef = this.modalService.show(ItemEditorComponent, {
    width: '800px',
    data: { item: this.getDefaultItem() }
  });

  const result = await modalRef.afterClosed();
  if (result) {
    this.items.push(result);
  }
}
```

### Fullscreen Editor

```typescript
async openFullscreenEditor() {
  const modalRef = this.modalService.show(EditorComponent, {
    width: '95vw',
    height: '95vh',
    maxWidth: '1200px',
    panelClass: 'modal-xl',
    closeOnBackdropClick: false
  });

  const result = await modalRef.afterClosed();
  return result;
}
```

### Prevent Accidental Close

```typescript
const modalRef = this.modalService.show(MyComponent, {
  closeOnBackdropClick: false  // User must click Cancel or Save
});
```

## Dialog Service

The `DialogService` provides convenient methods for common dialogs:

### Import

```typescript
import { DialogService } from './services/dialog.service';

constructor(private dialogService: DialogService) {}
```

### Confirm Dialog

```typescript
const confirmed = await this.dialogService.confirm(
  'Are you sure you want to delete this item?',
  'Confirm Delete',
  'Delete',
  'Cancel',
  { variant: 'danger' }
);

if (confirmed) {
  // User confirmed
}
```

### Alert Dialog

```typescript
await this.dialogService.alert(
  'Operation completed successfully!',
  'Success',
  'OK',
  { variant: 'success' }
);
```

### Variants

- `primary` - Default blue (default)
- `danger` - Red for destructive actions
- `warning` - Yellow for warnings
- `success` - Green for success messages

## Examples

### Example 1: Simple Confirm Dialog

```typescript
async deletePattern(pattern: RhythmPattern) {
  const confirmed = await this.dialogService.confirm(
    `Delete pattern "${pattern.name}"?`,
    'Confirm Delete',
    'Delete',
    'Cancel',
    { variant: 'danger' }
  );

  if (confirmed) {
    this.patterns = this.patterns.filter(p => p.id !== pattern.id);
  }
}
```

### Example 2: Edit Modal with Validation

```typescript
async editPattern(pattern: RhythmPattern) {
  const modalRef = this.modalService.show(RhythmPatternEditorModalComponent, {
    width: '95vw',
    height: '95vh',
    maxWidth: '1200px',
    closeOnBackdropClick: false
  });

  if (modalRef.componentInstance) {
    modalRef.componentInstance.pattern = { ...pattern };
  }

  const result = await modalRef.afterClosed();
  
  if (result) {
    // Validate result
    if (!result.name || result.beats.length === 0) {
      await this.dialogService.alert(
        'Pattern must have a name and at least one beat.',
        'Validation Error',
        'OK',
        { variant: 'warning' }
      );
      return;
    }

    // Update pattern
    Object.assign(pattern, result);
  }
}
```

### Example 3: Custom Modal Container Component

```typescript
// Using the ModalContainerComponent for consistent layout
@Component({
  selector: 'app-my-content-modal',
  standalone: true,
  imports: [CommonModule, ModalContainerComponent],
  template: `
    <app-modal-container
      [title]="'My Modal Title'"
      [showCloseButton]="true"
      [showDefaultFooter]="true"
      (close)="onClose()">
      
      <!-- Modal body content -->
      <div>
        <p>Your content here</p>
      </div>

      <!-- Footer buttons -->
      <div modal-footer>
        <button class="btn btn-secondary" (click)="onClose()">Cancel</button>
        <button class="btn btn-primary" (click)="onSave()">Save</button>
      </div>
    </app-modal-container>
  `
})
export class MyContentModalComponent {
  constructor(@Inject(MODAL_REF) private modalRef: ModalRef) {}

  onSave() {
    this.modalRef.close({ saved: true });
  }

  onClose() {
    this.modalRef.close(null);
  }
}
```

### Example 4: Template-Based Modal

```typescript
import { Component, ViewChild, TemplateRef, ViewContainerRef } from '@angular/core';
import { ModalService, ModalRef } from './services/modal.service';

@Component({
  selector: 'app-chord-viewer',
  templateUrl: './chord-viewer.component.html'
})
export class ChordViewerComponent {
  @ViewChild('modifierModal') modifierModalTemplate!: TemplateRef<any>;
  
  selectedModifiers: string[] = [];
  modifiers = ['m', '7', 'maj7', 'sus2', 'sus4'];
  
  private modalRef: ModalRef | null = null;

  constructor(
    private modalService: ModalService,
    private viewContainerRef: ViewContainerRef
  ) {}

  openModifierModal() {
    this.modalRef = this.modalService.showTemplate(
      this.modifierModalTemplate,
      this.viewContainerRef,
      {
        width: '800px',
        maxHeight: '90vh',
        closeOnBackdropClick: true
      }
    );
  }

  closeModifierModal() {
    if (this.modalRef) {
      this.modalRef.close();
      this.modalRef = null;
    }
  }

  toggleModifier(modifier: string) {
    const index = this.selectedModifiers.indexOf(modifier);
    if (index > -1) {
      this.selectedModifiers.splice(index, 1);
    } else {
      this.selectedModifiers.push(modifier);
    }
  }
}
```

**Template:**
```html
<button (click)="openModifierModal()">Select Modifiers</button>

<ng-template #modifierModal>
  <div class="modal-content-wrapper">
    <div class="modal-header">
      <h5 class="modal-title">Select Modifiers</h5>
      <button type="button" class="btn-close" (click)="closeModifierModal()"></button>
    </div>
    
    <div class="modal-body">
      @for (modifier of modifiers; track modifier) {
        <label>
          <input type="checkbox" 
                 [checked]="selectedModifiers.includes(modifier)"
                 (change)="toggleModifier(modifier)">
          {{ modifier }}
        </label>
      }
    </div>
    
    <div class="modal-footer">
      <button class="btn btn-secondary" (click)="closeModifierModal()">
        Close
      </button>
    </div>
  </div>
</ng-template>
```

This approach is perfect when:
- The modal needs to modify component state directly
- You want to avoid creating a separate modal component
- The modal logic is tightly coupled to the parent component

## Best Practices

1. **Always use separate files** - Split components into `.ts`, `.html`, and `.scss` files
2. **Use modern syntax** - Use `@if`, `@for` instead of `*ngIf`, `*ngFor`
3. **Type your data** - Define interfaces for modal data and results
4. **Handle null results** - User might close modal without saving
5. **Use SCSS nesting** - Take advantage of SCSS features for cleaner styles
6. **Prevent accidental closes** - Set `closeOnBackdropClick: false` for important forms
7. **Follow the CSS structure** - Use the provided flexbox structure for proper scrolling
8. **Clean up resources** - Implement `ngOnDestroy()` if you have subscriptions

## Troubleshooting

### Modal body won't scroll
- Ensure `:host { height: 100% }` is set
- Verify `.modal-content-wrapper` has `height: 100%`
- Check that `.modal-body` has `flex: 1 1 auto` and `min-height: 0`

### Modal doesn't close on backdrop click
- Check `closeOnBackdropClick` is not set to `false`
- Verify you're not stopping event propagation in your component

### Data not available in component
- Ensure you're injecting `MODAL_DATA` correctly
- Check that data is passed in the config when opening the modal

### Modal appears off-center
- Set `centered: true` in config (it's true by default)
- Check for custom CSS that might affect positioning
