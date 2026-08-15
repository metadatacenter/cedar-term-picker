import { Page, Route } from '@playwright/test';

/**
 * Fixtures shaped like the terminology server's answers, and the plumbing to serve them.
 *
 * Written by hand rather than recorded, so each one is the smallest response that provokes the
 * behaviour under test. Where a number is real it is noted: the counts for "melanoma" and
 * "disease" are what the served catalog returns, because a fixture that flatters the component
 * proves nothing about the rows an author will actually read.
 */

export interface Recorded {
  readonly bodies: unknown[];
}

/** Serves a response per request, choosing by what the component asked for. */
export async function stubSearch(
  page: Page,
  reply: (body: SearchBody) => unknown,
): Promise<Recorded> {
  const recorded: { bodies: unknown[] } = { bodies: [] };
  await page.route('**/search', async (route: Route) => {
    const body = route.request().postDataJSON() as SearchBody;
    recorded.bodies.push(body);
    await route.fulfill({ json: answer(reply(body), body) as object });
  });
  return recorded;
}

/**
 * A stub answers the page it was asked for, or it answers nothing.
 *
 * The picker appends what comes back and keeps asking until a page arrives short, so a stub that
 * returns its one fixture for every page would have the list append that fixture to itself. A
 * response whose results are not marked with the page requested is not an answer to that request.
 */
function answer(replied: unknown, body: SearchBody): unknown {
  const asked = body.page ?? 1;
  if (asked === 1) {
    return replied;
  }
  const results = (replied as { results?: Record<string, { page?: number }> } | undefined)?.results ?? {};
  const matches = Object.values(results).some((result) => (result.page ?? 1) === asked);
  return matches ? replied : { sources: [], results: {} };
}

export interface SearchBody {
  readonly query: string;
  readonly types?: readonly string[];
  readonly sources?: readonly { sourceAcronym: string }[];
  readonly page?: number;
  readonly includeVersions?: boolean;
  readonly ontologyOrder?: string;
}

interface SourceOptions {
  readonly name?: string;
  readonly versionCount?: number;
  readonly declaredVersion?: string;
  readonly served?: 'local' | 'proxied' | 'unavailable';
  readonly reason?: string;
  readonly versions?: readonly { id: string; declaredVersion: string }[];
}

export function source(acronym: string, options: SourceOptions = {}): object {
  return {
    sourceSystem: 'bioportal',
    sourceAcronym: acronym,
    sourceName: options.name,
    served: options.served ?? 'local',
    pinnable: (options.served ?? 'local') === 'local',
    version: options.declaredVersion ? { id: 'hash', declaredVersion: options.declaredVersion } : undefined,
    versionCount: options.versionCount,
    versions: options.versions,
    reason: options.reason,
  };
}

interface ClassOptions {
  readonly under?: string;
  readonly obsolete?: boolean;
  readonly matched?: { label: string; language?: string };
  readonly descendantCount?: number;
}

export function classHit(acronym: string, label: string, options: ClassOptions = {}): object {
  return {
    type: 'class',
    sourceSystem: 'bioportal',
    sourceAcronym: acronym,
    termIri: `http://${acronym.toLowerCase()}/${encodeURIComponent(label)}`,
    termType: 'class',
    termLabel: label,
    obsolete: options.obsolete ?? false,
    hasChildren: (options.descendantCount ?? 0) > 0,
    descendantCount: options.descendantCount ?? 0,
    matchType: options.matched ? 'synonym' : 'termLabel',
    matchedLabels: options.matched ? [options.matched] : undefined,
    path: options.under ? [{ termIri: `http://${acronym.toLowerCase()}/parent`, termLabel: options.under }] : undefined,
  };
}

export function branchHit(acronym: string, label: string, parent: string, descendants: number): object {
  return {
    type: 'branch',
    sourceSystem: 'bioportal',
    sourceAcronym: acronym,
    termBaseIri: `http://${acronym.toLowerCase()}/${encodeURIComponent(label)}/${encodeURIComponent(parent)}`,
    termBaseLabel: label,
    descendantCount: descendants,
    obsolete: false,
    matchType: 'termLabel',
    path: [{ termIri: `http://${acronym.toLowerCase()}/${encodeURIComponent(parent)}`, termLabel: parent }],
  };
}

export function ontologyHit(acronym: string, matchCount: number, byName: boolean): object {
  return {
    type: 'ontology',
    sourceSystem: 'bioportal',
    sourceAcronym: acronym,
    matchType: byName ? 'sourceName' : 'terms',
    matchCount,
  };
}

interface ResultsOptions {
  readonly totalCount?: number;
  readonly distinctLabelCount?: number;
  readonly distinctLabelCountCapped?: boolean;
  readonly page?: number;
}

export function results(collection: readonly object[], options: ResultsOptions = {}): object {
  return {
    totalCount: options.totalCount ?? collection.length,
    countCapped: false,
    distinctLabelCount: options.distinctLabelCount,
    distinctLabelCountCapped: options.distinctLabelCountCapped,
    page: options.page ?? 1,
    pageSize: 25,
    collection,
  };
}

/** Opens the host page and waits for the element to have rendered something. */
export async function openPicker(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('cedar-term-picker .picker').waitFor();
}

/** Types a query and waits for the debounce and the reply. */
export async function search(page: Page, query: string): Promise<void> {
  await page.locator('cedar-term-picker input[type=search]').fill(query);
  await page.locator('cedar-term-picker .tabs .badge').first().waitFor();
}
