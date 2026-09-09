export type { ControlledTermSet, ControlledTermConfig, ControlledTermAction } from './search/constraint-set';
import type { ControlledTermSet } from './search/constraint-set';
/**
 * The contract an embedding page programs against.
 *
 * Re-exported from `search/search-types`, which carries no imports of its own, so
 * the declarations this emits stand alone: every path a host's compiler follows
 * from here is inside the published package. Adding an import of anything else to
 * either file breaks the declaration build rather than shipping a `.d.ts` naming
 * paths that exist only in this repository.
 *
 * Types only, with no runtime values. The shipped bundle is a script that
 * registers a custom element and exports nothing at all, so a `const` declared
 * here would satisfy a host's compiler and then be `undefined` at runtime — which
 * is also why the tag name below is a type rather than an exported string.
 */
export type {
  BranchHit,
  ClassHit,
  Hit,
  MatchedLabel,
  OntologyHit,
  SearchKind,
  SelectedConstraint,
  SourceSelector,
  TermRef,
  ValueSetHit,
  VersionInfo,
  VersionSelector,
} from './search/search-types';

import type { SelectedConstraint, SourceSelector } from './search/search-types';

/**
 * The picker, as a host sees it.
 *
 * `terminologyBaseUrl` is what makes it embeddable off the terminology server's
 * own origin. Unset, the picker asks its own origin for `/search`, which is what
 * the development server's proxy answers and what no host page has.
 */
export interface CedarTermPickerElement extends HTMLElement {
  query: string;
  /** Term mode only emits individual terms, for a field's default value. */
  selectionMode: 'constraint' | 'constraints' | 'term';
  constraintSet: ControlledTermSet;
  /** Fixed vocabulary scope; empty means search all sources. */
  sources: readonly SourceSelector[];
  terminologyBaseUrl: string | null;

  /*
   * The DOM overload first, and it is load-bearing rather than a courtesy.
   *
   * Naming this element in `HTMLElementTagNameMap` is what makes
   * `document.querySelector('cedar-term-picker')` typed — and it is also what
   * makes Angular resolve this interface as the host element type when it checks
   * the component's own host bindings. Without this overload the narrowest match
   * for `keydown` became the catch-all below, `$event` collapsed to `Event`, and
   * the production build failed on the component's own Escape handler.
   */
  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: 'constraintsChanged',
    listener: (event: CustomEvent<void>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: 'constraintsSelected',
    listener: (event: CustomEvent<ControlledTermSet>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: 'selected',
    listener: (event: CustomEvent<SelectedConstraint>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: 'cancelled',
    listener: (event: CustomEvent<void>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'cedar-term-picker': CedarTermPickerElement;
  }
}
