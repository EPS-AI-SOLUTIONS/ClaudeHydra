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
        // Modern color palette
        modern: {
          // Primary colors (cyan → blue gradient endpoints)
          primary: {
            DEFAULT: '#06b6d4',
            start: '#06b6d4',
            end: '#3b82f6',
            50: '#ecfeff',
            100: '#cffafe',
            200: '#a5f3fc',
            300: '#67e8f9',
            400: '#22d3ee',
            500: '#06b6d4',
            600: '#0891b2',
            700: '#0e7490',
            800: '#155e75',
            900: '#164e63',
          },
          // Secondary colors (purple → pink gradient endpoints)
          secondary: {
            DEFAULT: '#8b5cf6',
            start: '#8b5cf6',
            end: '#ec4899',
            50: '#faf5ff',
            100: '#f3e8ff',
            200: '#e9d5ff',
            300: '#d8b4fe',
            400: '#c084fc',
            500: '#a855f7',
            600: '#9333ea',
            700: '#7c3aed',
            800: '#6b21a8',
            900: '#581c87',
          },
          // Accent - neon green
          accent: {
            DEFAULT: '#10b981',
            50: '#ecfdf5',
            100: '#d1fae5',
            200: '#a7f3d0',
            300: '#6ee7b7',
            400: '#34d399',
            500: '#10b981',
            600: '#059669',
            700: '#047857',
            800: '#065f46',
            900: '#064e3b',
          },
          // Dark surfaces with subtle variations
          surface: {
            DEFAULT: '#0f0f0f',
            50: '#1a1a1a',
            100: '#171717',
            200: '#141414',
            300: '#121212',
            400: '#0f0f0f',
            500: '#0c0c0c',
            600: '#0a0a0a',
            700: '#080808',
            800: '#050505',
            900: '#000000',
          },
          // Glow/neon effect colors
          glow: {
            cyan: '#22d3ee',
            blue: '#3b82f6',
            purple: '#a855f7',
            pink: '#ec4899',
            green: '#10b981',
            white: '#ffffff',
          },
        },
        // Provider brand colors
        provider: {
          claude: '#ff6b35',
          gemini: '#4285f4',
          grok: '#1da1f2',
          deepseek: '#00d4aa',
          jules: '#ea4335',
          codex: '#74aa9c',
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
      backgroundImage: {
        // Modern gradients
        'gradient-primary': 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
        'gradient-secondary': 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
        'gradient-accent': 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
        'gradient-dark': 'linear-gradient(180deg, #0f0f0f 0%, #0a0a0a 100%)',
        'gradient-surface': 'linear-gradient(135deg, #141414 0%, #0a0a0a 100%)',
        // Radial glow gradients
        'glow-cyan': 'radial-gradient(ellipse at center, rgba(34, 211, 238, 0.15) 0%, transparent 70%)',
        'glow-blue': 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
        'glow-purple': 'radial-gradient(ellipse at center, rgba(168, 85, 247, 0.15) 0%, transparent 70%)',
        'glow-pink': 'radial-gradient(ellipse at center, rgba(236, 72, 153, 0.15) 0%, transparent 70%)',
        'glow-green': 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
        // Provider gradients
        'gradient-claude': 'linear-gradient(135deg, #ff6b35 0%, #ff8c5a 100%)',
        'gradient-gemini': 'linear-gradient(135deg, #4285f4 0%, #34a853 50%, #fbbc04 100%)',
        'gradient-grok': 'linear-gradient(135deg, #1da1f2 0%, #0d8ecf 100%)',
        // Mesh gradients for backgrounds
        'mesh-modern': 'radial-gradient(at 40% 20%, rgba(6, 182, 212, 0.1) 0%, transparent 50%), radial-gradient(at 80% 0%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(at 0% 50%, rgba(16, 185, 129, 0.05) 0%, transparent 50%)',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-soft': 'pulse-soft 1.5s ease-in-out infinite',
        'gradient-x': 'gradient-x 3s ease infinite',
        'gradient-xy': 'gradient-xy 6s ease infinite',
        'bounce-subtle': 'bounce-subtle 2s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-in-up': 'slide-in-up 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '0.7' },
          '50%': { opacity: '1' },
        },
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'gradient-xy': {
          '0%, 100%': { backgroundPosition: '0% 0%' },
          '25%': { backgroundPosition: '100% 0%' },
          '50%': { backgroundPosition: '100% 100%' },
          '75%': { backgroundPosition: '0% 100%' },
        },
        'bounce-subtle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-2px)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px currentColor, 0 0 10px currentColor' },
          '50%': { boxShadow: '0 0 10px currentColor, 0 0 20px currentColor, 0 0 30px currentColor' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      transitionDuration: {
        '2000': '2000ms',
      }
    },
  },
  plugins: [require('tailwindcss-animate')],
}
