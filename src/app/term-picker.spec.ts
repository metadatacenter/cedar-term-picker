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

  it('tells the host when the author closes without choosing', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    await fixture.whenStable();
    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancelled += 1));
    shadow(fixture).querySelector<HTMLButtonElement>('.ghost')?.click();
    expect(cancelled).toBe(1);
  });
});

function tabsLabel(kind: string): string {
  return kind === 'class' ? 'terms' : kind === 'branch' ? 'branches' : 'ontologies';
}
