import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Puts the picker's embedded fonts into the document's font set.
 *
 * Browsers do not register `@font-face` declared inside a shadow root, so the one
 * stylesheet that carries font faces cannot be encapsulated with the rest. This is
 * the only unencapsulated component here, and its stylesheet holds no selectors —
 * only the CEDAR-namespaced faces — so nothing of the host page can be reached by
 * it. CEE arrived at the same arrangement for the same reason.
 */
@Component({
  selector: 'ctp-font-registrar',
  template: '',
  styleUrl: './font-registrar.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FontRegistrar {}
