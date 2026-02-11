import { invoke } from '@tauri-apps/api/core';
import { useCallback, useRef, useState } from 'react';

/**
 * Alzur - AI Trainer Agent
 *
 * Responsible for:
 * 1. Collecting training data from Vilgefortz memories
 * 2. Formatting as training datasets (JSONL)
 * 3. Running fine-tuning on Ollama models
 * 4. Tracking training metrics
 * 5. Managing model checkpoints
 */

// Training data entry format
export interface TrainingEntry {
  id: string;
  prompt: string;
  response: string;
  context?: string[];
  quality_score?: number;
  timestamp: number;
  source: 'vilgefortz' | 'manual' | 'imported';
}

// Training job configuration
export interface TrainingConfig {
  baseModel: string;
  outputModel: string;
  epochs: number;
  learningRate: number;
  batchSize: number;
  warmupSteps: number;
  maxSamples?: number;
}

// Training metrics
export interface TrainingMetrics {
  epoch: number;
  totalEpochs: number;
  loss: number;
  accuracy?: number;
  samplesProcessed: number;
  totalSamples: number;
  elapsedTime: number;
  estimatedTimeRemaining?: number;
}

// Training job status
export interface TrainingJob {
  id: string;
  status: 'pending' | 'preparing' | 'training' | 'completed' | 'failed' | 'cancelled';
  config: TrainingConfig;
  metrics?: TrainingMetrics;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  datasetPath?: string;
  modelPath?: string;
}

// Memory entry from backend
interface MemoryEntry {
  id: string;
  timestamp: string;
  agent: string;
  type: string;
  content: string;
  tags: string;
}

// Default training configuration
const DEFAULT_CONFIG: Partial<TrainingConfig> = {
  epochs: 3,
  learningRate: 0.0001,
  batchSize: 4,
  warmupSteps: 100,
};

/**
 * Parse Vilgefortz memory entry to extract training data
 */
function parseVilgefortzMemory(entry: MemoryEntry): TrainingEntry | null {
  try {
    const content = entry.content;

    // Extract prompt and response from session analysis
    const promptMatch = content.match(/Prompt:\s*(.+?)(?:\.\.\.|$)/s);
    const responseMatch = content.match(/Response length:\s*(\d+)/);

    if (!promptMatch) return null;

    // For now, we store the analysis as a training signal
    // Full prompt-response pairs would need to be captured differently
    return {
      id: entry.id,
      prompt: promptMatch[1].trim(),
      response: content, // Store full analysis for now
      quality_score: responseMatch ? Math.min(100, parseInt(responseMatch[1], 10) / 50) : undefined,
      timestamp: new Date(entry.timestamp).getTime(),
      source: 'vilgefortz',
    };
  } catch {
    return null;
  }
}

/**
 * Format training data as JSONL for Ollama
 */
function formatAsJSONL(entries: TrainingEntry[]): string {
  return entries
    .map((entry) =>
      JSON.stringify({
        prompt: entry.prompt,
        completion: entry.response,
        context: entry.context,
      }),
    )
    .join('\n');
}

/**
 * Calculate training metrics estimate
 */
function estimateTrainingTime(
  samplesCount: number,
  config: TrainingConfig,
): { totalSteps: number; estimatedMinutes: number } {
  const stepsPerEpoch = Math.ceil(samplesCount / config.batchSize);
  const totalSteps = stepsPerEpoch * config.epochs;
  // Rough estimate: ~0.5 seconds per step on average hardware
  const estimatedMinutes = Math.ceil((totalSteps * 0.5) / 60);

  return { totalSteps, estimatedMinutes };
}

/**
 * Main Training Agent Hook
 */
export function useTrainingAgent() {
  const [trainingData, setTrainingData] = useState<TrainingEntry[]>([]);
  const [currentJob, setCurrentJob] = useState<TrainingJob | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobIdCounter = useRef(0);

  /**
   * Collect training data from Vilgefortz memories
   */
  const collectTrainingData = useCallback(async (limit: number = 100): Promise<TrainingEntry[]> => {
    setIsCollecting(true);
    setError(null);

    try {
      // Fetch Vilgefortz memories
      const memories = await invoke<MemoryEntry[]>('get_agent_memories', {
        agent: 'Vilgefortz',
        limit,
      });

      // Parse and filter valid training entries
      const entries = memories
        .map(parseVilgefortzMemory)
        .filter((e): e is TrainingEntry => e !== null);

      setTrainingData(entries);

      // Log collection to Alzur's memory
      await invoke('add_agent_memory', {
        agent: 'Alzur',
        entryType: 'fact',
        content: `Collected ${entries.length} training samples from Vilgefortz (${memories.length} total memories scanned)`,
        tags: 'collection,training-data',
      });

      return entries;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to collect training data';
      setError(message);
      return [];
    } finally {
      setIsCollecting(false);
    }
  }, []);

  /**
   * Add manual training entry
   */
  const addTrainingEntry = useCallback((prompt: string, response: string, context?: string[]) => {
    const entry: TrainingEntry = {
      id: crypto.randomUUID(),
      prompt,
      response,
      context,
      timestamp: Date.now(),
      source: 'manual',
    };

    setTrainingData((prev) => [...prev, entry]);
    return entry;
  }, []);

  /**
   * Remove training entry
   */
  const removeTrainingEntry = useCallback((id: string) => {
    setTrainingData((prev) => prev.filter((e) => e.id !== id));
  }, []);

  /**
   * Export training data as JSONL file
   */
  const exportDataset = useCallback(
    async (filename?: string): Promise<string> => {
      const jsonl = formatAsJSONL(trainingData);
      const finalFilename = filename || `alzur_training_${Date.now()}.jsonl`;

      try {
        // Save via Tauri backend
        await invoke('write_training_dataset', {
          filename: finalFilename,
          content: jsonl,
        });

        // Log export
        await invoke('add_agent_memory', {
          agent: 'Alzur',
          entryType: 'decision',
          content: `Exported ${trainingData.length} samples to ${finalFilename}`,
          tags: 'export,dataset',
        });

        return finalFilename;
      } catch {
        // Fallback: return JSONL content for manual save
        return jsonl;
      }
    },
    [trainingData],
  );

  /**
   * Start fine-tuning job
   */
  const startTraining = useCallback(
    async (config: Partial<TrainingConfig>): Promise<TrainingJob> => {
      const fullConfig: TrainingConfig = {
        baseModel: config.baseModel || 'llama3.2:3b',
        outputModel: config.outputModel || `alzur-ft-${Date.now()}`,
        ...DEFAULT_CONFIG,
        ...config,
      } as TrainingConfig;

      const jobId = `job_${++jobIdCounter.current}_${Date.now()}`;

      const job: TrainingJob = {
        id: jobId,
        status: 'preparing',
        config: fullConfig,
        startedAt: Date.now(),
      };

      setCurrentJob(job);
      setError(null);

      try {
        // Step 1: Export dataset
        const datasetPath = await exportDataset(`training_${jobId}.jsonl`);
        job.datasetPath = datasetPath;

        // Step 2: Prepare training (create Modelfile)
        const { totalSteps, estimatedMinutes } = estimateTrainingTime(
          trainingData.length,
          fullConfig,
        );

        job.metrics = {
          epoch: 0,
          totalEpochs: fullConfig.epochs,
          loss: 0,
          samplesProcessed: 0,
          totalSamples: trainingData.length,
          elapsedTime: 0,
          estimatedTimeRemaining: estimatedMinutes * 60 * 1000,
        };

        // Log training start
        await invoke('add_agent_memory', {
          agent: 'Alzur',
          entryType: 'decision',
          content: `Starting training job ${jobId}:\n- Base model: ${fullConfig.baseModel}\n- Output: ${fullConfig.outputModel}\n- Samples: ${trainingData.length}\n- Epochs: ${fullConfig.epochs}\n- Est. steps: ${totalSteps}`,
          tags: 'training,start',
        });

        // Step 3: Start actual training via Ollama
        job.status = 'training';
        setCurrentJob({ ...job });

        // Call backend training command
        const result = await invoke<{ success: boolean; modelPath?: string; error?: string }>(
          'start_model_training',
          {
            config: {
              base_model: fullConfig.baseModel,
              output_model: fullConfig.outputModel,
              dataset_path: datasetPath,
              epochs: fullConfig.epochs,
              learning_rate: fullConfig.learningRate,
              batch_size: fullConfig.batchSize,
            },
          },
        );

        if (result.success) {
          job.status = 'completed';
          job.completedAt = Date.now();
          job.modelPath = result.modelPath;

          // Log success
          await invoke('add_agent_memory', {
            agent: 'Alzur',
            entryType: 'fact',
            content: `Training completed! Model saved: ${result.modelPath}`,
            tags: 'training,completed,success',
          });
        } else {
          throw new Error(result.error || 'Training failed');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Training failed';
        job.status = 'failed';
        job.error = message;
        setError(message);

        // Log failure
        await invoke('add_agent_memory', {
          agent: 'Alzur',
          entryType: 'error',
          content: `Training job ${jobId} failed: ${message}`,
          tags: 'training,failed,error',
        });
      }

      setCurrentJob({ ...job });
      return job;
    },
    [trainingData, exportDataset],
  );

  /**
   * Cancel current training job
   */
  const cancelTraining = useCallback(async () => {
    if (!currentJob || currentJob.status !== 'training') return;

    try {
      await invoke('cancel_model_training', { jobId: currentJob.id });

      setCurrentJob((prev) =>
        prev
          ? {
              ...prev,
              status: 'cancelled',
              completedAt: Date.now(),
            }
          : null,
      );

      await invoke('add_agent_memory', {
        agent: 'Alzur',
        entryType: 'decision',
        content: `Training job ${currentJob.id} cancelled by user`,
        tags: 'training,cancelled',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel training');
    }
  }, [currentJob]);

  /**
   * Get training statistics
   */
  const getStats = useCallback(() => {
    const bySource = trainingData.reduce(
      (acc, e) => {
        acc[e.source] = (acc[e.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const avgQuality =
      trainingData
        .filter((e) => e.quality_score !== undefined)
        .reduce((sum, e) => sum + (e.quality_score || 0), 0) /
      (trainingData.filter((e) => e.quality_score !== undefined).length || 1);

    return {
      totalSamples: trainingData.length,
      bySource,
      avgQuality: Math.round(avgQuality * 100) / 100,
      oldestSample:
        trainingData.length > 0
          ? new Date(Math.min(...trainingData.map((e) => e.timestamp)))
          : null,
      newestSample:
        trainingData.length > 0
          ? new Date(Math.max(...trainingData.map((e) => e.timestamp)))
          : null,
    };
  }, [trainingData]);

  /**
   * Auto-train when enough data collected (threshold-based)
   */
  const checkAutoTrainThreshold = useCallback(
    async (threshold: number = 50): Promise<boolean> => {
      if (trainingData.length >= threshold && !currentJob) {
        await invoke('add_agent_memory', {
          agent: 'Alzur',
          entryType: 'context',
          content: `Auto-train threshold reached: ${trainingData.length}/${threshold} samples. Ready for training.`,
          tags: 'auto-train,threshold',
        });
        return true;
      }
      return false;
    },
    [trainingData.length, currentJob],
  );

  return {
    // State
    trainingData,
    currentJob,
    isCollecting,
    error,

    // Data management
    collectTrainingData,
    addTrainingEntry,
    removeTrainingEntry,
    exportDataset,

    // Training
    startTraining,
    cancelTraining,

    // Utils
    getStats,
    checkAutoTrainThreshold,
    clearError: () => setError(null),
    clearData: () => setTrainingData([]),
  };
}

export default useTrainingAgent;
