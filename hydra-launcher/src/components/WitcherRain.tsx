import React, { useEffect, useRef, memo, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface WitcherRainProps {
  fontSize?: number;
  targetFps?: number;
}

const WitcherRain: React.FC<WitcherRainProps> = memo(({ fontSize = 20, targetFps = 30 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const columnsRef = useRef<{ y: number; speed: number; char: string }[]>([]);
  const { resolvedTheme } = useTheme();

  const isLight = resolvedTheme === 'light';

  // Colors based on theme (moved outside useEffect for JSX access)
  const bgColor = isLight ? '#fafafa' : '#0a0a0a';

  // Pre-compute runes array for faster random access
  const runesArray = useRef(
    'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᚠᚢᚦᚬᚱᚴᚼᚾᛁᛅᛋᛏᛒᛘᛚᛦᚪᚫᚣᛠᛡᛢ◈◇✧⬡★✦'.split('')
  );

  const getRandomRune = useCallback(() => {
    return runesArray.current[Math.floor(Math.random() * runesArray.current.length)];
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Performance: reduce pixel ratio on lower-end devices
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const frameInterval = 1000 / targetFps;

    const initColumns = () => {
      const columnsCount = Math.floor(canvas.width / (fontSize * dpr));
      columnsRef.current = [];
      for (let i = 0; i < columnsCount; i++) {
        columnsRef.current.push({
          y: Math.random() * canvas.height,
          speed: 0.2 + Math.random() * 0.5,
          char: getRandomRune(),
        });
      }
    };

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
      initColumns();
    };

    handleResize();

    // Debounced resize handler
    let resizeTimer: number;
    const debouncedResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(handleResize, 150);
    };
    window.addEventListener('resize', debouncedResize);

    // Pre-set font once
    ctx.font = `${fontSize}px serif`;
    ctx.textAlign = 'center';

    // Colors based on theme
    const fadeColor = isLight ? 'rgba(250, 250, 250, 0.06)' : 'rgba(10, 10, 10, 0.06)';
    const runeColor = isLight ? 'rgba(160, 140, 80,' : 'rgba(220, 210, 180,';

    const draw = (timestamp: number) => {
      // Frame rate limiting
      const elapsed = timestamp - lastFrameRef.current;
      if (elapsed < frameInterval) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrameRef.current = timestamp - (elapsed % frameInterval);

      // Fade effect
      ctx.fillStyle = fadeColor;
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const columns = columnsRef.current;
      const len = columns.length;

      for (let i = 0; i < len; i++) {
        const col = columns[i];
        const x = i * fontSize + fontSize / 2;

        // Vary alpha slightly for subtle effect
        const alpha = 0.15 + (i % 5) * 0.03;
        ctx.fillStyle = `${runeColor}${alpha})`;
        ctx.fillText(col.char, x, col.y);

        // Move column
        col.y += fontSize * col.speed;

        // Reset column with new random char
        if (col.y > canvas.height / dpr) {
          if (Math.random() > 0.95) {
            col.y = -fontSize;
            col.speed = 0.2 + Math.random() * 0.5;
            col.char = getRandomRune();
          }
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    // Initial fill
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationRef.current);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', debouncedResize);
    };
  }, [fontSize, targetFps, isLight, bgColor, getRandomRune]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        backgroundColor: bgColor,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
});

export default WitcherRain;
