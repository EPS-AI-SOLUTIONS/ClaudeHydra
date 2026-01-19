import React, { useState, useEffect, useCallback, useMemo, useRef, ElementType } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * AnimatedText - Advanced text animation component
 *
 * Effects:
 * - gradient: Animated color gradient sliding across text
 * - typewriter: Classic typewriter effect with cursor
 * - split: Each letter animates in separately
 * - blur: Text reveals from blur to sharp
 * - wave: Letters animate in a wave pattern
 *
 * @example
 * <AnimatedText text="HYDRA" effect="gradient" colors={['#f59e0b', '#ef4444', '#8b5cf6']} />
 * <AnimatedText text="Loading..." effect="typewriter" speed={100} />
 * <AnimatedText text="Welcome" effect="wave" loop />
 */

export type AnimatedTextEffect = 'gradient' | 'typewriter' | 'split' | 'blur' | 'wave';

export interface AnimatedTextProps {
  /** Text to animate */
  text: string;
  /** Animation effect type */
  effect?: AnimatedTextEffect;
  /** Animation speed in ms (meaning varies by effect) */
  speed?: number;
  /** Gradient colors (for gradient effect) */
  colors?: string[];
  /** Delay between letters in ms */
  letterDelay?: number;
  /** Loop animation continuously */
  loop?: boolean;
  /** Custom className */
  className?: string;
  /** Callback when animation completes */
  onComplete?: () => void;
  /** Custom tag to render (default: span) */
  as?: ElementType;
  /** Cursor character for typewriter effect */
  cursor?: string;
  /** Show cursor for typewriter effect */
  showCursor?: boolean;
  /** Pause duration at end before looping (ms) */
  loopPause?: number;
  /** Wave amplitude in pixels */
  waveAmplitude?: number;
  /** Wave frequency */
  waveFrequency?: number;
}

// Individual letter component for split animations
interface AnimatedLetterProps {
  char: string;
  index: number;
  effect: AnimatedTextEffect;
  delay: number;
  isVisible: boolean;
  waveOffset?: number;
  waveAmplitude?: number;
  colors?: string[];
  isLight: boolean;
}

const AnimatedLetter: React.FC<AnimatedLetterProps> = ({
  char,
  index,
  effect,
  delay,
  isVisible,
  waveOffset = 0,
  waveAmplitude = 10,
  // colors and isLight reserved for future gradient per-letter effect
  colors: _colors,
  isLight: _isLight,
}) => {
  // Suppress unused variable warnings
  void _colors;
  void _isLight;
  const [animationState, setAnimationState] = useState<'hidden' | 'animating' | 'visible'>('hidden');

  useEffect(() => {
    if (!isVisible) {
      setAnimationState('hidden');
      return;
    }

    const timer = setTimeout(() => {
      setAnimationState('animating');

      // For split effect, transition to visible after animation
      if (effect === 'split') {
        const visibleTimer = setTimeout(() => {
          setAnimationState('visible');
        }, 400);
        return () => clearTimeout(visibleTimer);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [isVisible, delay, effect]);

  const getStyles = useCallback((): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      display: 'inline-block',
      transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      whiteSpace: char === ' ' ? 'pre' : 'normal',
    };

    switch (effect) {
      case 'split':
        return {
          ...baseStyles,
          opacity: animationState === 'hidden' ? 0 : 1,
          transform: animationState === 'hidden'
            ? 'translateY(40px) rotateX(-90deg) scale(0.5)'
            : 'translateY(0) rotateX(0) scale(1)',
          filter: animationState === 'hidden' ? 'blur(8px)' : 'blur(0)',
        };

      case 'blur':
        return {
          ...baseStyles,
          opacity: animationState === 'hidden' ? 0 : 1,
          filter: animationState === 'hidden' ? 'blur(20px)' : 'blur(0)',
          transform: animationState === 'hidden' ? 'scale(1.2)' : 'scale(1)',
        };

      case 'wave':
        return {
          ...baseStyles,
          transform: `translateY(${Math.sin(waveOffset + index * 0.5) * waveAmplitude}px)`,
          transition: 'transform 0.1s ease-out',
        };

      default:
        return baseStyles;
    }
  }, [effect, animationState, char, waveOffset, waveAmplitude, index]);

  return (
    <span style={getStyles()}>
      {char === ' ' ? '\u00A0' : char}
    </span>
  );
};

// Gradient text component
const GradientText: React.FC<{
  text: string;
  colors: string[];
  speed: number;
  loop: boolean;
  className?: string;
  isLight: boolean;
}> = ({ text, colors, speed, loop: _loop, className, isLight }) => {
  // _loop reserved for future stop/start functionality
  void _loop;
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffset(prev => (prev + 1) % 200);
    }, speed);

    return () => clearInterval(interval);
  }, [speed]);

  const gradientColors = colors.length > 0
    ? colors
    : isLight
      ? ['#d97706', '#dc2626', '#7c3aed', '#d97706']
      : ['#fbbf24', '#f87171', '#a78bfa', '#fbbf24'];

  return (
    <span
      className={className}
      style={{
        backgroundImage: `linear-gradient(90deg, ${gradientColors.join(', ')})`,
        backgroundSize: '200% 100%',
        backgroundPosition: `${offset}% 0`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        transition: 'background-position 0.05s linear',
      }}
    >
      {text}
    </span>
  );
};

// Typewriter component
const TypewriterText: React.FC<{
  text: string;
  speed: number;
  loop: boolean;
  loopPause: number;
  cursor: string;
  showCursor: boolean;
  className?: string;
  onComplete?: () => void;
  isLight: boolean;
}> = ({ text, speed, loop, loopPause, cursor, showCursor, className, onComplete, isLight }) => {
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [cursorVisible, setCursorVisible] = useState(true);
  const indexRef = useRef(0);
  const directionRef = useRef<'forward' | 'backward'>('forward');

  // Cursor blink
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible(prev => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  // Typing effect
  useEffect(() => {
    const typeChar = () => {
      if (directionRef.current === 'forward') {
        if (indexRef.current < text.length) {
          setDisplayText(text.slice(0, indexRef.current + 1));
          indexRef.current++;
        } else {
          setIsTyping(false);
          onComplete?.();

          if (loop) {
            setTimeout(() => {
              directionRef.current = 'backward';
              setIsTyping(true);
            }, loopPause);
          }
        }
      } else {
        if (indexRef.current > 0) {
          indexRef.current--;
          setDisplayText(text.slice(0, indexRef.current));
        } else {
          directionRef.current = 'forward';
          setTimeout(() => {
            setIsTyping(true);
          }, 500);
        }
      }
    };

    if (!isTyping && !loop) return;

    const timeout = setTimeout(typeChar, directionRef.current === 'backward' ? speed / 2 : speed);
    return () => clearTimeout(timeout);
  }, [displayText, text, speed, loop, loopPause, isTyping, onComplete]);

  // Reset on text change
  useEffect(() => {
    indexRef.current = 0;
    directionRef.current = 'forward';
    setDisplayText('');
    setIsTyping(true);
  }, [text]);

  return (
    <span className={className}>
      {displayText}
      {showCursor && (
        <span
          className={`inline-block ml-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}
          style={{
            opacity: cursorVisible ? 1 : 0,
            transition: 'opacity 0.1s',
          }}
        >
          {cursor}
        </span>
      )}
    </span>
  );
};

// Main AnimatedText component
const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  effect = 'gradient',
  speed = 50,
  colors = [],
  letterDelay = 50,
  loop = false,
  className = '',
  onComplete,
  as: Tag = 'span',
  cursor = '|',
  showCursor = true,
  loopPause = 2000,
  waveAmplitude = 10,
  waveFrequency = 0.1,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [isVisible, setIsVisible] = useState(true);
  const [waveOffset, setWaveOffset] = useState(0);
  const letters = useMemo(() => text.split(''), [text]);

  // Wave animation
  useEffect(() => {
    if (effect !== 'wave') return;

    const interval = setInterval(() => {
      setWaveOffset(prev => prev + waveFrequency);
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [effect, waveFrequency]);

  // Loop handler for split/blur effects
  useEffect(() => {
    if (!loop || (effect !== 'split' && effect !== 'blur')) return;

    const totalAnimationTime = letters.length * letterDelay + 1000;

    const loopAnimation = () => {
      setIsVisible(false);
      setTimeout(() => {
        setIsVisible(true);
        onComplete?.();
      }, loopPause);
    };

    const timeout = setTimeout(loopAnimation, totalAnimationTime);
    return () => clearTimeout(timeout);
  }, [loop, effect, letters.length, letterDelay, loopPause, onComplete, isVisible]);

  // Handle completion for non-looping split/blur
  useEffect(() => {
    if (loop || (effect !== 'split' && effect !== 'blur')) return;

    const totalAnimationTime = letters.length * letterDelay + 500;
    const timeout = setTimeout(() => {
      onComplete?.();
    }, totalAnimationTime);

    return () => clearTimeout(timeout);
  }, [loop, effect, letters.length, letterDelay, onComplete]);

  const renderContent = () => {
    switch (effect) {
      case 'gradient':
        return (
          <GradientText
            text={text}
            colors={colors}
            speed={speed}
            loop={loop}
            className={className}
            isLight={isLight}
          />
        );

      case 'typewriter':
        return (
          <TypewriterText
            text={text}
            speed={speed}
            loop={loop}
            loopPause={loopPause}
            cursor={cursor}
            showCursor={showCursor}
            className={className}
            onComplete={onComplete}
            isLight={isLight}
          />
        );

      case 'split':
      case 'blur':
        return (
          <span className={className} style={{ perspective: '1000px' }}>
            {letters.map((char, index) => (
              <AnimatedLetter
                key={`${char}-${index}`}
                char={char}
                index={index}
                effect={effect}
                delay={index * letterDelay}
                isVisible={isVisible}
                colors={colors}
                isLight={isLight}
              />
            ))}
          </span>
        );

      case 'wave':
        return (
          <span className={className}>
            {letters.map((char, index) => (
              <AnimatedLetter
                key={`${char}-${index}`}
                char={char}
                index={index}
                effect={effect}
                delay={0}
                isVisible={true}
                waveOffset={waveOffset}
                waveAmplitude={waveAmplitude}
                colors={colors}
                isLight={isLight}
              />
            ))}
          </span>
        );

      default:
        return <span className={className}>{text}</span>;
    }
  };

  return <Tag className="inline-block">{renderContent()}</Tag>;
};

export default AnimatedText;

// Named export for convenience
export { AnimatedText };
