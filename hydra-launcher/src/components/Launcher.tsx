import { Cpu, Database, type LucideIcon, Shield, Terminal, Wifi, Zap } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

// Logo images from public folder
const logoDark = "/logodark.webp";
const logoLight = "/logolight.webp";

const Launcher: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('INITIALIZING...');
  const startTimeRef = useRef<number>(0);

  // Loading simulation
  useEffect(() => {
    startTimeRef.current = Date.now();

    const updateProgress = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / 2200) * 100, 100);
      setProgress(newProgress);
    };

    const intervalId = setInterval(updateProgress, 50);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Update status text based on progress
  useEffect(() => {
    const statuses = [
      { text: 'INITIALIZING...', threshold: 0 },
      { text: 'LOADING SERENA...', threshold: 15 },
      { text: 'STARTING DESKTOP COMMANDER...', threshold: 30 },
      { text: 'ACTIVATING PLAYWRIGHT...', threshold: 45 },
      { text: 'CHECKING OLLAMA...', threshold: 60 },
      { text: 'LOADING AGENT SWARM...', threshold: 75 },
      { text: 'CONFIGURING AI HANDLER...', threshold: 88 },
      { text: 'READY', threshold: 98 },
    ];

    for (let i = statuses.length - 1; i >= 0; i--) {
      if (progress >= statuses[i].threshold) {
        setStatusText(statuses[i].text);
        break;
      }
    }
  }, [progress]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full relative overflow-hidden">
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-md px-6">

        {/* Logo */}
        <div className="mb-8 text-center">
          <img
            src={isLight ? logoLight : logoDark}
            alt="HYDRA Logo"
            className="w-32 h-32 mx-auto mb-4 object-contain drop-shadow-lg"
            onError={(e) => {
              // Fallback to text if image fails
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <h1 className={`text-3xl font-mono font-bold tracking-[0.2em] mb-2 ${
            isLight ? 'text-black' : 'text-white'
          }`}>
            HYDRA
          </h1>
          <p className={`text-xs font-mono tracking-[0.3em] ${
            isLight ? 'text-gray-500' : 'text-gray-500'
          }`}>
            v10.6.1
          </p>
        </div>

        {/* Progress Section */}
        <div className="w-full glass-card p-6">
          {/* Status Text */}
          <div className="flex justify-between items-center mb-4">
            <span className={`text-xs font-mono tracking-wider ${
              isLight ? 'text-gray-700' : 'text-gray-300'
            }`}>
              {statusText}
            </span>
            <span className={`text-sm font-bold font-mono ${
              isLight ? 'text-black' : 'text-white'
            }`}>
              {Math.floor(progress)}%
            </span>
          </div>

          {/* Progress Bar - Minimal */}
          <div className={`relative h-1 rounded-full overflow-hidden ${
            isLight ? 'bg-gray-200' : 'bg-gray-800'
          }`}>
            {/* Progress fill */}
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${progress}%`,
                background: isLight ? '#000' : '#fff',
              }}
            />
          </div>

          {/* Divider */}
          <div className={`h-px my-5 ${isLight ? 'bg-gray-200' : 'bg-gray-800'}`} />

          {/* System Check Icons */}
          <div className="flex justify-between px-2">
            <StatusIcon icon={Shield} active={progress > 15} label="SRN" isLight={isLight} />
            <StatusIcon icon={Terminal} active={progress > 30} label="DC" isLight={isLight} />
            <StatusIcon icon={Wifi} active={progress > 45} label="PW" isLight={isLight} />
            <StatusIcon icon={Database} active={progress > 60} label="OLL" isLight={isLight} />
            <StatusIcon icon={Cpu} active={progress > 75} label="SWM" isLight={isLight} />
            <StatusIcon icon={Zap} active={progress > 95} label="RDY" isLight={isLight} />
          </div>
        </div>

        {/* Version Footer */}
        <div className={`mt-8 text-[10px] font-mono tracking-wider ${
          isLight ? 'text-gray-400' : 'text-gray-600'
        }`}>
          CLAUDE HYDRA
        </div>
      </div>
    </div>
  );
};

const StatusIcon: React.FC<{
  icon: LucideIcon;
  active: boolean;
  label: string;
  isLight?: boolean;
}> = ({ icon: Icon, active, label, isLight = false }) => (
  <div
    className={`flex flex-col items-center gap-2 transition-all duration-300 ${
      active
        ? 'opacity-100'
        : 'opacity-30'
    }`}
  >
    {/* Icon */}
    <div
      className={`p-2 rounded transition-all duration-300 ${
        active
          ? isLight
            ? 'text-black bg-gray-100'
            : 'text-white bg-gray-800'
          : isLight
            ? 'text-gray-400'
            : 'text-gray-600'
      }`}
    >
      <Icon size={14} strokeWidth={active ? 2 : 1.5} />
    </div>

    {/* Label */}
    <span
      className={`text-[8px] font-mono font-medium tracking-wider transition-all duration-300 ${
        active
          ? isLight ? 'text-black' : 'text-white'
          : isLight ? 'text-gray-400' : 'text-gray-600'
      }`}
    >
      {label}
    </span>
  </div>
);

export default Launcher;
