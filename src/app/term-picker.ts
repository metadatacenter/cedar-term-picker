import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { FontRegistrar } from './font-registrar/font-registrar';
import { TerminologyClient } from './search/terminology-client';
import {
  BranchHit,
  ClassHit,
  Hit,
  OntologyHit,
  SearchKind,
  SearchResponse,
  SourceBlock,
  TAB_LABELS,
  TAB_ORDER,
  TermRef,
  ValueSetHit,
  isBranchHit,
  isClassHit,
  isOntologyHit,
  isValueSetHit,
} from './search/search-types';

/** The tag the host page uses, and the component's own selector. */
export const TERM_PICKER_TAG = 'cedar-term-picker';

/** How long the author stops typing before a search runs. */
const DEBOUNCE_MS = 250;

/**
 * One label, and the ontologies that offer it.
 *
 * A query for a common term returns the same string from a hundred ontologies, so the flat list is
 * one word repeated. The author's question at that point is which ontology, and collapsing asks it
 * directly. The count is exact rather than a property of the page: the terms results are paged by
 * distinct label and carry every hit of the labels on the page, so a fold here sees the whole group.
 */
export interface LabelGroup {
  readonly label: string;
  readonly hits: readonly ClassHit[];
}

@Component({
  selector: TERM_PICKER_TAG,
  imports: [FontRegistrar],
  templateUrl: './term-picker.html',
  styleUrl: './term-picker.scss',
  encapsulation: ViewEncapsulation.ShadowDom,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermPicker {
  private readonly client = inject(TerminologyClient);

  /** The query the picker opens on, so a host can seed it from the field's name. */
  readonly query = input('');

  /** The constraint the author chose, in the shape the template will store. */
  readonly selected = output<Hit>();

  /** Emitted when the author closes the picker without choosing anything. */
  readonly cancelled = output<void>();

  protected readonly text = linkedSignal(() => this.query());
  protected readonly activeTab = signal<SearchKind>('class');
  protected readonly response = signal<SearchResponse | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly searching = signal(false);
  protected readonly expanded = signal<string | null>(null);

  protected readonly tabs = TAB_ORDER;
  protected readonly tabLabels = TAB_LABELS;

  private debounce?: ReturnType<typeof setTimeout>;
  private inFlight?: AbortController;

  constructor() {
    effect(() => {
      const query = this.text().trim();
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => void this.run(query), DEBOUNCE_MS);
    });
  }

  private async run(query: string): Promise<void> {
    // Cancel rather than let a slower earlier query land on top of a faster later one.
    this.inFlight?.abort();
    if (query.length === 0) {
      this.response.set(null);
      this.error.set(null);
      this.searching.set(false);
      return;
    }
    const controller = new AbortController();
    this.inFlight = controller;
    this.searching.set(true);
    try {
      const response = await this.client.search({ query, pageSize: 25 }, controller.signal);
      this.response.set(response);
      this.error.set(null);
    } catch (failure: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      this.response.set(null);
      this.error.set(failure instanceof Error ? failure.message : 'The search failed.');
    } finally {
      if (!controller.signal.aborted) {
        this.searching.set(false);
      }
    }
  }

  /** The badge: the collapsed count where the server offers one, else the hit count. */
  protected readonly counts = computed<Partial<Record<SearchKind, string>>>(() => {
    const results = this.response()?.results;
    if (!results) {
      return {};
    }
    const counts: Partial<Record<SearchKind, string>> = {};
    for (const kind of TAB_ORDER) {
      const type = results[kind];
      if (!type) {
        continue;
      }
      const collapsed = kind === 'class' ? type.distinctLabelCount : undefined;
      const value = collapsed ?? type.totalCount;
      const capped = collapsed === undefined ? type.countCapped : type.distinctLabelCountCapped;
      counts[kind] = capped ? `${value.toLocaleString()}+` : value.toLocaleString();
    }
    return counts;
  });

  /** Terms, collapsed by label, in the order the server ranked them. */
  protected readonly labelGroups = computed<readonly LabelGroup[]>(() => {
    const hits = this.hitsOf('class').filter(isClassHit);
    const groups = new Map<string, ClassHit[]>();
    for (const hit of hits) {
      const key = hit.termLabel.toLocaleLowerCase();
      const group = groups.get(key);
      if (group) {
        group.push(hit);
      } else {
        groups.set(key, [hit]);
      }
    }
    return [...groups.values()].map((members) => ({ label: members[0].termLabel, hits: members }));
  });

  protected readonly branches = computed(() => this.hitsOf('branch').filter(isBranchHit));
  protected readonly ontologies = computed(() => this.hitsOf('ontology').filter(isOntologyHit));
  protected readonly valueSets = computed(() => this.hitsOf('valueSet').filter(isValueSetHit));

  /** Sources the search could not read, which have to be shown or their absence reads as no matches. */
  protected readonly unavailable = computed<readonly SourceBlock[]>(
    () => this.response()?.sources.filter((source) => source.served === 'unavailable') ?? [],
  );

  private hitsOf(kind: SearchKind): readonly Hit[] {
    return this.response()?.results[kind]?.collection ?? [];
  }

  protected sourceOf(acronym: string): SourceBlock | undefined {
    return this.response()?.sources.find((source) => source.sourceAcronym === acronym);
  }

  protected sourceName(acronym: string): string {
    return this.sourceOf(acronym)?.sourceName ?? acronym;
  }

  protected versionOf(acronym: string): string {
    const version = this.sourceOf(acronym)?.version;
    return version?.declaredVersion ?? version?.effectiveDate?.slice(0, 10) ?? 'latest';
  }

  /** The last steps of a branch's path: the root never disambiguates, the parents do. */
  protected tailOf(path: readonly TermRef[] | undefined, steps = 3): string {
    if (!path || path.length === 0) {
      return '';
    }
    const tail = path.slice(-steps).map((step) => step.termLabel ?? '?');
    return (path.length > steps ? '… ‹ ' : '') + tail.reverse().join(' ‹ ');
  }

  /**
   * A name split around the part the query matched, so the row can mark it.
   *
   * The mark replaces a chip saying "named this". A chip said the same words on every row it
   * appeared on, which is a line of vertical space carrying no information; showing which characters
   * matched says it in the name itself.
   */
  protected splitName(acronym: string): readonly [string, string, string] {
    const name = this.sourceName(acronym);
    const at = name.toLocaleLowerCase().indexOf(this.text().trim().toLocaleLowerCase());
    if (at < 0 || this.text().trim().length === 0) {
      return [name, '', ''];
    }
    const end = at + this.text().trim().length;
    return [name.slice(0, at), name.slice(at, end), name.slice(end)];
  }

  protected labelsOf(refs: readonly TermRef[] | undefined, limit = 4): string {
    return (refs ?? [])
      .slice(0, limit)
      .map((ref) => ref.termLabel ?? ref.termIri)
      .join(', ');
  }

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
  }

  protected toggle(label: string): void {
    this.expanded.update((open) => (open === label ? null : label));
  }

  protected choose(hit: Hit): void {
    this.selected.emit(hit);
  }

  protected onCancel(): void {
    this.cancelled.emit();
  }

  protected asBranch(hit: Hit): BranchHit {
    return hit as BranchHit;
  }

  protected asOntology(hit: Hit): OntologyHit {
    return hit as OntologyHit;
  }

  protected asValueSet(hit: Hit): ValueSetHit {
    return hit as ValueSetHit;
  }
}
