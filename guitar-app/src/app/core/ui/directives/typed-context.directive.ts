import { Directive, Input } from '@angular/core';

@Directive({
  selector: 'ng-template[typedCtx]',
  standalone: true
})
export class TypedContextDirective<TContext extends object> {
  // Phantom input used only for template type inference.
  @Input('typedCtx') typedContext!: TContext;

  static ngTemplateContextGuard<TContext extends object>(
    _dir: TypedContextDirective<TContext>,
    _ctx: unknown
  ): _ctx is TContext {
    return true;
  }
}
