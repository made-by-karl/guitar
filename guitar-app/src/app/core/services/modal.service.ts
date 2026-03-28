import {
  Injectable,
  Injector,
  TemplateRef,
  ComponentRef,
  ViewContainerRef,
  InjectionToken
} from '@angular/core';
import { Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal, ComponentType, TemplatePortal } from '@angular/cdk/portal';
import { Subject, firstValueFrom, take } from 'rxjs';

/* =========================
   Types
========================= */

export interface ModalConfig<TData = any> {
  title?: string;
  width?: string;
  height?: string;
  maxWidth?: string;
  maxHeight?: string;
  closeOnBackdropClick?: boolean;
  hasBackdrop?: boolean;
  panelClass?: string | string[];
  data?: TData;
  centered?: boolean;
}

export interface ModalRef<TResult = unknown, TComponent = unknown> {
  close: (result?: TResult) => void;
  afterClosed: () => Promise<TResult>;
}

export interface ComponentModalRef<TResult, TComponent>
  extends ModalRef<TResult, TComponent> {
  componentInstance: TComponent;
}

export interface ModalComponent<TResult = unknown> {
  modalRef: ModalRef<TResult>;
}

type ExtractResult<T> = T extends ModalComponent<infer R> ? R : unknown;

export interface ModalDataComponent<TData = unknown> {
  data: TData;
}

type ExtractData<T> = T extends ModalDataComponent<infer D> ? D : unknown;

/* =========================
   Injection Tokens
========================= */

export const MODAL_DATA = new InjectionToken<any>('ModalData');
export const MODAL_REF = new InjectionToken<ModalRef>('ModalRef');

/* =========================
   Internal Model
========================= */

interface ModalInstance {
  overlayRef: OverlayRef;
  componentRef?: ComponentRef<any>;
  closeSubject: Subject<any>;
}

/* =========================
   Service
========================= */

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private modals: ModalInstance[] = [];
  private openModals = 0;

  constructor(
    private overlay: Overlay,
    private injector: Injector
  ) {}

  /* =========================
     Public API
  ========================= */

  show<TComponent extends ModalComponent<any>>(
    component: ComponentType<TComponent>,
    config: ModalConfig<ExtractData<TComponent>> = {}
  ): ComponentModalRef<ExtractResult<TComponent>, TComponent> {
    return this.showComponentInternal(component, config);
  }

  showTemplate<TResult = unknown, TData = any>(
    template: TemplateRef<any>,
    viewContainerRef: ViewContainerRef,
    config: ModalConfig<TData> = {}
  ): ModalRef<TResult> {
    return this.showTemplateInternal(template, viewContainerRef, config);
  }

  closeTop(result?: any) {
    const instance = this.modals[this.modals.length - 1];
    if (instance) {
      this.closeInstance(instance, result);
    }
  }

  /* =========================
     Component Modal
  ========================= */

  private showComponentInternal<TComponent extends ModalComponent<any>, TData>(
    component: ComponentType<TComponent>,
    config: ModalConfig<TData>
  ): ComponentModalRef<ExtractResult<TComponent>, TComponent> {

    const instance = this.createInstance(config);
    const modalRef = this.createModalRef<ExtractResult<TComponent>>(instance);

    const portal = new ComponentPortal(
      component,
      null,
      this.createInjector(config.data, modalRef)
    );

    const componentRef = instance.overlayRef.attach(portal);
    instance.componentRef = componentRef;

    const hostElement = componentRef.location?.nativeElement as HTMLElement;
    if (hostElement) {
      hostElement.style.height = '100%';
      hostElement.style.display = 'block';
    }

    const componentModalRef: ComponentModalRef<ExtractResult<TComponent>, TComponent> = {
      ...modalRef,
      componentInstance: componentRef.instance
    };

    return componentModalRef;
  }

  /* =========================
     Template Modal
  ========================= */

  private showTemplateInternal<TResult, TData>(
    template: TemplateRef<any>,
    viewContainerRef: ViewContainerRef,
    config: ModalConfig<TData>
  ): ModalRef<TResult> {

    const instance = this.createInstance(config);
    const modalRef = this.createModalRef<TResult>(instance);

    const context = {
      $implicit: config.data,
      data: config.data,
      modalRef
    };

    const portal = new TemplatePortal(template, viewContainerRef, context);
    const viewRef = instance.overlayRef.attach(portal);

    const rootElement = viewRef.rootNodes.find(
      node => node instanceof HTMLElement
    ) as HTMLElement | undefined;

    if (rootElement) {
      rootElement.style.height = '100%';
    }

    return modalRef;
  }

  /* =========================
     Instance Handling
  ========================= */

  private createInstance(config: ModalConfig): ModalInstance {
    const overlayRef = this.overlay.create(this.getOverlayConfig(config));
    const closeSubject = new Subject<any>();

    const instance: ModalInstance = {
      overlayRef,
      closeSubject
    };

    this.modals.push(instance);

    // scroll handling
    this.openModals++;
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';

    // backdrop
    if (config.closeOnBackdropClick !== false && config.hasBackdrop !== false) {
      overlayRef.backdropClick()
        .pipe(take(1))
        .subscribe(() => this.closeInstance(instance));
    }

    return instance;
  }

  private createModalRef<TResult>(instance: ModalInstance): ModalRef<TResult> {
    return {
      close: (result?: TResult) => this.closeInstance(instance, result),
      afterClosed: () => firstValueFrom(instance.closeSubject)
    };
  }

  private closeInstance(instance: ModalInstance, result?: any) {
    const index = this.modals.indexOf(instance);
    if (index === -1) return;

    instance.overlayRef.dispose();

    if (instance.componentRef) {
      instance.componentRef.destroy();
    }

    instance.closeSubject.next(result);
    instance.closeSubject.complete();

    this.modals.splice(index, 1);

    // scroll restore
    this.openModals--;
    if (this.openModals <= 0) {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      this.openModals = 0;
    }
  }

  /* =========================
     Overlay Config
  ========================= */

  private getOverlayConfig(config: ModalConfig): OverlayConfig {
    const positionStrategy = this.overlay.position().global();

    if (config.centered !== false) {
      positionStrategy.centerHorizontally().centerVertically();
    }

    const height = config.height || config.maxHeight;

    return new OverlayConfig({
      hasBackdrop: config.hasBackdrop !== false,
      backdropClass: 'modal-backdrop',
      panelClass: this.getPanelClasses(config),
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.block(),
      width: config.width,
      height,
      maxWidth: config.maxWidth || '95vw',
      maxHeight: config.maxHeight || '95vh'
    });
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

  private createInjector(data: any, modalRef: ModalRef<any, any>): Injector {
    return Injector.create({
      parent: this.injector,
      providers: [
        { provide: MODAL_DATA, useValue: data },
        { provide: MODAL_REF, useValue: modalRef }
      ]
    });
  }
}
