import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { TERM_PICKER_TAG, TermPicker } from './app/term-picker';

/**
 * Register the picker as a custom element.
 *
 * `createApplication` rather than `bootstrapApplication`: nothing on the page is
 * bootstrapped by us. The host decides where and when a `<cedar-term-picker>` appears,
 * and the application exists only to give the element an injector.
 *
 * The registration is guarded because `customElements.define` throws on a tag that is
 * already defined, and a host page that loads two copies of this bundle would otherwise
 * fail on the second rather than keep the one it has.
 */
createApplication({ providers: [provideBrowserGlobalErrorListeners()] })
  .then((application) => {
    if (customElements.get(TERM_PICKER_TAG)) {
      console.warn(`<${TERM_PICKER_TAG}> is already defined; this bundle is not the one serving it.`);
      return;
    }
    customElements.define(TERM_PICKER_TAG, createCustomElement(TermPicker, { injector: application.injector }));
  })
  .catch((error: unknown) => console.error(error));
