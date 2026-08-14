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
import { NgTemplateOutlet } from '@angular/common';
import { FontRegistrar } from './font-registrar/font-registrar';
import { TerminologyClient } from './search/terminology-client';
import {
  BranchHit,
  ClassHit,
  Hit,
  OntologyHit,
  SearchKind,
  SearchResponse,
  SourceSelector,
  SourceBlock,
  TAB_LABELS,
  TAB_ORDER,
  TermRef,
  SelectedConstraint,
  ValueSetHit,
  VersionInfo,
  isBranchHit,
  isClassHit,
  isOntologyHit,
  isValueSetHit,
} from './search/search-types';

/** The tag the host page uses, and the component's own selector. */
export const TERM_PICKER_TAG = 'cedar-term-picker';

/** How long the author stops typing before a search runs. */
const DEBOUNCE_MS = 250;

/** Labels per page for the folding tabs, rows per page for the rest. */
const PAGE_SIZE = 25;

/**
 * One label, and the ontologies that offer it.
 *
 * A query for a common term returns the same string from a hundred ontologies, so the flat list is
 * one word repeated. The author's question at that point is which ontology, and collapsing asks it
 * directly. The count is exact rather than a property of the page: the terms results are paged by
 * distinct label and carry every hit of the labels on the page, so a fold here sees the whole group.
 */
/**
 * One branch label, and every place the corpus offers it.
 *
 * Folded across ontologies as well as within one, so "melanoma" is a row rather than a hundred.
 * A position is an ontology plus a parent: a hundred ontologies each name melanoma, and RH-MESH
 * names it four times over at different points in its tree, so the count of positions and the count
 * of ontologies are not the same number and the row says both when they differ.
 */
export interface BranchGroup {
  readonly label: string;
  readonly ontologyCount: number;
  readonly hits: readonly BranchHit[];
}

export interface LabelGroup {
  /** What the row is titled: the term's label, or the name that matched when the label is a code. */
  readonly label: string;
  /** The label the ontology gave, when it is a code and the title came from a matched name. */
  readonly code?: string;
  readonly hits: readonly ClassHit[];
}

@Component({
  selector: TERM_PICKER_TAG,
  imports: [FontRegistrar, NgTemplateOutlet],
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
  readonly selected = output<SelectedConstraint>();

  /** Emitted when the author closes the picker without choosing anything. */
  readonly cancelled = output<void>();

  protected readonly text = linkedSignal(() => this.query());
  protected readonly activeTab = signal<SearchKind>('class');
  protected readonly response = signal<SearchResponse | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly searching = signal(false);
  protected readonly expanded = signal<string | null>(null);

  /**
   * Which page each tab is showing.
   *
   * Per tab rather than one for the picker: the tabs count different things and an author reading
   * page three of the terms has not asked to be on page three of the ontologies. Paging fetches
   * that one type rather than repeating the search, which is also why a later page's sources have
   * to be merged into the envelope — a row on page three names an ontology page one never did.
   */
  protected readonly pages = signal<Readonly<Partial<Record<SearchKind, number>>>>({});

  /**
   * The ontologies the search is narrowed to, in the order the author added them.
   *
   * One filter for every tab rather than one per tab: an author who has decided the field belongs
   * to NCIT has decided it for the terms and the branches alike. Narrowing does not change the kind
   * of search — the server keeps the same index, matching and paging — so the results an author was
   * reading do not shift underneath them, they only get shorter.
   */
  protected readonly narrowedTo = signal<readonly string[]>([]);

  /**
   * The version an author has stepped an ontology to, keyed by acronym.
   *
   * Absent means latest, and absent is what a constraint records: freeze-on-publish resolves an
   * unpinned constraint at publish time, so latest keeps meaning latest until the template is
   * published. An entry appears only when the author steps off latest, which is the difference
   * between accepting the default and choosing today's version.
   */
  private readonly pinned = signal<ReadonlyMap<string, VersionInfo>>(new Map());

  /** Version histories, fetched once per ontology when a row first steps. */
  private readonly histories = signal<ReadonlyMap<string, readonly VersionInfo[]>>(new Map());

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
      const response = await this.client.search(
        { query, pageSize: PAGE_SIZE, sources: this.sourceSelectors() },
        controller.signal,
      );
      this.response.set(response);
      this.pages.set({});
      this.expanded.set(null);
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
      // Terms and branches both fold, so both badges count distinct labels rather than hits. The
      // hit count saturates on any query worth typing and says the same thing every time.
      const collapsed = type.distinctLabelCount;
      const value = collapsed ?? type.totalCount;
      const capped = collapsed === undefined ? type.countCapped : type.distinctLabelCountCapped;
      counts[kind] = capped ? `${value.toLocaleString()}+` : value.toLocaleString();
    }
    return counts;
  });

  /**
   * Whether a label is a bare code rather than a name.
   *
   * Some ontologies put an identifier where the name belongs and keep every human phrasing as a
   * synonym — OCHV, the consumer health vocabulary, labels a concept 6188 and records "HIV disease",
   * "HIV infection" and "disease HIV" beneath it; 27,758 of its terms are numbered this way, and
   * DDSS and DRON have 667,569 each. Showing the author 6188 is showing them nothing.
   */
  private static isCode(label: string): boolean {
    return label.length > 0 && !/\p{L}/u.test(label);
  }

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
    return [...groups.values()].map((members) => {
      const first = members[0];
      // A code is not a name. When the ontology gave one, lead with the name that actually matched
      // and keep the code beside it, so the row says what the author searched for.
      const matched = first.matchedLabels?.[0]?.label;
      const coded = TermPicker.isCode(first.termLabel) && matched !== undefined;
      return {
        label: coded ? matched : first.termLabel,
        code: coded ? first.termLabel : undefined,
        hits: members,
      };
    });
  });

  /**
   * Branches, folded by label.
   *
   * The same fold the terms tab uses, for the same reason and then one more. A common label repeats
   * across ontologies — a hundred of them name melanoma — and it repeats *within* one, because a
   * thesaurus can materialise a concept once per position in its hierarchy: RH-MESH does that 11,528
   * times, and its four "melanoma" branches include two that agree on parent and on descendant count
   * and so cannot be told apart at all. One row per label, opening onto the ontologies and the
   * positions each gives it.
   */
  protected readonly branchGroups = computed<readonly BranchGroup[]>(() => {
    const groups = new Map<string, BranchHit[]>();
    for (const hit of this.hitsOf('branch').filter(isBranchHit)) {
      const key = hit.termBaseLabel.toLocaleLowerCase();
      const group = groups.get(key);
      if (group) {
        group.push(hit);
      } else {
        groups.set(key, [hit]);
      }
    }
    return [...groups.values()].map((hits) => ({
      label: hits[0].termBaseLabel,
      ontologyCount: new Set(hits.map((hit) => hit.sourceAcronym)).size,
      hits,
    }));
  });
  protected readonly ontologies = computed(() => this.hitsOf('ontology').filter(isOntologyHit));
  protected readonly valueSets = computed(() => this.hitsOf('valueSet').filter(isValueSetHit));

  /** Sources the search could not read, which have to be shown or their absence reads as no matches. */
  protected readonly unavailable = computed<readonly SourceBlock[]>(
    () => this.response()?.sources.filter((source) => source.served === 'unavailable') ?? [],
  );

  private hitsOf(kind: SearchKind): readonly Hit[] {
    return this.response()?.results[kind]?.collection ?? [];
  }

  private sourceSelectors(): readonly SourceSelector[] | undefined {
    const acronyms = this.narrowedTo();
    return acronyms.length === 0 ? undefined : acronyms.map((sourceAcronym) => ({ sourceAcronym }));
  }

  /** Adds an ontology to the filter, or removes it if it is already there. */
  protected toggleNarrowing(acronym: string): void {
    this.narrowedTo.update((current) =>
      current.includes(acronym) ? current.filter((a) => a !== acronym) : [...current, acronym],
    );
    void this.rerun();
  }

  protected clearNarrowing(): void {
    this.narrowedTo.set([]);
    void this.rerun();
  }

  protected isNarrowedTo(acronym: string): boolean {
    return this.narrowedTo().includes(acronym);
  }

  /** Re-runs the current query from page one, which a changed filter is a new question for. */
  private async rerun(): Promise<void> {
    this.pages.set({});
    this.expanded.set(null);
    await this.run(this.text().trim());
  }

  protected pageOf(kind: SearchKind): number {
    return this.pages()[kind] ?? 1;
  }

  /** How many pages a tab has, or 0 when it fits on one. */
  protected pageCount(kind: SearchKind): number {
    const results = this.response()?.results[kind];
    if (!results) {
      return 0;
    }
    // Terms and branches count distinct labels, because that is what a page of them holds.
    const count = results.distinctLabelCount ?? results.totalCount;
    const pages = Math.ceil(count / (results.pageSize || PAGE_SIZE));
    return pages > 1 ? pages : 0;
  }

  /** Whether the last page is a floor rather than the end, because counting stopped at the cap. */
  protected pageCountCapped(kind: SearchKind): boolean {
    const results = this.response()?.results[kind];
    return (
      (results?.distinctLabelCount === undefined ? results?.countCapped : results.distinctLabelCountCapped) === true
    );
  }

  /** Moves one tab to another page, fetching that type alone. */
  protected async goTo(kind: SearchKind, page: number): Promise<void> {
    const current = this.response();
    const query = this.text().trim();
    if (!current || page < 1 || query.length === 0) {
      return;
    }
    this.searching.set(true);
    try {
      const next = await this.client.search({
        query,
        types: [kind],
        page,
        pageSize: PAGE_SIZE,
        sources: this.sourceSelectors(),
      });
      const results = next.results[kind];
      if (!results) {
        return;
      }
      // A later page names ontologies the first did not, and a row reads its source from the
      // envelope, so the blocks accumulate rather than being replaced.
      const sources = new Map(current.sources.map((source) => [source.sourceAcronym, source]));
      for (const source of next.sources) {
        sources.set(source.sourceAcronym, source);
      }
      this.response.set({
        ...current,
        sources: [...sources.values()],
        results: { ...current.results, [kind]: results },
      });
      this.pages.update((pages) => ({ ...pages, [kind]: page }));
      this.expanded.set(null);
    } catch (failure: unknown) {
      this.error.set(failure instanceof Error ? failure.message : 'The search failed.');
    } finally {
      this.searching.set(false);
    }
  }

  protected sourceOf(acronym: string): SourceBlock | undefined {
    return this.response()?.sources.find((source) => source.sourceAcronym === acronym);
  }

  protected sourceName(acronym: string): string {
    return this.sourceOf(acronym)?.sourceName ?? acronym;
  }

  /** What the row shows: the version stepped to, else the one that answered. */
  protected versionOf(acronym: string): string {
    return TermPicker.nameOf(this.pinned().get(acronym) ?? this.sourceOf(acronym)?.version);
  }

  /**
   * A version named the way an author recognises it.
   *
   * Never the content hash. The hash is what makes a pin reproducible and is meaningless to read;
   * the declared version and the release date are what identify a release to a person.
   */
  private static nameOf(version: VersionInfo | undefined): string {
    return version?.declaredVersion ?? version?.effectiveDate?.slice(0, 10) ?? 'latest';
  }

  /** Whether this ontology has anything to step back to. */
  protected steppable(acronym: string): boolean {
    const source = this.sourceOf(acronym);
    return source?.pinnable === true && (source.versionCount ?? 1) > 1;
  }

  protected isPinned(acronym: string): boolean {
    return this.pinned().has(acronym);
  }

  /** Where this ontology sits in its history: 0 is current. */
  private positionOf(acronym: string): number {
    const history = this.histories().get(acronym);
    const current = this.pinned().get(acronym);
    if (!history || !current) {
      return 0;
    }
    const at = history.findIndex((version) => version.id === current.id);
    return at < 0 ? 0 : at;
  }

  /**
   * Steps an ontology back through its releases, or forward again.
   *
   * The history is fetched on the first step rather than with the search: a corpus-wide query
   * touches a hundred ontologies and an author steps one.
   */
  protected async step(acronym: string, by: 1 | -1): Promise<void> {
    let history = this.histories().get(acronym);
    if (!history) {
      const response = await this.client.search({
        query: this.text().trim(),
        types: ['ontology'],
        sources: [{ sourceAcronym: acronym }],
        includeVersions: true,
        pageSize: 1,
      });
      history = response.sources.find((s) => s.sourceAcronym === acronym)?.versions ?? [];
      this.histories.update((map) => new Map(map).set(acronym, history ?? []));
    }
    if (history.length === 0) {
      return;
    }
    const next = Math.min(Math.max(this.positionOf(acronym) + by, 0), history.length - 1);
    this.pinned.update((map) => {
      const updated = new Map(map);
      // Stepping back to current unpins rather than pinning to today's version. Writing nothing is
      // what keeps "latest" meaning latest until the template is published.
      if (next === 0) {
        updated.delete(acronym);
      } else {
        updated.set(acronym, history[next]);
      }
      return updated;
    });
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

  /** The range a folded branch covers, so the row says what it holds without listing its positions. */
  protected spanOf(hits: readonly BranchHit[]): string {
    const counts = hits.map((hit) => hit.descendantCount);
    const low = Math.min(...counts);
    const high = Math.max(...counts);
    return low === high ? low.toLocaleString() : `${low.toLocaleString()}–${high.toLocaleString()}`;
  }

  /**
   * Shortens a long label from the middle, keeping both ends.
   *
   * Some vocabularies put a whole question in the label and its axis codes after it — LOINC has
   * "Have you been diagnosed with melanoma in the past - skin cancer, arising in melanocytes, skin
   * cells that make skin pigment:Find:Pt:^Patient:Ord:PhenX". Cutting the end throws away the codes
   * that say what kind of thing it is, and the two ends together identify it where either alone does
   * not. The full text stays in the row's title, so nothing is lost, only folded.
   */
  protected elide(text: string | undefined, max = 96, tail = 28): string {
    // A value set's name is optional in the contract, so this takes what the contract gives.
    if (text === undefined || text.length <= max) {
      return text ?? '';
    }
    return `${text.slice(0, max - tail - 1).trimEnd()}…${text.slice(-tail).trimStart()}`;
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

  /**
   * Emits the constraint, carrying a version only when the author stepped off latest.
   *
   * A class is never versioned: it has no snapshot of its own, so a version on it would name
   * something that does not exist.
   */
  protected choose(hit: Hit): void {
    const version = hit.type === 'class' ? undefined : this.pinned().get(hit.sourceAcronym);
    this.selected.emit(version === undefined ? hit : { ...hit, version });
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
