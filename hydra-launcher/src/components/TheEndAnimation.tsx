import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Trophy, Swords, Shield, Crown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useSoundEffects } from '../hooks/useSoundEffects';

interface TheEndAnimationProps {
  isVisible: boolean;
  onDismiss?: () => void;
  taskSummary?: string;
}

// Witcher runes for decoration
const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ'];

// Particle system for WOW effect
interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rune: string;
  opacity: number;
  rotation: number;
}

const TheEndAnimation: React.FC<TheEndAnimationProps> = ({
  isVisible,
  onDismiss,
  taskSummary = 'Zadanie ukończone pomyślnie',
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [phase, setPhase] = useState<'hidden' | 'entering' | 'visible' | 'exiting'>('hidden');
  const [particles, setParticles] = useState<Particle[]>([]);
  const [showStats, setShowStats] = useState(false);
  const { playComplete, playSuccess, playClick } = useSoundEffects();

  // Generate particles
  const generateParticles = useCallback(() => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < 50; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2 - 1,
        size: Math.random() * 20 + 10,
        rune: RUNES[Math.floor(Math.random() * RUNES.length)],
        opacity: Math.random() * 0.8 + 0.2,
        rotation: Math.random() * 360,
      });
    }
    setParticles(newParticles);
  }, []);

  // Animation phases
  useEffect(() => {
    if (isVisible) {
      setPhase('entering');
      generateParticles();
      playComplete(); // Play triumphant completion sound

      setTimeout(() => {
        setPhase('visible');
        setShowStats(true);
        playSuccess(); // Play success chime
      }, 500);
    } else if (phase !== 'hidden') {
      setPhase('exiting');
      setTimeout(() => {
        setPhase('hidden');
        setShowStats(false);
        setParticles([]);
      }, 500);
    }
  }, [isVisible, generateParticles, playComplete, playSuccess]);

  // Animate particles
  useEffect(() => {
    if (phase !== 'visible') return;

    const interval = setInterval(() => {
      setParticles(prev =>
        prev.map(p => ({
          ...p,
          y: p.y + p.vy * 0.3,
          x: p.x + p.vx * 0.1,
          rotation: p.rotation + 2,
          opacity: Math.max(0, p.opacity - 0.005),
        })).filter(p => p.opacity > 0)
      );
    }, 50);

    return () => clearInterval(interval);
  }, [phase]);

  if (phase === 'hidden') return null;

  const stats = [
    { icon: Swords, label: 'AGENCI', value: '12', color: 'text-amber-500' },
    { icon: Shield, label: 'POPRAWKI', value: '0', color: 'text-emerald-500' },
    { icon: Trophy, label: 'SUKCES', value: '100%', color: 'text-amber-400' },
  ];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${
        phase === 'entering' ? 'opacity-0 scale-95' :
        phase === 'visible' ? 'opacity-100 scale-100' :
        'opacity-0 scale-105'
      }`}
      onClick={() => { playClick(); onDismiss?.(); }}
    >
      {/* Backdrop */}
      <div className={`absolute inset-0 ${
        isLight
          ? 'bg-gradient-to-br from-amber-100/95 via-white/90 to-amber-100/95'
          : 'bg-gradient-to-br from-black/95 via-amber-950/80 to-black/95'
      }`} />

      {/* Particle effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map(particle => (
          <div
            key={particle.id}
            className={`absolute font-cinzel transition-none ${
              isLight ? 'text-amber-600' : 'text-amber-400'
            }`}
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              fontSize: `${particle.size}px`,
              opacity: particle.opacity,
              transform: `rotate(${particle.rotation}deg)`,
              textShadow: isLight
                ? '0 0 10px rgba(245, 158, 11, 0.5)'
                : '0 0 15px rgba(251, 191, 36, 0.8)',
            }}
          >
            {particle.rune}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center px-8 max-w-2xl">
        {/* Crown icon */}
        <div className={`mb-6 transition-all duration-700 delay-200 ${
          showStats ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8'
        }`}>
          <Crown
            size={64}
            className={`mx-auto ${isLight ? 'text-amber-600' : 'text-amber-400'}`}
            style={{
              filter: isLight
                ? 'drop-shadow(0 0 20px rgba(245, 158, 11, 0.5))'
                : 'drop-shadow(0 0 30px rgba(251, 191, 36, 0.8))',
              animation: 'float 3s ease-in-out infinite',
            }}
          />
        </div>

        {/* THE END title */}
        <h1
          className={`font-cinzel-decorative text-6xl md:text-8xl font-bold mb-4 transition-all duration-700 delay-300 ${
            showStats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          } ${isLight ? 'text-amber-700' : 'text-amber-400'}`}
          style={{
            textShadow: isLight
              ? '0 0 30px rgba(245, 158, 11, 0.4), 0 2px 4px rgba(0,0,0,0.2)'
              : '0 0 50px rgba(251, 191, 36, 0.6), 0 0 100px rgba(251, 191, 36, 0.3)',
            letterSpacing: '0.2em',
          }}
        >
          ZADANIE UKOŃCZONE
        </h1>

        {/* Decorative line */}
        <div className={`flex items-center justify-center gap-4 mb-6 transition-all duration-700 delay-400 ${
          showStats ? 'opacity-100' : 'opacity-0'
        }`}>
          <div className={`h-px w-24 bg-gradient-to-r from-transparent ${
            isLight ? 'via-amber-500' : 'via-amber-400'
          } to-transparent`} />
          <Sparkles className={isLight ? 'text-amber-600' : 'text-amber-400'} size={20} />
          <div className={`h-px w-24 bg-gradient-to-l from-transparent ${
            isLight ? 'via-amber-500' : 'via-amber-400'
          } to-transparent`} />
        </div>

        {/* Task summary */}
        <p className={`font-cinzel text-lg mb-8 transition-all duration-700 delay-500 ${
          showStats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        } ${isLight ? 'text-amber-800' : 'text-amber-200'}`}>
          {taskSummary}
        </p>

        {/* Stats cards */}
        <div className={`flex justify-center gap-6 mb-8 transition-all duration-700 delay-600 ${
          showStats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`p-4 rounded-lg border-2 backdrop-blur-sm transition-all duration-300 hover:scale-105 ${
                isLight
                  ? 'bg-white/60 border-amber-400/50'
                  : 'bg-black/40 border-amber-500/40'
              }`}
              style={{
                animationDelay: `${i * 100}ms`,
                boxShadow: isLight
                  ? '0 4px 20px rgba(245, 158, 11, 0.2)'
                  : '0 4px 30px rgba(251, 191, 36, 0.15)',
              }}
            >
              <stat.icon className={`mx-auto mb-2 ${stat.color}`} size={24} />
              <div className={`text-2xl font-cinzel font-bold ${stat.color}`}>
                {stat.value}
              </div>
              <div className={`text-[10px] font-cinzel tracking-wider ${
                isLight ? 'text-amber-700/60' : 'text-amber-400/60'
              }`}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Rune decoration */}
        <div className={`text-lg tracking-[0.5em] mb-6 transition-all duration-700 delay-700 ${
          showStats ? 'opacity-100' : 'opacity-0'
        } ${isLight ? 'text-amber-600/40' : 'text-amber-500/30'}`}>
          ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ᚷ ᚹ ᚺ ᚾ
        </div>

        {/* Dismiss hint */}
        <p className={`text-xs font-cinzel tracking-wider transition-all duration-700 delay-800 ${
          showStats ? 'opacity-100' : 'opacity-0'
        } ${isLight ? 'text-amber-600/50' : 'text-amber-500/40'}`}>
          ◇ Kliknij aby kontynuować ◇
        </p>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
};

export default TheEndAnimation;
