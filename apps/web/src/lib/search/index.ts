import {
  boundedEditDistance,
  maxEditDistanceFor,
  queryTerms,
  rankDocuments,
  tokenize,
  type RankOptions,
  type RankOutcome,
  type SearchDocument,
} from './ranker';

interface IndexedDocument {
  document: SearchDocument;
  tokens: string[];
}

function prefixKey(token: string): string {
  return token.slice(0, Math.min(3, token.length));
}

export class RunSearchIndex {
  private readonly documents = new Map<string, IndexedDocument>();
  private readonly postings = new Map<string, string[]>();
  private readonly tokensByLength = new Map<number, string[]>();
  private readonly prefixBuckets = new Map<string, string[]>();
  private readonly allTokens: string[] = [];

  get size(): number {
    return this.documents.size;
  }

  addDocuments(documents: Iterable<SearchDocument>): void {
    for (const document of documents) this.upsertDocument(document);
  }

  upsertDocument(document: SearchDocument): void {
    this.removeDocument(document.id);

    const uniqueTokens = new Set<string>(tokenize(document.id));
    for (const field of document.fields) {
      for (const token of tokenize(field.value)) uniqueTokens.add(token);
    }
    const tokens = [...uniqueTokens];

    this.documents.set(document.id, { document, tokens });
    for (const token of tokens) this.addPosting(token, document.id);
  }

  removeDocument(id: string): void {
    const existing = this.documents.get(id);
    if (!existing) return;

    this.documents.delete(id);
    for (const token of existing.tokens) this.removePosting(token, id);
  }

  getDocument(id: string): SearchDocument | undefined {
    return this.documents.get(id)?.document;
  }

  search(query: string, options: RankOptions = {}): RankOutcome {
    const terms = queryTerms(query);
    if (terms.length === 0) {
      return { hits: [], total: 0, truncated: false };
    }

    const termCandidates: Array<Set<string>> = [];
    for (const term of terms) {
      const ids = new Set<string>();
      for (const token of this.matchingTokens(term, options.maxEditDistance)) {
        const posting = this.postings.get(token);
        if (!posting) continue;
        for (const id of posting) ids.add(id);
      }
      if (ids.size === 0) {
        return { hits: [], total: 0, truncated: false };
      }
      termCandidates.push(ids);
    }

    termCandidates.sort((a, b) => a.size - b.size);
    const candidateIds = new Set<string>(termCandidates[0]);
    for (let index = 1; index < termCandidates.length && candidateIds.size > 0; index += 1) {
      const other = termCandidates[index];
      for (const id of candidateIds) {
        if (!other.has(id)) candidateIds.delete(id);
      }
    }

    if (candidateIds.size === 0) {
      return { hits: [], total: 0, truncated: false };
    }

    const candidates: SearchDocument[] = [];
    for (const id of candidateIds) {
      const indexed = this.documents.get(id);
      if (indexed) candidates.push(indexed.document);
    }

    return rankDocuments(candidates, query, options);
  }

  private addPosting(token: string, id: string): void {
    const posting = this.postings.get(token);
    if (posting) {
      posting.push(id);
      return;
    }

    this.postings.set(token, [id]);
    this.registerToken(token);
  }

  private removePosting(token: string, id: string): void {
    const posting = this.postings.get(token);
    if (!posting) return;

    const index = posting.indexOf(id);
    if (index >= 0) posting.splice(index, 1);
    if (posting.length > 0) return;

    this.postings.delete(token);
    this.unregisterToken(token);
  }

  private registerToken(token: string): void {
    const length = token.length;
    const byLength = this.tokensByLength.get(length);
    if (byLength) byLength.push(token);
    else this.tokensByLength.set(length, [token]);

    const key = prefixKey(token);
    const bucket = this.prefixBuckets.get(key);
    if (bucket) bucket.push(token);
    else this.prefixBuckets.set(key, [token]);

    this.allTokens.push(token);
  }

  private unregisterToken(token: string): void {
    const byLength = this.tokensByLength.get(token.length);
    if (byLength) {
      const index = byLength.indexOf(token);
      if (index >= 0) byLength.splice(index, 1);
      if (byLength.length === 0) this.tokensByLength.delete(token.length);
    }

    const key = prefixKey(token);
    const bucket = this.prefixBuckets.get(key);
    if (bucket) {
      const index = bucket.indexOf(token);
      if (index >= 0) bucket.splice(index, 1);
      if (bucket.length === 0) this.prefixBuckets.delete(key);
    }

    const index = this.allTokens.indexOf(token);
    if (index >= 0) this.allTokens.splice(index, 1);
  }

  private matchingTokens(term: string, maxEditDistance?: number): Set<string> {
    const matches = new Set<string>();

    if (this.postings.has(term)) matches.add(term);

    const bucket = this.prefixBuckets.get(prefixKey(term));
    if (bucket) {
      for (const token of bucket) {
        if (token !== term && token.startsWith(term)) matches.add(token);
      }
    }

    if (term.length >= 2) {
      for (const token of this.allTokens) {
        if (token.length < term.length || token === term || token.startsWith(term)) continue;
        if (token.includes(term)) matches.add(token);
      }
    }

    if (matches.size > 0) return matches;

    const distance = maxEditDistanceFor(term, maxEditDistance);
    if (distance <= 0) return matches;

    const minimumLength = Math.max(1, term.length - distance);
    const maximumLength = term.length + distance;
    for (let length = minimumLength; length <= maximumLength; length += 1) {
      const tokens = this.tokensByLength.get(length);
      if (!tokens) continue;
      for (const token of tokens) {
        if (matches.has(token)) continue;
        if (boundedEditDistance(term, token, distance) <= distance) {
          matches.add(token);
        }
      }
    }

    return matches;
  }
}

export function createRunSearchIndex(documents: Iterable<SearchDocument> = []): RunSearchIndex {
  const index = new RunSearchIndex();
  index.addDocuments(documents);
  return index;
}
