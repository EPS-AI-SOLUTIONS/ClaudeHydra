import { useEffect, useRef } from 'react';

interface RuneRainProps {
  opacity?: number;
}

// Elder Futhark runes + witcher-style glyphs
const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛝᛞᛟ᛫᛭ᚳᚴᚵᚸᛠᛡᛢᛣᛤᛥᛦᛧᛨᛩᛪ';
const runeArray = RUNES.split('');

export function RuneRain({ opacity = 0.12 }: RuneRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const fontSize = 16;
    const columns = Math.floor(canvas.width / fontSize);

    // Each column has its own drop position and speed
    const drops: number[] = [];
    const speeds: number[] = [];
    const brightnesses: number[] = [];

    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * -150; // stagger start
      speeds[i] = 0.3 + Math.random() * 0.7; // variable speed
      brightnesses[i] = 0.3 + Math.random() * 0.7; // variable brightness
    }

    const draw = () => {
      // Fade trail - darker = longer trails
      ctx.fillStyle = 'rgba(15, 20, 25, 0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px serif`;

      for (let i = 0; i < drops.length; i++) {
        const rune = runeArray[Math.floor(Math.random() * runeArray.length)];
        const y = drops[i] * fontSize;

        // Head rune is brightest white
        const alpha = brightnesses[i];
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;

        // Slight glow for head character
        if (Math.random() > 0.7) {
          ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
          ctx.shadowBlur = 8;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillText(rune, i * fontSize, y);
        ctx.shadowBlur = 0;

        // Reset when past bottom
        if (y > canvas.height && Math.random() > 0.98) {
          drops[i] = 0;
          speeds[i] = 0.3 + Math.random() * 0.7;
          brightnesses[i] = 0.3 + Math.random() * 0.7;
        }

        drops[i] += speeds[i];
      }

      animationId = requestAnimationFrame(draw);
    };

    // Slower start - 30fps feel
    const startDelay = setTimeout(() => {
      animationId = requestAnimationFrame(draw);
    }, 100);

    return () => {
      clearTimeout(startDelay);
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ opacity }} />
  );
}
