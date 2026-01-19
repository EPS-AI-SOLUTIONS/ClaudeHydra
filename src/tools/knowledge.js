import VectorStore from '../memory/vector-store.js';

const knowledgeAddTool = {
  name: 'knowledge_add',
  description: 'Add a text snippet to the long-term vector memory',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The text content to memorize' },
      tags: { type: 'string', description: 'Comma-separated tags' }
    },
    required: ['content']
  },
  execute: async ({ content, tags }) => {
    const id = await VectorStore.addDocument(content, { tags });
    return { success: true, id, message: 'Document vectorized and saved.' };
  }
};

const knowledgeSearchTool = {
  name: 'knowledge_search',
  description: 'Semantically search the vector memory',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results (default: 3)' }
    },
    required: ['query']
  },
  execute: async ({ query, limit }) => {
    const results = await VectorStore.search(query, limit || 3);
    return results.map(r => `[Score: ${r.score.toFixed(2)}] ${r.content}`).join('\n\n');
  }
};

export default [knowledgeAddTool, knowledgeSearchTool];