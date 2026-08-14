import { Injectable } from '@angular/core';
import { SearchQuery, SearchResponse } from './search-types';

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
}

function refusalMessage(body: unknown): string | null {
  if (body === null || typeof body !== 'object') {
    return null;
  }
  const message = (body as { errorMessage?: unknown }).errorMessage;
  return typeof message === 'string' && message.length > 0 ? message : null;
}
