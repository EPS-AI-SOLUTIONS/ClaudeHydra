import { useEffect, useState, useCallback } from "react";
import { safeInvoke, isTauri } from "./useTauri";

// Mock data for browser development
const MOCK_MODELS = ["llama3.2:3b", "qwen2.5-coder:1.5b", "phi3:mini"];

// Ollama state types matching Rust enums
export type OllamaState = "Running" | "Stopped" | "Starting" | "Stopping" | "Error";

export interface OllamaStatusInfo {
  is_running: boolean;
  status: OllamaState;
  pid: number | null;
  models_count: number;
  message: string;
}

export function useOllama(refreshInterval = 10000) {
  const [isRunning, setIsRunning] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<OllamaState>("Stopped");
  const [pid, setPid] = useState<number | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  const checkOllama = useCallback(async () => {
    try {
      if (!isTauri()) {
        // Browser mode - use mock data
        setIsRunning(true);
        setModels(MOCK_MODELS);
        setStatus("Running");
        setPid(12345);
        setError(null);
        setIsLoading(false);
        return;
      }

      const running = await safeInvoke<boolean>("check_ollama");
      setIsRunning(running);
      setStatus(running ? "Running" : "Stopped");

      if (running) {
        const modelList = await safeInvoke<string[]>("get_ollama_models");
        setModels(modelList);
      } else {
        setModels([]);
        setPid(null);
      }

      setError(null);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      // Don't show error for browser mode
      if (!errorMsg.includes('browser mode')) {
        setError(errorMsg);
        setIsRunning(false);
        setModels([]);
        setStatus("Error");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Start Ollama service
  const startOllama = useCallback(async (): Promise<{ success: boolean; pid?: number; error?: string }> => {
    if (!isTauri()) {
      // Browser mode - simulate
      setStatus("Starting");
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsRunning(true);
      setStatus("Running");
      setPid(12345);
      setModels(MOCK_MODELS);
      return { success: true, pid: 12345 };
    }

    try {
      setIsActionPending(true);
      setStatus("Starting");
      setError(null);

      const newPid = await safeInvoke<number>("start_ollama_cmd");

      setIsRunning(true);
      setStatus("Running");
      setPid(newPid);

      // Refresh models after start
      const modelList = await safeInvoke<string[]>("get_ollama_models");
      setModels(modelList);

      return { success: true, pid: newPid };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      setStatus("Error");
      return { success: false, error: errorMsg };
    } finally {
      setIsActionPending(false);
    }
  }, []);

  // Stop Ollama service
  const stopOllama = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isTauri()) {
      // Browser mode - simulate
      setStatus("Stopping");
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsRunning(false);
      setStatus("Stopped");
      setPid(null);
      setModels([]);
      return { success: true };
    }

    try {
      setIsActionPending(true);
      setStatus("Stopping");
      setError(null);

      await safeInvoke<void>("stop_ollama_cmd");

      setIsRunning(false);
      setStatus("Stopped");
      setPid(null);
      setModels([]);

      return { success: true };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      setStatus("Error");
      return { success: false, error: errorMsg };
    } finally {
      setIsActionPending(false);
    }
  }, []);

  // Restart Ollama service
  const restartOllama = useCallback(async (): Promise<{ success: boolean; pid?: number; error?: string }> => {
    if (!isTauri()) {
      // Browser mode - simulate
      setStatus("Stopping");
      await new Promise(resolve => setTimeout(resolve, 500));
      setStatus("Starting");
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsRunning(true);
      setStatus("Running");
      setPid(12346);
      setModels(MOCK_MODELS);
      return { success: true, pid: 12346 };
    }

    try {
      setIsActionPending(true);
      setStatus("Stopping");
      setError(null);

      // Small delay for UI feedback
      await new Promise(resolve => setTimeout(resolve, 200));
      setStatus("Starting");

      const newPid = await safeInvoke<number>("restart_ollama_cmd");

      setIsRunning(true);
      setStatus("Running");
      setPid(newPid);

      // Refresh models after restart
      const modelList = await safeInvoke<string[]>("get_ollama_models");
      setModels(modelList);

      return { success: true, pid: newPid };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      setStatus("Error");
      return { success: false, error: errorMsg };
    } finally {
      setIsActionPending(false);
    }
  }, []);

  useEffect(() => {
    checkOllama();

    const interval = setInterval(checkOllama, refreshInterval);
    return () => clearInterval(interval);
  }, [checkOllama, refreshInterval]);

  return {
    // Status
    isRunning,
    models,
    isLoading,
    error,
    status,
    pid,
    isActionPending,
    // Actions
    refresh: checkOllama,
    startOllama,
    stopOllama,
    restartOllama,
  };
}
