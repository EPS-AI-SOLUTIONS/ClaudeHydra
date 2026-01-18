/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // B&W Monochrome palette
        bw: {
          bg: '#0a0a0a',
          surface: '#141414',
          card: '#1a1a1a',
          border: '#2a2a2a',
          'border-light': '#3a3a3a',
          text: '#e5e5e5',
          'text-dim': '#888888',
          'text-muted': '#555555',
          accent: '#ffffff',
          'accent-dim': '#cccccc',
        },
        // Legacy mappings for compatibility
        witcher: {
          bg: {
            primary: '#0a0a0a',
            secondary: '#141414',
          },
          gold: '#e5e5e5',
          'gold-light': '#ffffff',
          amber: '#cccccc',
          bronze: '#888888',
          glass: 'rgba(20, 20, 20, 0.9)',
        },
        matrix: {
          bg: {
            primary: '#0a0a0a',
            secondary: '#141414',
          },
          accent: '#ffffff',
          glass: 'rgba(20, 20, 20, 0.9)',
        },
        hydra: {
          gold: '#ffffff',
          amber: '#cccccc',
          bronze: '#888888',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-soft': 'pulse-soft 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '0.7' },
          '50%': { opacity: '1' },
        },
      },
      transitionDuration: {
        '2000': '2000ms',
      }
    },
  },
  plugins: [require('tailwindcss-animate')],
}
