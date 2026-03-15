import { Injectable, Injector, TemplateRef, Type, ComponentRef, EmbeddedViewRef, ApplicationRef, createComponent, EnvironmentInjector, ViewContainerRef } from '@angular/core';
import { Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal, TemplatePortal } from '@angular/cdk/portal';
import { Subject } from 'rxjs';

export interface ModalConfig {
  /** Modal title */
  title?: string;
  /** Width of the modal (e.g., '500px', '80%', 'auto') */
  width?: string;
  /** Height of the modal (e.g., '600px', '90vh', 'auto') */
  height?: string;
  /** Maximum width */
  maxWidth?: string;
  /** Maximum height */
  maxHeight?: string;
  /** Whether to close on backdrop click */
  closeOnBackdropClick?: boolean;
  /** Whether to show a backdrop */
  hasBackdrop?: boolean;
  /** Custom CSS classes */
  panelClass?: string | string[];
  /** Data to pass to the component */
  data?: any;
  /** Whether to center the modal */
  centered?: boolean;
}

export interface ModalRef<T = any> {
  /** Close the modal with a result */
  close: (result?: T) => void;
  /** Get the component instance (if using component) */
  componentInstance?: any;
  /** Observable that emits when modal is closed */
  afterClosed: () => Promise<T>;
}

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private overlayRef: OverlayRef | null = null;
  private componentRef: ComponentRef<any> | null = null;
  private closeSubject = new Subject<any>();

  constructor(
    private overlay: Overlay,
    private injector: Injector,
    private appRef: ApplicationRef,
    private environmentInjector: EnvironmentInjector
  ) {}

  /**
   * Show a modal with a component
   */
  show<T>(component: Type<T>, config: ModalConfig = {}): ModalRef {
    return this.showInternal(component, config);
  }

  /**
   * Show a modal with a template
   */
  showTemplate<T>(template: TemplateRef<any>, viewContainerRef: ViewContainerRef, config: ModalConfig = {}): ModalRef {
    return this.showInternal(template, config, viewContainerRef);
  }

  private showInternal<T>(
    componentOrTemplate: Type<T> | TemplateRef<any>,
    config: ModalConfig,
    viewContainerRef?: ViewContainerRef
  ): ModalRef {
    // Close any existing modal
    this.closeInternal();

    // Disable body scroll
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';

    // Create overlay
    this.overlayRef = this.overlay.create(this.getOverlayConfig(config));

    // Handle backdrop click
    if (config.closeOnBackdropClick !== false && config.hasBackdrop !== false) {
      this.overlayRef.backdropClick().subscribe(() => {
        this.closeInternal();
      });
    }

    // Create the modal ref
    const modalRef: ModalRef = {
      close: (result?: any) => {
        this.closeInternal(result);
      },
      afterClosed: () => {
        return new Promise((resolve) => {
          const subscription = this.closeSubject.subscribe((result) => {
            subscription.unsubscribe();
            resolve(result);
          });
        });
      }
    };

    // Attach component or template
    if (componentOrTemplate instanceof TemplateRef) {
      // Template
      if (!viewContainerRef) {
        throw new Error('ViewContainerRef is required for template-based modals');
      }
      const portal = new TemplatePortal(componentOrTemplate, viewContainerRef);
      const embeddedViewRef = this.overlayRef.attach(portal);
      
      // Apply height styling to the root element of the template
      // Don't set display:block as it breaks flexbox layout inside the template
      if (embeddedViewRef && embeddedViewRef.rootNodes && embeddedViewRef.rootNodes.length > 0) {
        const rootElement = embeddedViewRef.rootNodes[0] as HTMLElement;
        if (rootElement && rootElement.style) {
          rootElement.style.height = '100%';
        }
      }
    } else {
      // Component
      const portal = new ComponentPortal(
        componentOrTemplate,
        null,
        this.createInjector(config.data, modalRef)
      );
      const componentRef = this.overlayRef.attach(portal);
      this.componentRef = componentRef;
      modalRef.componentInstance = componentRef.instance;

      // Pass data to component if it has a data property
      if (config.data && componentRef.instance) {
        Object.assign(componentRef.instance, config.data);
      }

      // Apply height styling to the component's host element
      if (componentRef.location && componentRef.location.nativeElement) {
        const hostElement = componentRef.location.nativeElement as HTMLElement;
        hostElement.style.height = '100%';
        hostElement.style.display = 'block';
      }
    }

    return modalRef;
  }

  private closeInternal(result?: any) {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }

    if (this.componentRef) {
      this.componentRef.destroy();
      this.componentRef = null;
    }

    // Re-enable body scroll
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';

    this.closeSubject.next(result);
  }

  private getOverlayConfig(config: ModalConfig): OverlayConfig {
    const positionStrategy = this.overlay
      .position()
      .global();

    if (config.centered !== false) {
      positionStrategy.centerHorizontally().centerVertically();
    }

    // If height is not specified but maxHeight is, use maxHeight as height
    // This ensures the overlay pane has a defined height for flexbox to work
    const height = config.height || config.maxHeight;

    const overlayConfig = new OverlayConfig({
      hasBackdrop: config.hasBackdrop !== false,
      backdropClass: 'modal-backdrop',
      panelClass: this.getPanelClasses(config),
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.block(),
      width: config.width,
      height: height,
      maxWidth: config.maxWidth || '95vw',
      maxHeight: config.maxHeight || '95vh'
    });

    return overlayConfig;
  }

  private getPanelClasses(config: ModalConfig): string[] {
    const classes = ['modal-panel'];
    
    if (config.panelClass) {
      if (Array.isArray(config.panelClass)) {
        classes.push(...config.panelClass);
      } else {
        classes.push(config.panelClass);
      }
    }

    return classes;
  }

  private createInjector(data: any, modalRef: ModalRef): Injector {
    return Injector.create({
      parent: this.injector,
      providers: [
        { provide: MODAL_DATA, useValue: data },
        { provide: MODAL_REF, useValue: modalRef }
      ]
    });
  }

  /**
   * Close the current modal
   */
  close(result?: any) {
    this.closeInternal(result);
  }
}

// Injection tokens for modal data and ref
import { InjectionToken } from '@angular/core';

export const MODAL_DATA = new InjectionToken<any>('ModalData');
export const MODAL_REF = new InjectionToken<ModalRef>('ModalRef');
