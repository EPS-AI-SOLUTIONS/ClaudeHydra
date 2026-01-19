/**
 * Mock Ollama Client for Testing
 */
class OllamaMock {
  constructor() {
    this.models = ['llama3.2:1b', 'llama3.2:3b', 'qwen2.5-coder:1.5b'];
    this.status = 'ok';
  }

  async generate(request) {
    console.log('[Mock] Generating response for:', request.prompt.substring(0, 50) + '...');
    
    if (request.format === 'json') {
      return {
        response: JSON.stringify({ mock: true, result: "Success" }),
        done: true
      };
    }

    return {
      response: "This is a mock response from Ollama.",
      done: true
    };
  }

  async list() {
    return {
      models: this.models.map(name => ({ name }))
    };
  }

  async chat(request) {
     return {
      message: { role: 'assistant', content: 'Mock chat response' },
      done: true
    };
  }
}

export default new OllamaMock();