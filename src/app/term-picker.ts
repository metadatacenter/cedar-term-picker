import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, linkedSignal, output } from '@angular/core';
import { FontRegistrar } from './font-registrar/font-registrar';

/** The tag the host page uses, and the component's own selector. */
export const TERM_PICKER_TAG = 'cedar-term-picker';

/**
 * The four kinds a query answers. Each one produces a value constraint on the field,
 * which is why they can share a result contract — that contract is not designed yet.
 */
export const SEARCH_KINDS = ['ontologies', 'branches', 'terms', 'value sets'] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

/**
 * A placeholder shell.
 *
 * It carries the boundary the rest of the component will be built behind — shadow DOM,
 * an input the host sets, an event the host listens for — and none of the search
 * behaviour. Nothing here should be read as a decision about the UI.
 */
@Component({
  selector: TERM_PICKER_TAG,
  imports: [FontRegistrar],
  templateUrl: './term-picker.html',
  styleUrl: './term-picker.scss',
  encapsulation: ViewEncapsulation.ShadowDom,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermPicker {
  /** The query the picker opens on, so a host can seed it from the field's name. */
  readonly query = input('');

  /** Emitted when the author closes the picker without choosing anything. */
  readonly cancelled = output<void>();

  /** What the author has typed, seeded from `query` and reseeded whenever the host changes it. */
  protected readonly text = linkedSignal(() => this.query());

  protected readonly kinds = SEARCH_KINDS;

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
  }

  protected onCancel(): void {
    this.cancelled.emit();
  }
}
