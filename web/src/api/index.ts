import { Hono } from 'hono';
import anthropic from './anthropic';
import bridge from './bridge';
import chats from './chats';
import claude from './claude';
import debug from './debug';
import learning from './learning';
import memory from './memory';
import { errorHandler } from './middleware/error-handler';
import ollama from './ollama';
import system from './system';

const app = new Hono().basePath('/api');

// Global error handler
app.use('*', errorHandler);

// Mount route modules
app.route('/chats', chats);
app.route('/ollama-local', ollama);
app.route('/bridge', bridge);
app.route('/memory', memory);
app.route('/learning', learning);
app.route('/debug', debug);
app.route('/claude', claude);
app.route('/anthropic', anthropic);
app.route('/system', system);

// Health check
app.get('/health', (c) => c.json({ ok: true, timestamp: Date.now() }));

export default app;
