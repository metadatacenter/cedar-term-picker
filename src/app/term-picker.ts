import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FontRegistrar } from './font-registrar/font-registrar';
import { TerminologyClient } from './search/terminology-client';
import {
  BranchHit,
  ClassHit,
  Hierarchy,
  HierarchyChild,
  Hit,
  MatchedLabel,
  OntologyHit,
  SearchKind,
  SearchResponse,
  SourceSelector,
  SourceBlock,
  TAB_LABELS,
  TAB_ORDER,
  TermRef,
  TreeRow,
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

/** How many of a term's other names a panel shows before saying how many are left. */
const NAME_LIMIT = 8;

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

/** Later pages and side queries name sources the first response did not, so blocks accumulate. */
function mergeSources(current: readonly SourceBlock[], incoming: readonly SourceBlock[]): readonly SourceBlock[] {
  const merged = new Map(current.map((source) => [source.sourceAcronym, source]));
  for (const source of incoming) {
    merged.set(source.sourceAcronym, source);
  }
  return [...merged.values()];
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

  /** Escape leaves the picker, which a modal host will expect and an inline one does no harm by. */
  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.cancelled.emit();
    }
  }

  protected readonly text = linkedSignal(() => this.query());
  protected readonly activeTab = signal<SearchKind>('class');
  protected readonly response = signal<SearchResponse | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly searching = signal(false);
  protected readonly expanded = signal<string | null>(null);

  /**
   * The row an author has clicked.
   *
   * Choosing a constraint is two acts rather than one: a click marks a row, a second confirms it.
   * A single click that emitted would make every mis-aimed click a decision, and the rows are one
   * line tall and adjacent.
   */
  protected readonly marked = signal<string | null>(null);

  /**
   * Which page each tab is showing.
   *
   * Per tab rather than one for the picker: the tabs count different things and an author reading
   * page three of the terms has not asked to be on page three of the ontologies. Paging fetches
   * that one type rather than repeating the search, which is also why a later page's sources have
   * to be merged into the envelope — a row on page three names an ontology page one never did.
   */
  protected readonly pages = signal<Readonly<Partial<Record<SearchKind, number>>>>({});

  /** Tabs whose last page came back short, which is the only signal that a list has ended. */
  private readonly exhausted = signal<Readonly<Partial<Record<SearchKind, boolean>>>>({});

  /** The scrolling list, which the top-up measures against its own box. */
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  /**
   * The ontologies the search is narrowed to, in the order the author added them.
   *
   * One filter for every tab rather than one per tab: an author who has decided the field belongs
   * to NCIT has decided it for the terms and the branches alike. Narrowing does not change the kind
   * of search — the server keeps the same index, matching and paging — so the results an author was
   * reading do not shift underneath them, they only get shorter.
   */
  protected readonly narrowedTo = signal<readonly string[]>([]);

  /** The narrowing panel's candidates, ranked by matching terms rather than by name. */
  protected readonly candidates = signal<readonly OntologyHit[]>([]);
  protected readonly choosingNarrowing = signal(false);

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

  /** Where each marked term sits, once read. A held null is a term the store does not hold. */
  private readonly hierarchies = signal<ReadonlyMap<string, Hierarchy | null>>(new Map());

  /** What each opened node of a tree holds, read as it opens. */
  private readonly nodes = signal<ReadonlyMap<string, Hierarchy | null>>(new Map());

  /** Which nodes of the tree are open. Keyed by source and IRI, so two trees cannot collide. */
  private readonly openNodes = signal<ReadonlySet<string>>(new Set());

  /** The ontology whose release history is open beneath its row. One at a time. */
  protected readonly historyFor = signal<string | null>(null);

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

  private async run(query: string, keepCandidates = false): Promise<void> {
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
      // The candidates rank against the query, so a new query invalidates them — but changing the
      // filter re-runs the same query, and clearing them there would empty the panel the author is
      // choosing from.
      if (!keepCandidates) {
        this.candidates.set([]);
      }
      this.pages.set({});
      this.exhausted.set({});
      this.expanded.set(null);
      this.topUp(this.activeTab());
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
    await this.run(this.text().trim(), true);
  }

  /**
   * Opens the narrowing panel, fetching the ontologies ranked by how much of the query they hold.
   *
   * A different order from the ontologies tab, because it answers a different question. That tab
   * leads with a vocabulary named after the query — right for "is there an ontology about this",
   * wrong for "where are the terms". For melanoma the tab leads with MELO, aptly named and holding
   * 38 terms, while the useful thing to narrow to is NCIT with 950.
   */
  protected async openNarrowing(): Promise<void> {
    this.choosingNarrowing.update((open) => !open);
    if (!this.choosingNarrowing() || this.candidates().length > 0) {
      return;
    }
    const query = this.text().trim();
    if (query.length === 0) {
      return;
    }
    const response = await this.client.search({
      query,
      types: ['ontology'],
      ontologyOrder: 'matches',
      pageSize: 40,
    });
    this.candidates.set((response.results.ontology?.collection ?? []).filter(isOntologyHit));
    this.response.update((current) =>
      current === null ? current : { ...current, sources: mergeSources(current.sources, response.sources) },
    );
  }

  protected pageOf(kind: SearchKind): number {
    return this.pages()[kind] ?? 1;
  }

  /** Whether every match this tab has is already on screen. */
  protected isExhausted(kind: SearchKind): boolean {
    return this.exhausted()[kind] === true;
  }

  /**
   * Asks for the next page when the list is scrolled near its end.
   *
   * The threshold is a screenful rather than the last pixel, so the rows arrive before an author
   * reaches the gap they would otherwise fill.
   */
  /** Switches tabs, and fills the new one if its first page does not reach the bottom of the box. */
  protected showTab(kind: SearchKind): void {
    this.activeTab.set(kind);
    this.topUp(kind);
  }

  protected onScroll(event: Event): void {
    const list = event.target as HTMLElement;
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remaining < list.clientHeight) {
      void this.loadMore(this.activeTab());
    }
  }

  /**
   * Fetches on until the list is long enough to scroll.
   *
   * Scrolling is what asks for more, so a page that does not fill the box leaves an author with no
   * way to ask: a tab whose first page is short of a screenful would end there while the tab badge
   * counted thousands. Bounded by the same short-page test that ends the list.
   */
  private topUp(kind: SearchKind): void {
    setTimeout(() => {
      const list = this.list()?.nativeElement;
      // A box of no height is one that has not been laid out — a test environment, or a picker in a
      // hidden container. There is nothing to fill, and treating it as unfilled fetches for ever.
      if (list && list.clientHeight > 0 && list.scrollHeight <= list.clientHeight && !this.isExhausted(kind)) {
        void this.loadMore(kind);
      }
    });
  }

  /**
   * Appends the next page of one tab.
   *
   * A page rather than everything, because a common query matches ten thousand distinct labels and
   * an author reads the first twenty. The end is a short page, not a count: `totalCount` stops at
   * the cap and cannot say where the list runs out.
   */
  protected async loadMore(kind: SearchKind): Promise<void> {
    const current = this.response();
    const query = this.text().trim();
    if (!current || query.length === 0 || this.searching() || this.isExhausted(kind)) {
      return;
    }
    const page = this.pageOf(kind) + 1;
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
      const arrived = results?.collection ?? [];
      if (arrived.length < PAGE_SIZE) {
        this.exhausted.update((done) => ({ ...done, [kind]: true }));
      }
      if (!results || arrived.length === 0) {
        return;
      }
      const held = current.results[kind];
      // A later page names ontologies the first did not, and a row reads its source from the
      // envelope, so the blocks accumulate rather than being replaced. So do the hits: the list is
      // one list an author scrolls, not a page that replaces the page before it.
      this.response.set({
        ...current,
        sources: mergeSources(current.sources, next.sources),
        results: {
          ...current.results,
          [kind]: { ...results, collection: [...(held?.collection ?? []), ...arrived] },
        },
      });
      this.pages.update((pages) => ({ ...pages, [kind]: page }));
    } catch (failure: unknown) {
      this.error.set(failure instanceof Error ? failure.message : 'The search failed.');
    } finally {
      this.searching.set(false);
      this.topUp(kind);
    }
  }

  protected sourceOf(acronym: string): SourceBlock | undefined {
    return this.response()?.sources.find((source) => source.sourceAcronym === acronym);
  }

  protected sourceName(acronym: string): string {
    return this.sourceOf(acronym)?.sourceName ?? acronym;
  }

  /** The name only when it says more than the acronym, so a row never reads "BERO BERO". */
  protected sourceNameIfDistinct(acronym: string): string {
    const name = this.sourceOf(acronym)?.sourceName;
    return name === undefined || name === acronym ? '' : name;
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
   *
   * Shown as the ontology declares it, with nothing prepended. A synthesised `v` reads as part of
   * the version and is wrong about it as often as not: the catalog holds `V2`, `v1.0.0`, `2026-07-06`
   * and `latest`, which a prefix turns into `vV2`, `vv1.0.0` and `vlatest`.
   *
   * Declared, and therefore arbitrary: `owl:versionInfo` is free text, and some ontologies put a
   * changelog in it. Of the 998 snapshots that declare a version, 915 are 20 characters or fewer,
   * and the longest is 782 characters of prose with newlines and a table of HTML. The row elides
   * from the middle at 20 and carries the whole string in its title, so a version that is prose
   * costs a hover rather than the layout.
   */
  private static nameOf(version: VersionInfo | undefined): string {
    if (version === undefined) {
      return 'latest';
    }
    // A snapshot with neither a declared version nor an effective date is a release the source
    // never named — 67 of the 448 ontologies a query for "disease" reaches. Calling it "latest"
    // would say a release was unpinned when the row is reading a particular one; the history panel
    // is where its hash identifies it.
    return version.declaredVersion ?? version.effectiveDate?.slice(0, 10) ?? 'unversioned';
  }

  protected isPinned(acronym: string): boolean {
    return this.pinned().has(acronym);
  }

  /**
   * This ontology's releases, newest first, fetched once.
   *
   * Not fetched with the search: a corpus-wide query touches a hundred ontologies and an author
   * opens one.
   */
  private async loadHistory(acronym: string): Promise<readonly VersionInfo[]> {
    const held = this.histories().get(acronym);
    if (held) {
      return held;
    }
    const response = await this.client.search({
      query: this.text().trim(),
      types: ['ontology'],
      sources: [{ sourceAcronym: acronym }],
      includeVersions: true,
      pageSize: 1,
    });
    const history = response.sources.find((s) => s.sourceAcronym === acronym)?.versions ?? [];
    this.histories.update((map) => new Map(map).set(acronym, history));
    return history;
  }

  protected historyOf(acronym: string): readonly VersionInfo[] {
    return this.histories().get(acronym) ?? [];
  }

  protected isHistoryOpen(acronym: string): boolean {
    return this.historyFor() === acronym;
  }

  /** Opens the full history under the row, or closes it if this row already has it open. */
  protected async openHistory(acronym: string): Promise<void> {
    if (this.historyFor() === acronym) {
      this.historyFor.set(null);
      return;
    }
    this.historyFor.set(acronym);
    await this.loadHistory(acronym);
  }

  /** Which release the row is currently reading: the pinned one, else the current one. */
  protected isShowing(acronym: string, version: VersionInfo, index: number): boolean {
    const pinned = this.pinned().get(acronym);
    return pinned === undefined ? index === 0 : pinned.id === version.id;
  }

  /**
   * Pins a release chosen from the history.
   *
   * Choosing the current one unpins rather than writing today's version, the same rule stepping
   * forward to current obeys: writing nothing is what keeps latest meaning latest until the
   * template is published.
   */
  protected pinTo(acronym: string, version: VersionInfo, index: number): void {
    this.pinned.update((map) => {
      const updated = new Map(map);
      if (index === 0) {
        updated.delete(acronym);
      } else {
        updated.set(acronym, version);
      }
      return updated;
    });
  }

  /** Enough of a content hash to tell two releases apart, with the whole of it on hover. */
  protected shortHash(id: string | undefined): string {
    return id === undefined ? '' : id.slice(0, 12);
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
  /** The acronym around the query, so an ontology found by its acronym shows why. */
  protected splitAcronym(acronym: string): readonly [string, string, string] {
    return TermPicker.split(acronym, this.text().trim());
  }

  protected splitName(acronym: string): readonly [string, string, string] {
    return TermPicker.split(this.sourceName(acronym), this.text().trim());
  }

  /** A string cut around the query: before, the match itself, after. */
  private static split(text: string, query: string): readonly [string, string, string] {
    const at = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
    if (at < 0 || query.length === 0) {
      return [text, '', ''];
    }
    return [text.slice(0, at), text.slice(at, at + query.length), text.slice(at + query.length)];
  }

  /** The range a folded branch covers, so the row says what it holds without listing its positions. */

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
  /** Identifies a row across the four kinds, which have no one identifier between them. */
  protected keyOf(hit: Hit): string {
    if (hit.type === 'ontology') {
      return `ontology:${hit.sourceAcronym}`;
    }
    if (hit.type === 'class') {
      return `class:${hit.sourceAcronym}:${hit.termIri}`;
    }
    return `${hit.type}:${hit.sourceAcronym}:${hit.termBaseIri}`;
  }

  /** The IRI a constraint would carry, which differs by kind: a class names one, a branch its root. */
  protected termIriOf(hit: Hit): string {
    if (hit.type === 'class') {
      return hit.termIri;
    }
    // An ontology is addressed by its acronym within its system, not by a term IRI.
    return hit.type === 'ontology' ? hit.sourceAcronym : hit.termBaseIri;
  }

  /** The ontology's own IRI, which is what an ontology constraint records in place of a term. */
  protected sourceIriOf(hit: Hit): string {
    return this.sourceOf(hit.sourceAcronym)?.sourceIri ?? '';
  }

  protected sourceAcronym(hit: Hit): string {
    return hit.sourceAcronym;
  }

  /** The chain above a term, root first, or nothing where the source records no parent. */
  protected fullPathOf(hit: Hit): string {
    const path = hit.type === 'class' || hit.type === 'branch' ? hit.path : undefined;
    if (!path || path.length === 0) {
      return '';
    }
    return path.map((step) => step.termLabel ?? step.termIri).join(' › ');
  }

  /** How much sits under a term, phrased for a reader rather than as a bare figure. */
  protected descendantsOf(hit: Hit): string {
    const count = hit.type === 'class' || hit.type === 'branch' ? hit.descendantCount : 0;
    if (count === 0) {
      return '';
    }
    return `${count.toLocaleString()} ${count === 1 ? 'concept' : 'concepts'}`;
  }

  /**
   * The other names a term goes by, capped at what a panel can hold.
   *
   * Capped because a source decides what a synonym is, and some decide oddly: BPT records
   * "Description: …" and "Link: https://…" as exact synonyms of Melanoma, twenty-one names in all.
   * The cap keeps a well-behaved term readable without hiding that the odd one has more.
   */
  protected namesOf(hit: Hit): readonly MatchedLabel[] | undefined {
    const names = hit.type === 'class' || hit.type === 'branch' ? hit.names : undefined;
    return names?.length ? names.slice(0, NAME_LIMIT) : undefined;
  }

  protected moreNames(hit: Hit): number {
    const names = hit.type === 'class' || hit.type === 'branch' ? hit.names : undefined;
    return Math.max((names?.length ?? 0) - NAME_LIMIT, 0);
  }

  protected isMarked(hit: Hit): boolean {
    return this.marked() === this.keyOf(hit);
  }

  protected mark(hit: Hit): void {
    this.marked.set(this.keyOf(hit));
    if (hit.type === 'class' || hit.type === 'branch') {
      void this.readHierarchy(hit);
    }
  }

  /**
   * Fetches where a term sits, once per term.
   *
   * Its own call rather than part of the search: a page is twenty-five terms and an author asks
   * this of the one they marked. Held once fetched, so re-marking a row costs nothing.
   */
  private async readHierarchy(hit: ClassHit | BranchHit): Promise<void> {
    const key = this.keyOf(hit);
    if (this.hierarchies().has(key)) {
      return;
    }
    const iri = this.termIriOf(hit);
    try {
      const found = await this.client.hierarchy(hit.sourceAcronym, iri);
      this.hierarchies.update((held) => new Map(held).set(key, found));
      // The term itself opens, since what is under it is the first thing an author looks at. Its
      // ancestors stay closed: opening one shows what else is beside the path, which is a question
      // asked of one ancestor at a time and not of all of them at once.
      if (found) {
        this.openNodes.update((nodes) => new Set(nodes).add(TermPicker.nodeKey(hit.sourceAcronym, iri)));
        this.nodes.update((held) => new Map(held).set(TermPicker.nodeKey(hit.sourceAcronym, iri), found));
      }
    } catch {
      // A hierarchy is context, not the answer. Failing to read it leaves the panel without it
      // rather than replacing the results with an error the author cannot act on.
      this.hierarchies.update((held) => new Map(held).set(key, null));
    }
  }

  protected hierarchyOf(hit: Hit): Hierarchy | null | undefined {
    return this.hierarchies().get(this.keyOf(hit));
  }

  /** Keys a node of the tree. The same pair that addresses a term anywhere else. */
  private static nodeKey(acronym: string, iri: string): string {
    return `${acronym}\u0000${iri}`;
  }

  protected isNodeOpen(acronym: string, iri: string): boolean {
    return this.openNodes().has(TermPicker.nodeKey(acronym, iri));
  }

  /**
   * Opens or closes a node of the tree, reading its children the first time it opens.
   *
   * Lazily, because a hierarchy is a tree and not a list: SNOMED's clinical findings run to
   * hundreds of thousands of concepts, and an author opens the handful on their way down.
   */
  protected async toggleNode(acronym: string, iri: string): Promise<void> {
    const key = TermPicker.nodeKey(acronym, iri);
    const open = this.openNodes().has(key);
    this.openNodes.update((nodes) => {
      const next = new Set(nodes);
      if (open) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    if (!open && !this.nodes().has(key)) {
      try {
        const found = await this.client.hierarchy(acronym, iri);
        this.nodes.update((held) => new Map(held).set(key, found));
      } catch {
        this.nodes.update((held) => new Map(held).set(key, null));
      }
    }
  }

  /**
   * The tree under a marked term, flattened to rows with a depth apiece.
   *
   * Flattened rather than rendered by recursion: the shape is a list of lines on screen, one
   * template renders it, and a row can be reasoned about — and tested — by its depth and its key
   * rather than by where it sits in a nest of outlets.
   */
  protected treeRows(hit: Hit): readonly TreeRow[] {
    const tree = this.hierarchyOf(hit);
    if (!tree) {
      return [];
    }
    const acronym = hit.sourceAcronym;
    const spine = [...(tree.path ?? []).map((step) => step.termIri), tree.termIri];
    const rows: TreeRow[] = [];

    // `known` is what the node's parent already said about it, which is everything a row needs to
    // draw before the node is opened: reading the node to learn whether it can be opened would make
    // a closed tree fetch every branch of itself.
    const walk = (iri: string, label: string, depth: number, onSpine: boolean, known?: HierarchyChild): void => {
      const key = TermPicker.nodeKey(acronym, iri);
      const held = iri === tree.termIri ? tree : this.nodes().get(key);
      const children = held === undefined ? undefined : (held?.children ?? []);
      const open = this.isNodeOpen(acronym, iri);
      rows.push({
        key,
        iri,
        label,
        depth,
        acronym,
        self: iri === tree.termIri,
        onSpine,
        open,
        loading: open && children === undefined,
        // A node on the spine always has something below it — the next step of the path — whatever
        // else is known about it.
        hasChildren: (onSpine && iri !== tree.termIri) || known?.hasChildren === true || (held?.childCount ?? 0) > 0,
        descendantCount: known?.descendantCount ?? held?.descendantCount ?? 0,
        hidden: (held?.childCount ?? 0) - (held?.children?.length ?? 0),
      });
      const next = onSpine ? (spine[spine.indexOf(iri) + 1] ?? null) : null;
      // The path always continues. Closing an ancestor hides what stands beside the path, not the
      // path itself: a tree that collapsed to its root would lose the term the panel is about.
      if (!open) {
        if (next !== null) {
          walk(next, this.spineLabel(tree, next), depth + 1, true);
        }
        return;
      }
      const seen = new Set<string>();
      for (const child of children ?? []) {
        seen.add(child.termIri);
        walk(child.termIri, child.termLabel, depth + 1, child.termIri === next, child);
      }
      // Also while an opened ancestor's children are still being read.
      if (next !== null && !seen.has(next)) {
        walk(next, this.spineLabel(tree, next), depth + 1, true);
      }
    };

    const root = spine[0];
    walk(root, this.spineLabel(tree, root), 0, true);
    return rows;
  }

  private spineLabel(tree: Hierarchy, iri: string): string {
    if (iri === tree.termIri) {
      return tree.termLabel;
    }
    return (tree.path ?? []).find((step) => step.termIri === iri)?.termLabel ?? iri;
  }

  /** Chooses a term reached by browsing rather than by searching. */
  protected chooseNode(hit: Hit, row: TreeRow): void {
    this.choose({
      type: 'class',
      sourceSystem: hit.sourceSystem,
      sourceAcronym: row.acronym,
      termIri: row.iri,
      termType: 'class',
      termLabel: row.label,
      obsolete: false,
      hasChildren: row.hasChildren,
      descendantCount: row.descendantCount,
    });
  }

  /** How many releases this ontology has, when it has more than the one on the row. */
  protected versionCount(acronym: string): number | undefined {
    const source = this.sourceOf(acronym);
    const count = source?.versionCount ?? 1;
    return source?.pinnable === true && count > 1 ? count : undefined;
  }

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
