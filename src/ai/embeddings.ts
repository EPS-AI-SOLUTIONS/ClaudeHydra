import http from 'node:http';
import { MODELS } from '../constants.js';
import Logger from '../logger.js';

class EmbeddingService {
  constructor() {
    this.model = MODELS.EMBEDDING || 'nomic-embed-text';
    this.host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  }

  async generate(text) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: this.model,
        prompt: text,
      });

      const url = new URL(`${this.host}/api/embeddings`);
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      };

      const req = http.request(url, options, (res) => {
        let responseBody = '';

        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(responseBody);
              resolve(parsed.embedding);
            } catch (e) {
              reject(new Error(`Failed to parse embedding response: ${e.message}`));
            }
          } else {
            reject(new Error(`Ollama API Error: ${res.statusCode} - ${responseBody}`));
          }
        });
      });

      req.on('error', (err) => {
        Logger.error('Embedding generation failed', { error: err.message });
        reject(err);
      });

      req.write(data);
      req.end();
    });
  }
}

export default new EmbeddingService();
