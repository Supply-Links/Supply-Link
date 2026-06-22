import { describe, it, expect, beforeEach } from 'vitest';
import type { Product } from '@/lib/types';
import {
  searchProducts,
  parseQuerySyntax,
  trackSearchEvent,
  getSearchAnalytics,
  getPopularSearchTerms,
  getZeroResultQueries,
  saveQuery,
  getSavedQueries,
  deleteSavedQuery,
} from '@/lib/services/searchService';

const makeProduct = (overrides: Partial<Product> & { id: string; name: string }): Product => ({
  owner: 'GOWNER1234567890ABCDEFGHIJKLMNOPQRSTUVWX',
  origin: 'Ethiopia',
  timestamp: 1_700_000_000_000,
  active: true,
  authorizedActors: [],
  ...overrides,
});

const PRODUCTS: Product[] = [
  makeProduct({
    id: 'p1',
    name: 'Organic Coffee Beans',
    origin: 'Ethiopia',
    category: 'agricultural',
    subcategory: 'coffee',
    active: true,
  }),
  makeProduct({
    id: 'p2',
    name: 'Fair Trade Cocoa',
    origin: 'Ghana',
    category: 'agricultural',
    subcategory: 'cocoa',
    active: true,
  }),
  makeProduct({
    id: 'p3',
    name: 'Aspirin 500mg',
    origin: 'Germany',
    category: 'pharmaceutical',
    active: false,
  }),
  makeProduct({
    id: 'p4',
    name: 'Laptop Pro',
    origin: 'Taiwan',
    category: 'electronics',
    active: true,
    timestamp: 1_800_000_000_000,
  }),
];

// ── parseQuerySyntax ──────────────────────────────────────────────────────────

describe('parseQuerySyntax', () => {
  it('returns empty result for empty string', () => {
    const r = parseQuerySyntax('');
    expect(r.required).toHaveLength(0);
    expect(r.optional).toHaveLength(0);
    expect(r.excluded).toHaveLength(0);
    expect(r.phrases).toHaveLength(0);
  });

  it('parses + and - prefixes', () => {
    const r = parseQuerySyntax('+coffee -recalled organic');
    expect(r.required).toContain('coffee');
    expect(r.excluded).toContain('recalled');
    expect(r.optional).toContain('organic');
  });

  it('maps AND → required and NOT → excluded', () => {
    const r = parseQuerySyntax('coffee AND organic NOT recalled');
    expect(r.required).toContain('organic');
    expect(r.excluded).toContain('recalled');
    expect(r.optional).toContain('coffee');
  });

  it('extracts quoted phrases', () => {
    const r = parseQuerySyntax('"fair trade" cocoa');
    expect(r.phrases).toContain('fair trade');
    expect(r.optional).toContain('cocoa');
  });
});

// ── searchProducts – full-text ────────────────────────────────────────────────

describe('searchProducts – full-text', () => {
  it('returns all products when no query', () => {
    const { items, total } = searchProducts(PRODUCTS, {});
    expect(total).toBe(4);
    expect(items).toHaveLength(4);
  });

  it('finds products by name keyword', () => {
    const { items } = searchProducts(PRODUCTS, { text: 'coffee' });
    expect(items.map((p) => p.id)).toContain('p1');
  });

  it('finds products by origin', () => {
    const { items } = searchProducts(PRODUCTS, { text: 'Ethiopia' });
    expect(items.map((p) => p.id)).toContain('p1');
  });

  it('excludes products with - prefix', () => {
    const { items } = searchProducts(PRODUCTS, { text: '-pharmaceutical' });
    expect(items.map((p) => p.id)).not.toContain('p3');
  });

  it('requires + terms', () => {
    const { items } = searchProducts(PRODUCTS, { text: '+pharmaceutical' });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('p3');
  });

  it('matches exact phrase', () => {
    const { items } = searchProducts(PRODUCTS, { text: '"fair trade"' });
    expect(items.map((p) => p.id)).toContain('p2');
    expect(items.map((p) => p.id)).not.toContain('p1');
  });

  it('returns zero results for no matches', () => {
    const { total } = searchProducts(PRODUCTS, { text: '+nonexistentterm' });
    expect(total).toBe(0);
  });

  it('ranks name-field matches higher than corpus matches', () => {
    const { items } = searchProducts(PRODUCTS, { text: 'organic' });
    // p1 has "Organic" in name – should come first
    expect(items[0].id).toBe('p1');
  });
});

// ── searchProducts – filters ──────────────────────────────────────────────────

describe('searchProducts – filters', () => {
  it('filters by category', () => {
    const { items } = searchProducts(PRODUCTS, { filters: { category: 'agricultural' } });
    expect(items).toHaveLength(2);
    expect(items.map((p) => p.id).sort()).toEqual(['p1', 'p2'].sort());
  });

  it('filters by subcategory', () => {
    const { items } = searchProducts(PRODUCTS, { filters: { subcategory: 'coffee' } });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('p1');
  });

  it('filters by status active', () => {
    const { items } = searchProducts(PRODUCTS, { filters: { status: 'active' } });
    expect(items.every((p) => p.active)).toBe(true);
  });

  it('filters by status inactive', () => {
    const { items } = searchProducts(PRODUCTS, { filters: { status: 'inactive' } });
    expect(items.every((p) => !p.active)).toBe(true);
  });

  it('combines text and filter', () => {
    const { items } = searchProducts(PRODUCTS, {
      text: 'coffee',
      filters: { status: 'active' },
    });
    expect(items.map((p) => p.id)).toContain('p1');
    items.forEach((p) => expect(p.active).toBe(true));
  });
});

// ── searchProducts – facets ───────────────────────────────────────────────────

describe('searchProducts – facets', () => {
  it('builds category facets from results', () => {
    const { facets } = searchProducts(PRODUCTS, {});
    expect(facets.categories['agricultural']).toBe(2);
    expect(facets.categories['pharmaceutical']).toBe(1);
    expect(facets.categories['electronics']).toBe(1);
  });

  it('builds status facets', () => {
    const { facets } = searchProducts(PRODUCTS, {});
    expect(facets.statuses['active']).toBe(3);
    expect(facets.statuses['inactive']).toBe(1);
  });

  it('builds subcategory facets', () => {
    const { facets } = searchProducts(PRODUCTS, {});
    expect(facets.subcategories['coffee']).toBe(1);
    expect(facets.subcategories['cocoa']).toBe(1);
  });

  it('facets reflect filtered results not full corpus', () => {
    const { facets } = searchProducts(PRODUCTS, { filters: { category: 'agricultural' } });
    expect(facets.categories['agricultural']).toBe(2);
    expect(facets.categories['pharmaceutical']).toBeUndefined();
  });
});

// ── searchProducts – pagination ───────────────────────────────────────────────

describe('searchProducts – pagination', () => {
  it('respects limit', () => {
    const { items, total } = searchProducts(PRODUCTS, { limit: 2 });
    expect(items).toHaveLength(2);
    expect(total).toBe(4);
  });

  it('respects offset', () => {
    const all = searchProducts(PRODUCTS, {}).items.map((p) => p.id);
    const { items } = searchProducts(PRODUCTS, { offset: 1, limit: 2 });
    expect(items.map((p) => p.id)).toEqual(all.slice(1, 3));
  });

  it('caps limit at 100', () => {
    const big = Array.from({ length: 150 }, (_, i) =>
      makeProduct({ id: `x${i}`, name: `Product ${i}` }),
    );
    const { items } = searchProducts(big, { limit: 200 });
    expect(items).toHaveLength(100);
  });
});

// ── searchProducts – performance ──────────────────────────────────────────────

describe('searchProducts – performance', () => {
  it('responds within 200 ms for 1000 products', () => {
    const large = Array.from({ length: 1000 }, (_, i) =>
      makeProduct({
        id: `p${i}`,
        name: `Product ${i} label`,
        origin: i % 2 === 0 ? 'Ethiopia' : 'Ghana',
        category: i % 3 === 0 ? 'agricultural' : 'electronics',
        active: i % 5 !== 0,
      }),
    );
    const start = Date.now();
    searchProducts(large, { text: '+agricultural Ethiopia', filters: { status: 'active' } });
    expect(Date.now() - start).toBeLessThan(200);
  });
});

// ── analytics ────────────────────────────────────────────────────────────────

describe('search analytics', () => {
  beforeEach(() => {
    // drain buffer state by adding a unique event – we just verify new events appear
  });

  it('trackSearchEvent stores events retrievable via getSearchAnalytics', () => {
    const before = getSearchAnalytics(200).length;
    trackSearchEvent({
      query: 'coffee',
      filters: {},
      resultCount: 3,
      queryTimeMs: 12,
      timestamp: Date.now(),
    });
    expect(getSearchAnalytics(200).length).toBe(before + 1);
  });

  it('getPopularSearchTerms returns most frequent queries', () => {
    for (let i = 0; i < 3; i++) {
      trackSearchEvent({
        query: 'unique_term_xyz',
        filters: {},
        resultCount: 1,
        queryTimeMs: 5,
        timestamp: Date.now(),
      });
    }
    trackSearchEvent({
      query: 'less_common_abc',
      filters: {},
      resultCount: 1,
      queryTimeMs: 5,
      timestamp: Date.now(),
    });
    const terms = getPopularSearchTerms(5);
    const top = terms.find((t) => t.term === 'unique_term_xyz');
    const second = terms.find((t) => t.term === 'less_common_abc');
    expect(top).toBeDefined();
    expect(second).toBeDefined();
    expect(top!.count).toBeGreaterThan(second!.count);
  });

  it('getZeroResultQueries returns only zero-result events', () => {
    trackSearchEvent({
      query: 'zeroresult_query',
      filters: {},
      resultCount: 0,
      queryTimeMs: 2,
      timestamp: Date.now(),
    });
    const zeros = getZeroResultQueries(50);
    expect(zeros.every((e) => e.resultCount === 0)).toBe(true);
    expect(zeros.some((e) => e.query === 'zeroresult_query')).toBe(true);
  });
});

// ── saved queries ─────────────────────────────────────────────────────────────

describe('saved queries', () => {
  it('saves and retrieves a query by userId', () => {
    const saved = saveQuery('user-1', 'My Query', {
      text: 'coffee',
      filters: { status: 'active' },
    });
    expect(saved.id).toBeTruthy();
    const list = getSavedQueries('user-1');
    expect(list.some((q) => q.id === saved.id)).toBe(true);
  });

  it('does not return queries for a different user', () => {
    saveQuery('user-A', 'A Query', { text: 'beans' });
    const list = getSavedQueries('user-B-unique');
    expect(list.some((q) => q.name === 'A Query')).toBe(false);
  });

  it('deletes a saved query', () => {
    const saved = saveQuery('user-2', 'To Delete', { text: 'temp' });
    expect(deleteSavedQuery(saved.id)).toBe(true);
    expect(getSavedQueries('user-2').some((q) => q.id === saved.id)).toBe(false);
  });
});
