/**
 * Fuzzy Search Engine with TF-IDF
 * Based on src/cli-enhanced/history.js search features
 * @module cli-unified/history/FuzzySearchEngine
 */

/**
 * Fuzzy Search Engine with TF-IDF scoring
 */
export class FuzzySearchEngine {
  constructor(options = {}) {
    this.documents = [];
    this.index = new Map();
    this.idf = new Map();
    this.caseSensitive = options.caseSensitive ?? false;
    this.minScore = options.minScore ?? 0.1;
  }

  /**
   * Tokenize text into terms
   */
  tokenize(text) {
    if (!this.caseSensitive) {
      text = text.toLowerCase();
    }
    return text
      .split(/[\s\-_.,;:!?'"()\[\]{}]+/)
      .filter(t => t.length > 1);
  }

  /**
   * Calculate term frequency
   */
  termFrequency(term, tokens) {
    const count = tokens.filter(t => t === term).length;
    return count / tokens.length;
  }

  /**
   * Calculate inverse document frequency
   */
  inverseDocumentFrequency(term) {
    const docsWithTerm = this.index.get(term)?.size || 0;
    if (docsWithTerm === 0) return 0;
    return Math.log(this.documents.length / docsWithTerm);
  }

  /**
   * Add document to index
   */
  addDocument(id, text, metadata = {}) {
    const tokens = this.tokenize(text);
    const doc = { id, text, tokens, metadata };

    this.documents.push(doc);
    const docIndex = this.documents.length - 1;

    // Build inverted index
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      if (!this.index.has(token)) {
        this.index.set(token, new Set());
      }
      this.index.get(token).add(docIndex);
    }

    // Update IDF values
    this.updateIDF();

    return docIndex;
  }

  /**
   * Remove document from index
   */
  removeDocument(id) {
    const docIndex = this.documents.findIndex(d => d.id === id);
    if (docIndex === -1) return false;

    const doc = this.documents[docIndex];

    // Remove from inverted index
    for (const token of new Set(doc.tokens)) {
      const termDocs = this.index.get(token);
      if (termDocs) {
        termDocs.delete(docIndex);
        if (termDocs.size === 0) {
          this.index.delete(token);
        }
      }
    }

    // Remove document
    this.documents.splice(docIndex, 1);

    // Rebuild index (document indices changed)
    this.rebuildIndex();

    return true;
  }

  /**
   * Rebuild index from scratch
   */
  rebuildIndex() {
    this.index.clear();
    this.idf.clear();

    for (let i = 0; i < this.documents.length; i++) {
      const doc = this.documents[i];
      const uniqueTokens = new Set(doc.tokens);

      for (const token of uniqueTokens) {
        if (!this.index.has(token)) {
          this.index.set(token, new Set());
        }
        this.index.get(token).add(i);
      }
    }

    this.updateIDF();
  }

  /**
   * Update IDF values
   */
  updateIDF() {
    for (const [term, docs] of this.index) {
      this.idf.set(term, Math.log(this.documents.length / docs.size));
    }
  }

  /**
   * Search documents
   */
  search(query, options = {}) {
    const limit = options.limit ?? 10;
    const queryTokens = this.tokenize(query);

    if (queryTokens.length === 0) {
      return [];
    }

    // Calculate scores for each document
    const scores = new Map();

    for (const term of queryTokens) {
      const docIndices = this.index.get(term);
      if (!docIndices) continue;

      const idf = this.idf.get(term) || 0;

      for (const docIndex of docIndices) {
        const doc = this.documents[docIndex];
        const tf = this.termFrequency(term, doc.tokens);
        const tfidf = tf * idf;

        const currentScore = scores.get(docIndex) || 0;
        scores.set(docIndex, currentScore + tfidf);
      }
    }

    // Sort by score and return top results
    const results = Array.from(scores.entries())
      .filter(([, score]) => score >= this.minScore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([docIndex, score]) => ({
        ...this.documents[docIndex],
        score
      }));

    return results;
  }

  /**
   * Fuzzy match using Levenshtein distance
   */
  fuzzyMatch(str1, str2, threshold = 0.7) {
    if (!this.caseSensitive) {
      str1 = str1.toLowerCase();
      str2 = str2.toLowerCase();
    }

    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // Simple contains check first
    if (str2.includes(str1) || str1.includes(str2)) {
      return 1;
    }

    // Levenshtein distance
    const matrix = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    const similarity = 1 - distance / maxLen;

    return similarity >= threshold ? similarity : 0;
  }

  /**
   * Search with fuzzy matching
   */
  fuzzySearch(query, options = {}) {
    const limit = options.limit ?? 10;
    const threshold = options.threshold ?? 0.5;

    const results = this.documents
      .map((doc, index) => {
        // Check each token for fuzzy match
        let maxScore = 0;
        const queryTokens = this.tokenize(query);

        for (const qToken of queryTokens) {
          for (const dToken of doc.tokens) {
            const score = this.fuzzyMatch(qToken, dToken, threshold);
            maxScore = Math.max(maxScore, score);
          }
        }

        // Also check full text
        const fullTextScore = this.fuzzyMatch(query, doc.text, threshold);
        maxScore = Math.max(maxScore, fullTextScore * 1.5); // Boost full text matches

        return { ...doc, score: maxScore };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  /**
   * Prefix search
   */
  prefixSearch(prefix, options = {}) {
    const limit = options.limit ?? 10;
    const normalizedPrefix = this.caseSensitive ? prefix : prefix.toLowerCase();

    return this.documents
      .filter(doc => {
        const text = this.caseSensitive ? doc.text : doc.text.toLowerCase();
        return text.startsWith(normalizedPrefix);
      })
      .slice(0, limit);
  }

  /**
   * Get document count
   */
  get count() {
    return this.documents.length;
  }

  /**
   * Clear all documents
   */
  clear() {
    this.documents = [];
    this.index.clear();
    this.idf.clear();
  }
}

export function createFuzzySearchEngine(options) {
  return new FuzzySearchEngine(options);
}

export default FuzzySearchEngine;
