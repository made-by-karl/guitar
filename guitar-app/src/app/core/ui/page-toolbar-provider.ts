import { TemplateRef } from '@angular/core';

export interface PageToolbarProvider {
  toolbarTemplate: TemplateRef<object> | null;
  toolbarContext?: object | null;
}

export function isPageToolbarProvider(value: unknown): value is PageToolbarProvider {
  return typeof value === 'object' && value !== null && 'toolbarTemplate' in value;
}
