import { Injectable } from '@angular/core';
import { Hierarchy, SearchQuery, SearchResponse } from './search-types';

/**
 * The picker's one call to the terminology server.
 *
 * Framework-free apart from the decorator: no Angular types cross this boundary, so what it returns
 * can be tested without a DOM and the component holds no knowledge of HTTP.
 */
@Injectable({ providedIn: 'root' })
export class TerminologyClient {
  /** Same-origin, so the dev server's proxy sends it on and no CORS question arises. */
  private readonly endpoint = '/search';

  /**
   * Runs a search, or reports why the server would not.
   *
   * A refusal is not an error to swallow. "Needs at least two characters" and "no local store" are
   * answers the author has to see, and are the difference between a search that found nothing and
   * one that never ran.
   */
  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResponse> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(refusalMessage(body) ?? `The terminology server answered ${response.status}.`);
    }
    return body as SearchResponse;
  }

  /**
   * Where one term sits in its ontology.
   *
   * Its own call rather than part of a search: a page of results is twenty-five terms and an author
   * asks this of one. Returns null when the store does not hold the term, which is an answer rather
   * than a failure — a proxied source has no hierarchy to give.
   */
  async hierarchy(
    sourceAcronym: string,
    termIri: string,
    versionId?: string,
    signal?: AbortSignal,
    filter?: string,
    offset?: number,
  ): Promise<Hierarchy | null> {
    const query = new URLSearchParams({ sourceAcronym, termIri });
    if (versionId) {
      query.set('versionId', versionId);
    }
    if (filter && filter.trim() !== '') {
      query.set('filter', filter.trim());
    }
    if (offset) {
      query.set('offset', String(offset));
    }
    const response = await fetch(`${this.endpoint}/hierarchy?${query}`, { signal });
    if (response.status === 404) {
      return null;
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(refusalMessage(body) ?? `The terminology server answered ${response.status}.`);
    }
    return body as Hierarchy;
  }
}

function refusalMessage(body: unknown): string | null {
  if (body === null || typeof body !== 'object') {
    return null;
  }
  const message = (body as { errorMessage?: unknown }).errorMessage;
  return typeof message === 'string' && message.length > 0 ? message : null;
}
