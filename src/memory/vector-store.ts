import Logger from '../logger.js';
import EmbeddingService from '../ai/embeddings.js';
import { JsonDbAdapter } from '../db/index.js';

// Utility: Calculate Cosine Similarity
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

class VectorStore {
  constructor() {
    this.db = new JsonDbAdapter('vectors.json');
    this.collection = 'knowledge_base';
  }

  async addDocument(content, metadata = {}) {
    try {
      Logger.info('Generating embedding for document...');
      const vector = await EmbeddingService.generate(content);
      
      const doc = {
        id: Date.now().toString(36),
        content,
        vector,
        metadata,
        timestamp: new Date().toISOString()
      };

      this.db.push(this.collection, doc);
      Logger.info('Document added to vector store', { id: doc.id });
      return doc.id;
    } catch (error) {
      Logger.error('Failed to add document to vector store', { error: error.message });
      throw error;
    }
  }

  async search(query, limit = 3, threshold = 0.5) {
    try {
      const queryVector = await EmbeddingService.generate(query);
      const docs = this.db.get(this.collection);
      
      if (!docs || docs.length === 0) return [];

      const results = docs.map(doc => ({
        content: doc.content,
        metadata: doc.metadata,
        score: cosineSimilarity(queryVector, doc.vector)
      }))
      .filter(res => res.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

      Logger.info(`Vector search found ${results.length} matches`);
      return results;
    } catch (error) {
      Logger.error('Vector search failed', { error: error.message });
      return [];
    }
  }
}

export default new VectorStore();