/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'matrix-bg-primary': 'var(--matrix-bg-primary)',
        'matrix-bg-secondary': 'var(--matrix-bg-secondary)',
        'matrix-bg-tertiary': 'var(--matrix-bg-tertiary)',
        'matrix-accent': 'var(--matrix-accent)',
        'matrix-accent-hover': 'var(--matrix-accent-hover)',
        'matrix-accent-dim': 'var(--matrix-accent-dim)',
        'matrix-accent-glow': 'var(--matrix-accent-glow)',
        'matrix-text': 'var(--matrix-text-primary)',
        'matrix-text-dim': 'var(--matrix-text-secondary)',
        'matrix-border': 'var(--matrix-border)',
        'matrix-error': 'var(--matrix-error)',
        'matrix-warning': 'var(--matrix-warning)',
        'matrix-success': 'var(--matrix-success)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse-slow 2s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        glow: 'glow 2s ease-in-out infinite alternate',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        shimmer: 'shimmer 1.5s infinite',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        'pulse-glow': {
          '0%, 100%': {
            boxShadow: '0 0 5px rgba(0, 255, 65, 0.3), 0 0 10px rgba(0, 255, 65, 0.2)',
          },
          '50%': {
            boxShadow:
              '0 0 10px rgba(0, 255, 65, 0.5), 0 0 20px rgba(0, 255, 65, 0.3), 0 0 30px rgba(0, 255, 65, 0.2)',
          },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 255, 65, 0.15)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 255, 65, 0.25)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      boxShadow: {
        'matrix-glow': '0 0 20px rgba(0, 255, 65, 0.15)',
        'matrix-glow-sm': '0 0 10px rgba(0, 255, 65, 0.1)',
        glass: '0 8px 32px rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
};
