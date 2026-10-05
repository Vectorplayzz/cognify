/**
 * Web Search Service
 *
 * Calls Cognify's backend, which holds the Exa key and forwards the query.
 * No search credentials are shipped to the browser.
 */
import { authHeaders, handleUnauthorized } from './apiService';

const SEARCH_ENDPOINT = '/api/search/web';

export interface ExaSearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  text: string;
  score?: number;
}

export interface ExaSearchResponse {
  results: ExaSearchResult[];
}

class ExaSearchService {
  // Whether the backend has a search provider configured. Assumed available
  // until the backend says otherwise, so the first search is not skipped.
  private available = true;

  isConfigured(): boolean {
    return this.available;
  }

  async search(query: string, numResults: number = 5): Promise<ExaSearchResult[]> {
    if (!this.available) return [];

    try {
      const response = await fetch(SEARCH_ENDPOINT, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ query, numResults }),
      });
      handleUnauthorized(response);

      if (!response.ok) {
        // 503 means the backend has no search provider — stop asking.
        if (response.status === 503) this.available = false;
        const error = await response.text();
        console.error(`[Search] Failed (${response.status}):`, error);
        return [];
      }

      const data: ExaSearchResponse = await response.json();
      return data.results || [];
    } catch (err) {
      console.error('[Exa] Search error:', err);
      return [];
    }
  }

  formatResultsForPrompt(results: ExaSearchResult[]): string {
    if (results.length === 0) return '';

    const formatted = results
      .map(
        (r, i) =>
          `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.publishedDate ? `Date: ${r.publishedDate}\n` : ''}${r.text.substring(0, 500)}...`
      )
      .join('\n\n');

    return `### Web Search Results:\n\n${formatted}\n\nUse the above information to provide an accurate, up-to-date response. Cite sources when relevant.`;
  }
}

export const exaSearchService = new ExaSearchService();
