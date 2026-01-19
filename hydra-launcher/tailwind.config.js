/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ============================================
      // 9. TYPOGRAPHY SCALE - Modern 2024-2025
      // ============================================
      fontSize: {
        // Fluid typography with clamp
        'fluid-xs': 'clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)',
        'fluid-sm': 'clamp(0.875rem, 0.8rem + 0.375vw, 1rem)',
        'fluid-base': 'clamp(1rem, 0.9rem + 0.5vw, 1.125rem)',
        'fluid-lg': 'clamp(1.125rem, 1rem + 0.625vw, 1.25rem)',
        'fluid-xl': 'clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem)',
        'fluid-2xl': 'clamp(1.5rem, 1.25rem + 1.25vw, 2rem)',
        'fluid-3xl': 'clamp(1.875rem, 1.5rem + 1.875vw, 2.5rem)',
        'fluid-4xl': 'clamp(2.25rem, 1.75rem + 2.5vw, 3rem)',
        'fluid-5xl': 'clamp(3rem, 2.25rem + 3.75vw, 4rem)',
        'fluid-6xl': 'clamp(3.75rem, 2.75rem + 5vw, 5rem)',
        // Display sizes
        'display-sm': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-lg': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'display-xl': ['6rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      // ============================================
      // 10. SPACING RHYTHM - Harmonic System
      // ============================================
      spacing: {
        // Golden ratio based spacing
        'golden-xs': '0.382rem',    // ~6px
        'golden-sm': '0.618rem',    // ~10px
        'golden-md': '1rem',        // 16px
        'golden-lg': '1.618rem',    // ~26px
        'golden-xl': '2.618rem',    // ~42px
        'golden-2xl': '4.236rem',   // ~68px
        'golden-3xl': '6.854rem',   // ~110px
        // Rhythm spacing (8px base)
        'rhythm-1': '0.25rem',      // 4px
        'rhythm-2': '0.5rem',       // 8px
        'rhythm-3': '0.75rem',      // 12px
        'rhythm-4': '1rem',         // 16px
        'rhythm-5': '1.5rem',       // 24px
        'rhythm-6': '2rem',         // 32px
        'rhythm-8': '3rem',         // 48px
        'rhythm-10': '4rem',        // 64px
        'rhythm-12': '6rem',        // 96px
        'rhythm-16': '8rem',        // 128px
        // Section spacing
        'section-sm': '4rem',
        'section-md': '6rem',
        'section-lg': '8rem',
        'section-xl': '12rem',
      },
      // ============================================
      // 1. BENTO GRID SYSTEM - 2024-2025 Trend
      // ============================================
      gridTemplateColumns: {
        // Bento grid layouts
        'bento-2': 'repeat(2, minmax(0, 1fr))',
        'bento-3': 'repeat(3, minmax(0, 1fr))',
        'bento-4': 'repeat(4, minmax(0, 1fr))',
        'bento-6': 'repeat(6, minmax(0, 1fr))',
        // Asymmetric bento
        'bento-1-2': '1fr 2fr',
        'bento-2-1': '2fr 1fr',
        'bento-1-3': '1fr 3fr',
        'bento-3-1': '3fr 1fr',
        'bento-1-2-1': '1fr 2fr 1fr',
        'bento-2-1-2': '2fr 1fr 2fr',
        // Complex bento
        'bento-sidebar': '280px minmax(0, 1fr)',
        'bento-main': 'minmax(0, 1fr) 320px',
        'bento-dashboard': '280px minmax(0, 1fr) 320px',
      },
      gridTemplateRows: {
        'bento-2': 'repeat(2, minmax(0, 1fr))',
        'bento-3': 'repeat(3, minmax(0, 1fr))',
        'bento-auto': 'auto',
        'bento-1-2': '1fr 2fr',
        'bento-2-1': '2fr 1fr',
        'bento-hero': 'auto minmax(0, 1fr) auto',
      },
      gridColumn: {
        'span-bento-wide': 'span 2 / span 2',
        'span-bento-full': '1 / -1',
      },
      gridRow: {
        'span-bento-tall': 'span 2 / span 2',
        'span-bento-full': '1 / -1',
      },
      // ============================================
      // COLORS with Glassmorphism & Glow additions
      // ============================================
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
        },
        // ============================================
        // 3. GLASSMORPHISM 3.0 Colors
        // ============================================
        glass: {
          white: 'rgba(255, 255, 255, 0.05)',
          'white-10': 'rgba(255, 255, 255, 0.1)',
          'white-15': 'rgba(255, 255, 255, 0.15)',
          'white-20': 'rgba(255, 255, 255, 0.2)',
          dark: 'rgba(0, 0, 0, 0.3)',
          'dark-50': 'rgba(0, 0, 0, 0.5)',
          'dark-70': 'rgba(0, 0, 0, 0.7)',
          frost: 'rgba(255, 255, 255, 0.02)',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-light': 'rgba(255, 255, 255, 0.12)',
        },
        // ============================================
        // 4. NEUMORPHISM Colors
        // ============================================
        neu: {
          bg: '#1a1a1a',
          light: '#252525',
          dark: '#0f0f0f',
          shadow: 'rgba(0, 0, 0, 0.5)',
          highlight: 'rgba(255, 255, 255, 0.05)',
        },
        // ============================================
        // 5. NEON GLOW Colors
        // ============================================
        neon: {
          cyan: '#00ffff',
          'cyan-muted': '#22d3ee',
          blue: '#0080ff',
          'blue-muted': '#3b82f6',
          purple: '#bf00ff',
          'purple-muted': '#a855f7',
          pink: '#ff00ff',
          'pink-muted': '#ec4899',
          green: '#00ff80',
          'green-muted': '#10b981',
          orange: '#ff8000',
          'orange-muted': '#f97316',
          red: '#ff0040',
          'red-muted': '#ef4444',
          yellow: '#ffff00',
          'yellow-muted': '#eab308',
        },
        // ============================================
        // 8. DARK MODE PREMIUM Backgrounds
        // ============================================
        premium: {
          'obsidian': '#050505',
          'charcoal': '#0a0a0a',
          'slate': '#0f0f0f',
          'graphite': '#141414',
          'onyx': '#1a1a1a',
          'midnight': '#0d1117',
          'void': '#000000',
        },
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

        // ============================================
        // 2. AURORA / MESH GRADIENTS - 2024-2025
        // ============================================
        'aurora-1': 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #4facfe 100%)',
        'aurora-2': 'linear-gradient(135deg, #00c6fb 0%, #005bea 25%, #a855f7 50%, #ec4899 75%, #10b981 100%)',
        'aurora-3': 'linear-gradient(135deg, #fa709a 0%, #fee140 25%, #4facfe 50%, #00f2fe 75%, #43e97b 100%)',
        'aurora-dark': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #0f3460 50%, #1a1a2e 100%)',
        'aurora-premium': 'linear-gradient(135deg, #0c0c0c 0%, #1a0a2e 25%, #0a1628 50%, #0c0c0c 100%)',

        // Mesh gradients (multi-point)
        'mesh-aurora': 'radial-gradient(at 0% 0%, rgba(139, 92, 246, 0.3) 0%, transparent 50%), radial-gradient(at 100% 0%, rgba(236, 72, 153, 0.3) 0%, transparent 50%), radial-gradient(at 100% 100%, rgba(6, 182, 212, 0.3) 0%, transparent 50%), radial-gradient(at 0% 100%, rgba(16, 185, 129, 0.3) 0%, transparent 50%)',
        'mesh-premium': 'radial-gradient(at 20% 20%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), radial-gradient(at 80% 20%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), radial-gradient(at 50% 80%, rgba(6, 182, 212, 0.1) 0%, transparent 50%)',
        'mesh-subtle': 'radial-gradient(at 40% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 50%), radial-gradient(at 80% 80%, rgba(255, 255, 255, 0.02) 0%, transparent 50%)',
        'mesh-neon': 'radial-gradient(at 0% 50%, rgba(0, 255, 255, 0.15) 0%, transparent 50%), radial-gradient(at 100% 50%, rgba(255, 0, 255, 0.15) 0%, transparent 50%), radial-gradient(at 50% 100%, rgba(0, 255, 128, 0.1) 0%, transparent 50%)',

        // ============================================
        // 3. GLASSMORPHISM 3.0 Backgrounds
        // ============================================
        'glass-subtle': 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
        'glass-frost': 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
        'glass-dark': 'linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%)',
        'glass-premium': 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 50%, rgba(0, 0, 0, 0.1) 100%)',

        // Noise texture overlay (base64 SVG)
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        'noise-subtle': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",

        // ============================================
        // 6. ANIMATED GRADIENT Backgrounds
        // ============================================
        'gradient-animated': 'linear-gradient(270deg, #06b6d4, #8b5cf6, #ec4899, #10b981, #06b6d4)',
        'gradient-animated-dark': 'linear-gradient(270deg, #0a0a0a, #1a0a2e, #0a1628, #0a2018, #0a0a0a)',
        'gradient-rainbow': 'linear-gradient(90deg, #ff0000, #ff8000, #ffff00, #00ff00, #00ffff, #0080ff, #8000ff, #ff0080, #ff0000)',
        'gradient-sunset': 'linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)',
        'gradient-ocean': 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
        'gradient-forest': 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',

        // ============================================
        // 8. DARK MODE PREMIUM Backgrounds
        // ============================================
        'dark-premium': 'linear-gradient(180deg, #0a0a0a 0%, #050505 100%)',
        'dark-subtle-gradient': 'linear-gradient(135deg, #141414 0%, #0a0a0a 50%, #050505 100%)',
        'dark-radial': 'radial-gradient(ellipse at center, #1a1a1a 0%, #0a0a0a 70%, #050505 100%)',
        'dark-vignette': 'radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.5) 100%)',
        'dark-spotlight': 'radial-gradient(ellipse at top, rgba(255, 255, 255, 0.03) 0%, transparent 50%)',
      },
      // ============================================
      // 3. GLASSMORPHISM 3.0 - Backdrop Blur
      // ============================================
      backdropBlur: {
        'xs': '2px',
        'glass': '12px',
        'glass-lg': '20px',
        'glass-xl': '40px',
        'frosted': '16px',
      },
      // ============================================
      // 4. NEUMORPHISM & 5. GLOW - Box Shadows
      // ============================================
      boxShadow: {
        // Neumorphism Light (dark theme optimized)
        'neu-flat': '0 0 0 transparent',
        'neu-pressed': 'inset 4px 4px 8px rgba(0, 0, 0, 0.5), inset -4px -4px 8px rgba(255, 255, 255, 0.05)',
        'neu-raised': '4px 4px 8px rgba(0, 0, 0, 0.5), -4px -4px 8px rgba(255, 255, 255, 0.05)',
        'neu-subtle': '2px 2px 4px rgba(0, 0, 0, 0.3), -2px -2px 4px rgba(255, 255, 255, 0.03)',
        'neu-hover': '6px 6px 12px rgba(0, 0, 0, 0.5), -6px -6px 12px rgba(255, 255, 255, 0.05)',

        // Glassmorphism 3.0 shadows
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
        'glass-lg': '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        'glass-border': 'inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
        'glass-inner': 'inset 0 2px 4px rgba(255, 255, 255, 0.05)',

        // Neon Glow Effects
        'glow-sm': '0 0 10px currentColor',
        'glow-md': '0 0 20px currentColor',
        'glow-lg': '0 0 30px currentColor, 0 0 60px currentColor',
        'glow-xl': '0 0 40px currentColor, 0 0 80px currentColor, 0 0 120px currentColor',

        // Colored glows
        'glow-cyan': '0 0 20px rgba(0, 255, 255, 0.5), 0 0 40px rgba(0, 255, 255, 0.3)',
        'glow-cyan-lg': '0 0 30px rgba(0, 255, 255, 0.6), 0 0 60px rgba(0, 255, 255, 0.4), 0 0 90px rgba(0, 255, 255, 0.2)',
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.5), 0 0 40px rgba(59, 130, 246, 0.3)',
        'glow-purple': '0 0 20px rgba(168, 85, 247, 0.5), 0 0 40px rgba(168, 85, 247, 0.3)',
        'glow-pink': '0 0 20px rgba(236, 72, 153, 0.5), 0 0 40px rgba(236, 72, 153, 0.3)',
        'glow-green': '0 0 20px rgba(16, 185, 129, 0.5), 0 0 40px rgba(16, 185, 129, 0.3)',
        'glow-orange': '0 0 20px rgba(249, 115, 22, 0.5), 0 0 40px rgba(249, 115, 22, 0.3)',
        'glow-white': '0 0 20px rgba(255, 255, 255, 0.3), 0 0 40px rgba(255, 255, 255, 0.2)',

        // Soft elevation shadows
        'soft-sm': '0 2px 8px rgba(0, 0, 0, 0.15)',
        'soft-md': '0 4px 16px rgba(0, 0, 0, 0.2)',
        'soft-lg': '0 8px 32px rgba(0, 0, 0, 0.25)',
        'soft-xl': '0 16px 48px rgba(0, 0, 0, 0.3)',

        // Premium card shadows
        'card-premium': '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        'card-hover': '0 8px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
      },
      // ============================================
      // Border Radius - Modern curves
      // ============================================
      borderRadius: {
        'bento': '1.5rem',
        'bento-lg': '2rem',
        'bento-xl': '2.5rem',
        'glass': '1rem',
        'glass-lg': '1.5rem',
        'squircle': '30%',
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

        // ============================================
        // 6. ANIMATED GRADIENTS
        // ============================================
        'gradient-flow': 'gradient-flow 8s ease infinite',
        'gradient-rotate': 'gradient-rotate 6s linear infinite',
        'aurora': 'aurora 15s ease infinite',
        'aurora-fast': 'aurora 8s ease infinite',
        'mesh-float': 'mesh-float 20s ease-in-out infinite',

        // ============================================
        // 7. MICRO-INTERACTIONS
        // ============================================
        // Hover effects
        'hover-lift': 'hover-lift 0.2s ease-out forwards',
        'hover-glow': 'hover-glow 0.3s ease-out forwards',
        'hover-scale': 'hover-scale 0.15s ease-out forwards',
        'hover-shake': 'hover-shake 0.5s ease-in-out',
        'hover-bounce': 'hover-bounce 0.4s ease-out',
        'hover-pulse': 'hover-pulse 0.6s ease-in-out',

        // Click effects
        'click-ripple': 'click-ripple 0.6s ease-out',
        'click-pop': 'click-pop 0.15s ease-out',
        'click-shrink': 'click-shrink 0.1s ease-out',

        // Loading animations
        'spin-slow': 'spin 3s linear infinite',
        'spin-fast': 'spin 0.5s linear infinite',
        'pulse-ring': 'pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-dot': 'bounce-dot 1.4s ease-in-out infinite',
        'skeleton': 'skeleton 2s ease-in-out infinite',

        // Attention seekers
        'wiggle': 'wiggle 1s ease-in-out infinite',
        'jiggle': 'jiggle 0.35s ease-in-out infinite',
        'heartbeat': 'heartbeat 1.5s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'float-slow': 'float 6s ease-in-out infinite',

        // Entrance animations
        'enter-fade': 'enter-fade 0.3s ease-out',
        'enter-slide-up': 'enter-slide-up 0.4s ease-out',
        'enter-slide-down': 'enter-slide-down 0.4s ease-out',
        'enter-slide-left': 'enter-slide-left 0.4s ease-out',
        'enter-slide-right': 'enter-slide-right 0.4s ease-out',
        'enter-zoom': 'enter-zoom 0.3s ease-out',
        'enter-rotate': 'enter-rotate 0.5s ease-out',

        // Exit animations
        'exit-fade': 'exit-fade 0.2s ease-in forwards',
        'exit-zoom': 'exit-zoom 0.2s ease-in forwards',

        // Glass effects
        'glass-shimmer': 'glass-shimmer 3s ease infinite',
        'glass-reflect': 'glass-reflect 4s ease-in-out infinite',

        // Neon effects
        'neon-flicker': 'neon-flicker 2s ease-in-out infinite',
        'neon-pulse': 'neon-pulse 2s ease-in-out infinite',
        'neon-breathe': 'neon-breathe 4s ease-in-out infinite',
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

        // ============================================
        // 6. ANIMATED GRADIENTS Keyframes
        // ============================================
        'gradient-flow': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'gradient-rotate': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'aurora': {
          '0%, 100%': { backgroundPosition: '0% 50%', backgroundSize: '200% 200%' },
          '25%': { backgroundPosition: '100% 50%' },
          '50%': { backgroundPosition: '100% 100%', backgroundSize: '200% 200%' },
          '75%': { backgroundPosition: '0% 100%' },
        },
        'mesh-float': {
          '0%, 100%': { backgroundPosition: '0% 0%' },
          '25%': { backgroundPosition: '100% 0%' },
          '50%': { backgroundPosition: '100% 100%' },
          '75%': { backgroundPosition: '0% 100%' },
        },

        // ============================================
        // 7. MICRO-INTERACTIONS Keyframes
        // ============================================
        // Hover effects
        'hover-lift': {
          '0%': { transform: 'translateY(0)', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' },
          '100%': { transform: 'translateY(-4px)', boxShadow: '0 12px 24px rgba(0, 0, 0, 0.2)' },
        },
        'hover-glow': {
          '0%': { boxShadow: '0 0 0 transparent' },
          '100%': { boxShadow: '0 0 20px currentColor, 0 0 40px currentColor' },
        },
        'hover-scale': {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.05)' },
        },
        'hover-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-2px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(2px)' },
        },
        'hover-bounce': {
          '0%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-6px)' },
          '60%': { transform: 'translateY(-3px)' },
        },
        'hover-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.02)', opacity: '0.9' },
        },

        // Click effects
        'click-ripple': {
          '0%': { transform: 'scale(0)', opacity: '0.5' },
          '100%': { transform: 'scale(4)', opacity: '0' },
        },
        'click-pop': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        'click-shrink': {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(0.97)' },
        },

        // Loading animations
        'pulse-ring': {
          '0%': { transform: 'scale(0.95)', opacity: '1' },
          '50%': { transform: 'scale(1)', opacity: '0.5' },
          '100%': { transform: 'scale(0.95)', opacity: '1' },
        },
        'bounce-dot': {
          '0%, 80%, 100%': { transform: 'scale(0)' },
          '40%': { transform: 'scale(1)' },
        },
        'skeleton': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },

        // Attention seekers
        'wiggle': {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        'jiggle': {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
          '25%': { transform: 'scale(1.1) rotate(-3deg)' },
          '50%': { transform: 'scale(1.1) rotate(3deg)' },
          '75%': { transform: 'scale(1.05) rotate(-1deg)' },
        },
        'heartbeat': {
          '0%, 100%': { transform: 'scale(1)' },
          '14%': { transform: 'scale(1.1)' },
          '28%': { transform: 'scale(1)' },
          '42%': { transform: 'scale(1.1)' },
          '70%': { transform: 'scale(1)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },

        // Entrance animations
        'enter-fade': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'enter-slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'enter-slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'enter-slide-left': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'enter-slide-right': {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'enter-zoom': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'enter-rotate': {
          '0%': { opacity: '0', transform: 'rotate(-10deg) scale(0.9)' },
          '100%': { opacity: '1', transform: 'rotate(0deg) scale(1)' },
        },

        // Exit animations
        'exit-fade': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'exit-zoom': {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.9)' },
        },

        // Glass effects
        'glass-shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'glass-reflect': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '0.8' },
        },

        // Neon effects
        'neon-flicker': {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': { opacity: '1', textShadow: '0 0 10px currentColor, 0 0 20px currentColor' },
          '20%, 24%, 55%': { opacity: '0.8', textShadow: 'none' },
        },
        'neon-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px currentColor, 0 0 10px currentColor' },
          '50%': { boxShadow: '0 0 20px currentColor, 0 0 40px currentColor, 0 0 60px currentColor' },
        },
        'neon-breathe': {
          '0%, 100%': { opacity: '0.7', filter: 'blur(0px)' },
          '50%': { opacity: '1', filter: 'blur(1px)' },
        },
      },
      transitionDuration: {
        '2000': '2000ms',
        '3000': '3000ms',
        '4000': '4000ms',
        '5000': '5000ms',
      },
      // ============================================
      // 7. MICRO-INTERACTIONS - Timing Functions
      // ============================================
      transitionTimingFunction: {
        // Modern easing curves
        'bounce-in': 'cubic-bezier(0.6, -0.28, 0.74, 0.05)',
        'bounce-out': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'bounce-in-out': 'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'smooth-in': 'cubic-bezier(0.4, 0, 1, 1)',
        'smooth-out': 'cubic-bezier(0, 0, 0.2, 1)',
        'elastic': 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
        'spring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'snap': 'cubic-bezier(0.36, 0.07, 0.19, 0.97)',
      },
      // ============================================
      // Transition Properties
      // ============================================
      transitionProperty: {
        'glow': 'box-shadow, text-shadow',
        'colors-shadow': 'color, background-color, border-color, box-shadow',
        'transform-opacity': 'transform, opacity',
        'all-smooth': 'all',
      },
      // ============================================
      // Aspect Ratios - Modern layouts
      // ============================================
      aspectRatio: {
        'bento-square': '1 / 1',
        'bento-wide': '2 / 1',
        'bento-tall': '1 / 2',
        'bento-video': '16 / 9',
        'bento-portrait': '3 / 4',
        'bento-landscape': '4 / 3',
        'golden': '1.618 / 1',
      },
      // ============================================
      // Z-Index Scale
      // ============================================
      zIndex: {
        'behind': '-1',
        'base': '0',
        'raised': '1',
        'dropdown': '100',
        'sticky': '200',
        'overlay': '300',
        'modal': '400',
        'popover': '500',
        'tooltip': '600',
        'toast': '700',
        'max': '9999',
      },
      // ============================================
      // Scale for transforms
      // ============================================
      scale: {
        '102': '1.02',
        '103': '1.03',
        '97': '0.97',
        '98': '0.98',
      },
      // ============================================
      // PERFORMANCE UTILITIES
      // ============================================
      willChange: {
        'transform': 'transform',
        'opacity': 'opacity',
        'transform-opacity': 'transform, opacity',
        'scroll': 'scroll-position',
        'contents': 'contents',
        'filter': 'filter',
        'box-shadow': 'box-shadow',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    // Custom performance utilities plugin
    function({ addUtilities }) {
      const performanceUtilities = {
        // GPU Acceleration
        '.gpu-accelerate': {
          transform: 'translateZ(0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
        },
        '.gpu-accelerate-opacity': {
          willChange: 'opacity',
        },
        '.gpu-accelerate-transform': {
          transform: 'translateZ(0)',
          willChange: 'transform',
        },
        '.gpu-accelerate-all': {
          transform: 'translateZ(0)',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          perspective: '1000px',
        },
        // Backface visibility
        '.backface-visible': {
          backfaceVisibility: 'visible',
        },
        '.backface-hidden': {
          backfaceVisibility: 'hidden',
        },
        // Contain for performance
        '.contain-none': {
          contain: 'none',
        },
        '.contain-strict': {
          contain: 'strict',
        },
        '.contain-content': {
          contain: 'content',
        },
        '.contain-layout': {
          contain: 'layout',
        },
        '.contain-paint': {
          contain: 'paint',
        },
        '.contain-size': {
          contain: 'size',
        },
        // Content visibility for virtual scrolling
        '.content-auto': {
          contentVisibility: 'auto',
          containIntrinsicSize: '0 500px',
        },
        '.content-hidden': {
          contentVisibility: 'hidden',
        },
        '.content-visible': {
          contentVisibility: 'visible',
        },
        // Transform optimizations
        '.transform-gpu': {
          transform: 'translate3d(0, 0, 0)',
        },
        // Disable animations
        '.animate-none-important': {
          animation: 'none !important',
        },
        '.transition-none-important': {
          transition: 'none !important',
        },
      };
      addUtilities(performanceUtilities);
    },
  ],
}
