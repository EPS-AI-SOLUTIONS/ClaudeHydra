import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import {
  Search,
  Compass,
  ListChecks,
  Play,
  GitMerge,
  FileText,
  CheckCircle2,
  Loader2,
  Circle
} from 'lucide-react';

// ============================================================================
// SWARM PROTOCOL STEPS
// ============================================================================

export type SwarmStep = 'ROUTE' | 'SPECULATE' | 'PLAN' | 'EXECUTE' | 'SYNTHESIZE' | 'REPORT';

export type StepStatus = 'pending' | 'active' | 'completed' | 'error';

export interface SwarmStepInfo {
  id: SwarmStep;
  label: string;
  labelPL: string;
  icon: React.ElementType;
  description: string;
}

const SWARM_STEPS: SwarmStepInfo[] = [
  { id: 'ROUTE', label: 'Route', labelPL: 'Analiza', icon: Compass, description: 'Wybór agentów' },
  { id: 'SPECULATE', label: 'Speculate', labelPL: 'Kontekst', icon: Search, description: 'Zbieranie danych' },
  { id: 'PLAN', label: 'Plan', labelPL: 'Plan', icon: ListChecks, description: 'Podział zadań' },
  { id: 'EXECUTE', label: 'Execute', labelPL: 'Wykonanie', icon: Play, description: 'Uruchomienie' },
  { id: 'SYNTHESIZE', label: 'Synthesize', labelPL: 'Scalanie', icon: GitMerge, description: 'Łączenie wyników' },
  { id: 'REPORT', label: 'Report', labelPL: 'Raport', icon: FileText, description: 'Formatowanie' },
];

// ============================================================================
// SWARM PROGRESS COMPONENT
// ============================================================================

interface SwarmProgressProps {
  currentStep: SwarmStep | null;
  stepStatuses: Record<SwarmStep, StepStatus>;
  isActive: boolean;
  onStepChange?: (step: SwarmStep, status: StepStatus) => void;
  compact?: boolean;
}

const SwarmProgress: React.FC<SwarmProgressProps> = ({
  currentStep,
  stepStatuses,
  isActive,
  compact = false,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  const getStepIndex = (step: SwarmStep): number => {
    return SWARM_STEPS.findIndex(s => s.id === step);
  };

  const currentIndex = currentStep ? getStepIndex(currentStep) : -1;

  const getStatusIcon = (status: StepStatus, Icon: React.ElementType) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={compact ? 14 : 18} className="text-emerald-500" />;
      case 'active':
        return <Loader2 size={compact ? 14 : 18} className="animate-spin text-amber-400" />;
      case 'error':
        return <Circle size={compact ? 14 : 18} className="text-red-500" />;
      default:
        return <Icon size={compact ? 14 : 18} className={isLight ? 'text-slate-400' : 'text-slate-600'} />;
    }
  };

  const getStepClasses = (status: StepStatus) => {
    const base = 'transition-all duration-300';

    if (status === 'completed') {
      return `${base} ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`;
    }
    if (status === 'active') {
      return `${base} ${isLight ? 'text-amber-600' : 'text-amber-400'}`;
    }
    if (status === 'error') {
      return `${base} ${isLight ? 'text-red-600' : 'text-red-400'}`;
    }
    return `${base} ${isLight ? 'text-slate-400' : 'text-slate-600'}`;
  };

  // Calculate overall progress percentage
  const completedCount = Object.values(stepStatuses).filter(s => s === 'completed').length;
  const progressPercent = (completedCount / SWARM_STEPS.length) * 100;

  if (!isActive && completedCount === 0) {
    return null;
  }

  // Compact mode - horizontal bar only
  if (compact) {
    return (
      <div className={`p-2 rounded-lg border ${
        isLight
          ? 'bg-amber-50/80 border-amber-300/50'
          : 'bg-amber-900/20 border-amber-500/30'
      }`}>
        <div className="flex items-center gap-1">
          <span className={`text-[9px] font-cinzel font-semibold mr-2 ${
            isLight ? 'text-amber-700' : 'text-amber-400'
          }`}>
            SWARM
          </span>
          {SWARM_STEPS.map((step) => {
            const status = stepStatuses[step.id];
            return (
              <div
                key={step.id}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] ${
                  status === 'completed'
                    ? isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-900/40 text-emerald-400'
                    : status === 'active'
                      ? isLight ? 'bg-amber-200 text-amber-700' : 'bg-amber-800/40 text-amber-300'
                      : isLight ? 'bg-slate-100 text-slate-400' : 'bg-slate-800/40 text-slate-500'
                }`}
              >
                {getStatusIcon(status, step.icon)}
              </div>
            );
          })}
          <span className={`text-[9px] font-bold ml-2 ${
            isLight ? 'text-amber-700' : 'text-amber-400'
          }`}>
            {Math.round(progressPercent)}%
          </span>
        </div>
      </div>
    );
  }

  // Full mode - detailed view
  return (
    <div className={`p-4 rounded-lg border-2 backdrop-blur-sm ${
      isLight
        ? 'bg-amber-50/80 border-amber-400/50'
        : 'bg-black/60 border-amber-500/40'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-cinzel font-semibold tracking-wider ${
            isLight ? 'text-amber-700' : 'text-amber-400'
          }`}>
            🐺 SWARM PROTOCOL
          </span>
        </div>
        <span className={`text-sm font-cinzel font-bold ${
          isLight ? 'text-amber-700' : 'text-amber-400'
        }`}>
          {Math.round(progressPercent)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className={`relative h-2 rounded-full overflow-hidden mb-4 ${
        isLight ? 'bg-amber-200/50' : 'bg-amber-900/30'
      }`}>
        <div
          className="absolute h-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-500 transition-all duration-500"
          style={{
            width: `${progressPercent}%`,
            boxShadow: '0 0 10px rgba(251, 191, 36, 0.5)'
          }}
        />
      </div>

      {/* Steps */}
      <div className="flex items-center justify-between">
        {SWARM_STEPS.map((step, index) => {
          const status = stepStatuses[step.id];
          const isLast = index === SWARM_STEPS.length - 1;

          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                {/* Icon circle */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  status === 'completed'
                    ? 'bg-emerald-500/20 border-emerald-500'
                    : status === 'active'
                      ? 'bg-amber-500/20 border-amber-400 animate-pulse'
                      : status === 'error'
                        ? 'bg-red-500/20 border-red-500'
                        : isLight
                          ? 'bg-slate-100 border-slate-300'
                          : 'bg-slate-800/50 border-slate-600'
                }`}
                style={{
                  boxShadow: status === 'active'
                    ? '0 0 15px rgba(251, 191, 36, 0.4)'
                    : status === 'completed'
                      ? '0 0 10px rgba(16, 185, 129, 0.3)'
                      : 'none'
                }}
                >
                  {getStatusIcon(status, step.icon)}
                </div>

                {/* Label */}
                <span className={`mt-1 text-[9px] font-cinzel font-semibold ${getStepClasses(status)}`}>
                  {step.labelPL}
                </span>

                {/* Description - only for active step */}
                {status === 'active' && (
                  <span className={`text-[8px] ${isLight ? 'text-amber-600/70' : 'text-amber-500/60'}`}>
                    {step.description}
                  </span>
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className={`flex-1 h-0.5 mx-1 transition-all duration-500 ${
                  index < currentIndex || stepStatuses[SWARM_STEPS[index + 1].id] === 'completed'
                    ? 'bg-emerald-500'
                    : index === currentIndex
                      ? 'bg-gradient-to-r from-amber-400 to-slate-400'
                      : isLight ? 'bg-slate-300' : 'bg-slate-700'
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Current step indicator */}
      {currentStep && (
        <div className={`mt-3 pt-3 border-t ${
          isLight ? 'border-amber-300/30' : 'border-amber-500/20'
        }`}>
          <div className="flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-amber-400" />
            <span className={`text-[10px] font-cinzel ${
              isLight ? 'text-amber-700' : 'text-amber-400'
            }`}>
              {SWARM_STEPS.find(s => s.id === currentStep)?.description}...
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SwarmProgress;
export { SWARM_STEPS };
