import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface BuildFreshnessData {
  is_fresh: boolean;
  dist_modified: number | null;
  src_modified: number | null;
  stale_files: string[];
  message: string;
}

const BuildFreshness: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [freshness, setFreshness] = useState<BuildFreshnessData | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const checkFreshness = async () => {
    setIsChecking(true);
    try {
      const result = await invoke<BuildFreshnessData>('check_build_freshness');
      setFreshness(result);
    } catch (error) {
      console.error('Failed to check build freshness:', error);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    // Check on mount
    checkFreshness();

    // Check every 30 seconds
    const interval = setInterval(checkFreshness, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!freshness) {
    return null;
  }

  // Only show if stale
  if (freshness.is_fresh) {
    return (
      <div className={`flex items-center gap-1.5 text-[9px] font-mono ${
        isLight ? 'text-green-600' : 'text-green-400'
      }`}>
        <CheckCircle size={10} />
        <span>BUILD OK</span>
      </div>
    );
  }

  return (
    <div className="glass-card p-2">
      <div
        className={`flex items-center justify-between cursor-pointer ${
          isLight ? 'text-amber-600' : 'text-amber-400'
        }`}
        onClick={() => setShowDetails(!showDetails)}
      >
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={12} />
          <span className="text-[10px] font-mono font-medium">
            BUILD STALE
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            checkFreshness();
          }}
          className={`p-1 rounded hover:bg-opacity-20 ${
            isLight ? 'hover:bg-black' : 'hover:bg-white'
          }`}
          disabled={isChecking}
        >
          <RefreshCw size={10} className={isChecking ? 'animate-spin' : ''} />
        </button>
      </div>

      {showDetails && (
        <div className={`mt-2 pt-2 border-t ${
          isLight ? 'border-gray-200' : 'border-gray-700'
        }`}>
          <p className={`text-[9px] font-mono mb-1 ${
            isLight ? 'text-gray-600' : 'text-gray-400'
          }`}>
            {freshness.message}
          </p>
          <div className="max-h-20 overflow-auto">
            {freshness.stale_files.slice(0, 5).map((file, i) => (
              <div
                key={i}
                className={`text-[8px] font-mono truncate ${
                  isLight ? 'text-gray-500' : 'text-gray-500'
                }`}
              >
                • {file.split('\\').pop()}
              </div>
            ))}
            {freshness.stale_files.length > 5 && (
              <div className={`text-[8px] font-mono ${
                isLight ? 'text-gray-400' : 'text-gray-600'
              }`}>
                +{freshness.stale_files.length - 5} more...
              </div>
            )}
          </div>
          <div className={`mt-2 text-[8px] font-mono ${
            isLight ? 'text-amber-700' : 'text-amber-300'
          }`}>
            Run: pnpm build
          </div>
        </div>
      )}
    </div>
  );
};

export default BuildFreshness;
