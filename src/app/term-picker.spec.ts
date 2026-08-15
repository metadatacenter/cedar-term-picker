import { TestBed } from '@angular/core/testing';
import { TermPicker } from './term-picker';
import { TAB_ORDER } from './search/search-types';
import { TerminologyClient } from './search/terminology-client';
import { SearchQuery, SearchResponse } from './search/search-types';

/** A client that answers from a fixture, so these specs need no server. */
class StubClient {
  lastQuery: SearchQuery | null = null;
  response: SearchResponse = {
    query: 'melanoma',
    sources: [
      {
        sourceSystem: 'bioportal',
        sourceAcronym: 'NCIT',
        sourceName: 'National Cancer Institute Thesaurus',
        served: 'local',
        pinnable: true,
        version: { id: 'hash', declaredVersion: '26.07d' },
      },
      { sourceSystem: 'bioportal', sourceAcronym: 'DOID', served: 'local', pinnable: true },
      {
        sourceSystem: 'agroportal',
        sourceAcronym: 'GONE',
        served: 'unavailable',
        pinnable: false,
        reason: 'sourceUnknown',
      },
    ],
    results: {
      class: {
        totalCount: 5439,
        countCapped: false,
        distinctLabelCount: 2552,
        distinctLabelCountCapped: false,
        page: 1,
        pageSize: 25,
        collection: [
          {
            type: 'class',
            sourceSystem: 'bioportal',
            sourceAcronym: 'NCIT',
            termIri: 'http://ncit/Melanoma',
            termType: 'class',
            termLabel: 'Melanoma',
            obsolete: false,
            hasChildren: true,
            descendantCount: 321,
          },
          {
            type: 'class',
            sourceSystem: 'bioportal',
            sourceAcronym: 'DOID',
            termIri: 'http://doid/melanoma',
            termType: 'class',
            termLabel: 'melanoma',
            obsolete: false,
            hasChildren: true,
            descendantCount: 31,
          },
        ],
      },
    },
  };

  async search(query: SearchQuery): Promise<SearchResponse> {
    this.lastQuery = query;
    return this.response;
  }
}

describe('TermPicker', () => {
  let client: StubClient;

  beforeEach(() => {
    client = new StubClient();
    TestBed.configureTestingModule({ providers: [{ provide: TerminologyClient, useValue: client }] });
  });

  function shadow(fixture: { nativeElement: { shadowRoot: ShadowRoot } }): ShadowRoot {
    return fixture.nativeElement.shadowRoot;
  }

  async function settle(): Promise<void> {
    // The search is debounced, so a spec has to wait the debounce out rather than the microtask.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  it('names the four kinds a query answers', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    await fixture.whenStable();
    const tabs = [...shadow(fixture).querySelectorAll('.tab')].map(
      (tab) => (tab.textContent ?? '').trim().split(/\s+/)[0],
    );
    expect(tabs).toEqual(TAB_ORDER.map((kind) => (kind === 'valueSet' ? 'value' : tabsLabel(kind))));
  });

  it('collapses identical labels into one row, counting the ontologies that offer it', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    fixture.componentRef.setInput('query', 'melanoma');
    await fixture.whenStable();
    await settle();
    await fixture.whenStable();

    const rows = [...shadow(fixture).querySelectorAll('.rowhead')];
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('2 ontologies');
  });

  it('shows the collapsed count on the terms tab, not the hit count', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    fixture.componentRef.setInput('query', 'melanoma');
    await fixture.whenStable();
    await settle();
    await fixture.whenStable();

    const terms = shadow(fixture).querySelector('.tab');
    expect(terms?.textContent).toContain('2,552');
    expect(terms?.textContent).not.toContain('5,439');
  });

  it('reports a source it could not search rather than letting it look like no matches', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    fixture.componentRef.setInput('query', 'melanoma');
    await fixture.whenStable();
    await settle();
    await fixture.whenStable();

    const notice = shadow(fixture).querySelector('.notice');
    expect(notice?.textContent).toContain('GONE');
    expect(notice?.textContent).toContain('sourceUnknown');
  });

  it('offers the release count only where there is more than one release', async () => {
    client.response = {
      ...client.response,
      sources: [
        { ...client.response.sources[0], versionCount: 3 },
        { ...client.response.sources[1], versionCount: 1 },
        client.response.sources[2],
      ],
      results: {
        branch: {
          totalCount: 2,
          countCapped: false,
          page: 1,
          pageSize: 25,
          collection: [
            {
              type: 'branch',
              sourceSystem: 'bioportal',
              sourceAcronym: 'NCIT',
              termBaseIri: 'http://ncit/Melanoma',
              termBaseLabel: 'Melanoma',
              descendantCount: 321,
              obsolete: false,
            },
            {
              type: 'branch',
              sourceSystem: 'bioportal',
              sourceAcronym: 'DOID',
              termBaseIri: 'http://doid/melanoma',
              termBaseLabel: 'melanoma',
              descendantCount: 31,
              obsolete: false,
            },
          ],
        },
      },
    };
    const fixture = TestBed.createComponent(TermPicker);
    fixture.componentRef.setInput('query', 'melanoma');
    await fixture.whenStable();
    await settle();
    await fixture.whenStable();

    shadow(fixture).querySelectorAll<HTMLButtonElement>('.tab')[1].click();
    await fixture.whenStable();

    // Both branches carry the same label, so they fold into one row and the ontologies sit inside it.
    const rows = shadow(fixture).querySelectorAll('.rowhead');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('2 ontologies');

    rows[0].dispatchEvent(new Event('click'));
    await fixture.whenStable();

    // One release is nothing to open, so that row shows its version and no way in.
    expect(shadow(fixture).querySelectorAll('button.of').length).toBe(1);
    expect(shadow(fixture).querySelectorAll('.version').length).toBe(2);
  });

  it('emits no version while the author stays on latest', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    fixture.componentRef.setInput('query', 'melanoma');
    await fixture.whenStable();
    await settle();
    await fixture.whenStable();

    let emitted: unknown = null;
    fixture.componentInstance.selected.subscribe((constraint) => (emitted = constraint));
    shadow(fixture).querySelector<HTMLButtonElement>('.rowhead')?.click();
    await fixture.whenStable();
    // A row is chosen by confirming it, not by a single click, so this is the double click.
    shadow(fixture)
      .querySelector<HTMLElement>('.child.pick')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    // Freeze-on-publish resolves an unpinned constraint at publish time, so latest keeps meaning
    // latest until then. Writing today's version instead would silently pin it.
    expect(emitted).not.toBeNull();
    expect((emitted as { version?: unknown }).version).toBeUndefined();
  });

  it('pages one tab without moving the others, and keeps the sources it learns', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    fixture.componentRef.setInput('query', 'melanoma');
    await fixture.whenStable();
    await settle();
    await fixture.whenStable();

    // Page two names an ontology page one never did; a row reads its name from the envelope, so the
    // blocks have to accumulate rather than be replaced.
    client.response = {
      ...client.response,
      sources: [
        {
          sourceSystem: 'bioportal',
          sourceAcronym: 'LATER',
          sourceName: 'An Ontology From Page Two',
          served: 'local',
          pinnable: true,
        },
      ],
      results: {
        class: {
          totalCount: 5439,
          countCapped: false,
          distinctLabelCount: 2552,
          distinctLabelCountCapped: false,
          page: 2,
          pageSize: 25,
          collection: [
            {
              type: 'class',
              sourceSystem: 'bioportal',
              sourceAcronym: 'LATER',
              termIri: 'http://later/melanoma',
              termType: 'class',
              termLabel: 'Intraocular melanoma',
              obsolete: false,
              hasChildren: false,
              descendantCount: 0,
            },
          ],
        },
      },
    };

    const next = [...shadow(fixture).querySelectorAll<HTMLButtonElement>('.pager button')].find((b) =>
      (b.textContent ?? '').includes('Next'),
    );
    next?.click();
    await fixture.whenStable();
    await fixture.whenStable();

    // Only the terms were asked for.
    expect(client.lastQuery?.types).toEqual(['class']);
    expect(client.lastQuery?.page).toBe(2);

    shadow(fixture).querySelector<HTMLButtonElement>('.rowhead')?.click();
    await fixture.whenStable();
    expect(shadow(fixture).querySelector('.child')?.textContent).toContain('An Ontology From Page Two');
  });

  it('narrows every tab at once, and re-asks from page one', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    fixture.componentRef.setInput('query', 'melanoma');
    await fixture.whenStable();
    await settle();
    await fixture.whenStable();

    fixture.componentInstance['toggleNarrowing']('NCIT');
    await settle();
    await fixture.whenStable();

    // One filter, carried on the request rather than applied to the rows that came back.
    expect(client.lastQuery?.sources).toEqual([{ sourceAcronym: 'NCIT' }]);
    expect(client.lastQuery?.page).toBeUndefined();
    expect(shadow(fixture).querySelector('.narrowing')?.textContent).toContain('NCIT');

    fixture.componentInstance['clearNarrowing']();
    await settle();
    await fixture.whenStable();
    expect(client.lastQuery?.sources).toBeUndefined();
    // The bar stays — it carries the way back in — but the chips go with the filter.
    expect(shadow(fixture).querySelectorAll('.chip.removable').length).toBe(0);
    expect(shadow(fixture).querySelector('.narrowing')?.textContent).toContain('every ontology');
  });

  it('tells the host when the author closes without choosing', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    await fixture.whenStable();
    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancelled += 1));
    shadow(fixture).querySelector<HTMLButtonElement>('.dismiss')?.click();
    expect(cancelled).toBe(1);
  });
});

function tabsLabel(kind: string): string {
  return kind === 'class' ? 'terms' : kind === 'branch' ? 'branches' : 'ontologies';
}
