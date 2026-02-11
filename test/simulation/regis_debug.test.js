/**
 * @fileoverview Tests for Swarm Bridge Tool
 * Tests the HydraSwarmTool and SwarmStatusTool classes
 */

import { describe, expect, it } from 'vitest';

// Import the tools and processor
import { tools } from '../../src/tools/swarm-bridge.js';

describe('Swarm Bridge Tool', () => {
  describe('SwarmStatusTool', () => {
    it('should be properly instantiated', () => {
      expect(tools.swarmStatus).toBeDefined();
      expect(tools.swarmStatus.name).toBe('swarm_status');
      expect(tools.swarmStatus.description.toLowerCase()).toContain('swarm');
    });

    it('should report swarm as unavailable when swarm.js is missing', async () => {
      const result = await tools.swarmStatus.execute({});

      expect(result.success).toBe(true);
      expect(result.data.available).toBe(false);
      expect(result.data.error).toBeTruthy();
    });

    it('should return capabilities array', async () => {
      const result = await tools.swarmStatus.execute({});

      expect(result.data.capabilities).toBeInstanceOf(Array);
    });
  });

  describe('HydraSwarmTool', () => {
    it('should be properly instantiated', () => {
      expect(tools.hydraSwarm).toBeDefined();
      expect(tools.hydraSwarm.name).toBe('hydra_swarm');
      expect(tools.hydraSwarm.description.toLowerCase()).toContain('swarm');
    });

    it('should have correct input schema', () => {
      const schema = tools.hydraSwarm.getJsonSchema();

      // Zod schema may be nested differently
      expect(schema).toBeDefined();
      // Check that prompt is somewhere in the schema
      const schemaStr = JSON.stringify(schema);
      expect(schemaStr).toContain('prompt');
    });

    it('should fail gracefully when swarm engine is unavailable', async () => {
      const result = await tools.hydraSwarm.execute({
        prompt: 'Test task for the swarm',
      });

      // Should fail gracefully since swarm.js doesn't exist
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/SWARM_UNAVAILABLE|swarm/i);
    });

    it('should validate input before execution', async () => {
      const result = await tools.hydraSwarm.execute({
        // Missing required 'prompt' field
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('Tool Registry Format', () => {
    it('tools object should have correct structure', () => {
      expect(tools).toHaveProperty('hydraSwarm');
      expect(tools).toHaveProperty('swarmStatus');
    });

    it('tools should have execute method', () => {
      expect(typeof tools.hydraSwarm.execute).toBe('function');
      expect(typeof tools.swarmStatus.execute).toBe('function');
    });
  });
});
