import { z } from 'zod';

// Schema for 'hydra_swarm' tool
export const swarmSchema = z.object({
  prompt: z.string().min(10, "Prompt must be at least 10 characters long"),
  agents: z.array(z.string()).optional(),
  saveMemory: z.boolean().default(true),
  title: z.string().optional()
});

// Schema for 'ollama_generate' tool
export const generateSchema = z.object({
  prompt: z.string(),
  model: z.string().default('llama3.2:3b'),
  format: z.enum(['json', 'text']).optional(),
  temperature: z.number().min(0).max(1).default(0.7)
});