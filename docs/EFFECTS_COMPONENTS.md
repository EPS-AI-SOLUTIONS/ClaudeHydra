# Effects Components Documentation

Visual effect components for HYDRA Launcher backgrounds and animations.

---

## Table of Contents

- [Overview](#overview)
- [AuroraBackground](#aurorabackground)
- [Spotlight](#spotlight)
- [ParticleField](#particlefield)
- [MorphingBlob](#morphingblob)
- [Performance Best Practices](#performance-best-practices)
- [Theme Integration](#theme-integration)

---

## Overview

The effects components provide visually appealing background animations and interactive effects for the HYDRA Launcher. All components are designed with:

- **GPU acceleration** via CSS transforms and `will-change`
- **Theme awareness** - automatic adaptation to light/dark modes
- **Reduced motion support** - respects `prefers-reduced-motion`
- **Performance optimization** - capped particle counts, memoization, RAF loops

### Import

```typescript
import {
  AuroraBackground,
  Spotlight,
  ParticleField,
  MorphingBlob
} from '@/components/effects';
```

---

## AuroraBackground

Animated gradient background resembling aurora borealis. Uses pure CSS animations for optimal performance with GPU acceleration.

### Description

AuroraBackground creates a multi-layered animated gradient effect with four independent layers that drift and pulse. Each layer uses radial gradients with configurable colors and is animated using CSS keyframes for smooth, GPU-accelerated performance.

### Props API

```typescript
interface AuroraBackgroundProps {
  /** Intensity of the aurora effect (0.0 - 1.0) */
  intensity?: number;
  /** Custom colors for aurora layers. Default uses theme-appropriate colors */
  colors?: string[];
  /** Animation speed multiplier (1.0 = normal) */
  speed?: number;
  /** Blur amount in pixels */
  blur?: number;
  /** Additional CSS classes */
  className?: string;
  /** Children to render on top of aurora */
  children?: React.ReactNode;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `intensity` | `number` | `0.6` | Controls opacity/visibility of effect (0.0-1.0) |
| `colors` | `string[]` | Theme-dependent | Array of 4 RGBA colors for gradient layers |
| `speed` | `number` | `1` | Animation speed multiplier (higher = faster) |
| `blur` | `number` | `120` | Blur radius in pixels |
| `className` | `string` | `''` | Additional CSS classes |
| `children` | `ReactNode` | - | Content rendered above the aurora |

### Usage Examples

**Basic Usage**

```tsx
import { AuroraBackground } from '@/components/effects';

function App() {
  return (
    <AuroraBackground>
      <main>Your content here</main>
    </AuroraBackground>
  );
}
```

**Custom Colors and Intensity**

```tsx
<AuroraBackground
  intensity={0.8}
  colors={[
    'rgba(59, 130, 246, 0.5)',   // Blue
    'rgba(147, 51, 234, 0.45)',  // Purple
    'rgba(236, 72, 153, 0.4)',   // Pink
    'rgba(34, 197, 94, 0.35)',   // Green
  ]}
  speed={1.5}
  blur={100}
>
  <YourContent />
</AuroraBackground>
```

**Subtle Background**

```tsx
<AuroraBackground
  intensity={0.3}
  speed={0.5}
  blur={150}
/>
```

### Performance Notes

- Uses CSS `will-change: transform, opacity` for GPU acceleration
- Applies `transform: translateZ(0)` to force hardware acceleration
- Supports `@media (prefers-reduced-motion: reduce)` - disables animations
- Fixed positioning with `pointer-events: none` to avoid interaction overhead
- Memoized layer styles and animation durations

### Theme Compatibility

| Mode | Background | Default Colors |
|------|------------|----------------|
| Dark | `#0a0a0a` | Teal (0.4), Purple (0.35), Blue (0.3), Pink (0.25) |
| Light | `#fafafa` | Softer versions: Teal (0.25), Purple (0.2), Blue (0.2), Pink (0.15) |

---

## Spotlight

Mouse-following radial gradient spotlight effect with optional magnetic attraction to elements.

### Description

Spotlight creates a smooth, mouse-following light effect that can optionally "snap" to specified elements with configurable magnetic strength. Uses `requestAnimationFrame` for 60fps smooth animations with custom easing.

### Props API

```typescript
interface MagneticElement {
  /** CSS selector for magnetic elements */
  selector: string;
  /** Magnetic pull strength 0-1 (default: 0.3) */
  strength?: number;
  /** Distance threshold in pixels (default: 100) */
  threshold?: number;
}

interface SpotlightProps {
  /** Spotlight radius in pixels (default: 200) */
  size?: number;
  /** Spotlight color - CSS color value (default: theme-aware white/black) */
  color?: string;
  /** Blur amount in pixels (default: 80) */
  blur?: number;
  /** Opacity/intensity 0-1 (default: 0.15) */
  intensity?: number;
  /** Enable magnetic attraction to elements (default: false) */
  magnetic?: boolean;
  /** Magnetic element configurations */
  magneticElements?: MagneticElement[];
  /** Easing factor for smooth follow 0-1 (default: 0.12) */
  easing?: number;
  /** Whether spotlight is enabled (default: true) */
  enabled?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Z-index (default: 1) */
  zIndex?: number;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `number` | `200` | Spotlight diameter in pixels |
| `color` | `string` | Theme-aware | CSS color (white for dark, black for light) |
| `blur` | `number` | `80` | Blur radius in pixels |
| `intensity` | `number` | `0.15` | Opacity when active (0.0-1.0) |
| `magnetic` | `boolean` | `false` | Enable magnetic attraction |
| `magneticElements` | `MagneticElement[]` | `[]` | Elements to attract spotlight |
| `easing` | `number` | `0.12` | Smoothing factor (lower = smoother) |
| `enabled` | `boolean` | `true` | Toggle spotlight visibility |
| `className` | `string` | `''` | Additional CSS classes |
| `zIndex` | `number` | `1` | Layer ordering |

### Usage Examples

**Basic Spotlight**

```tsx
import { Spotlight } from '@/components/effects';

function Page() {
  return (
    <>
      <Spotlight />
      <main>Your content</main>
    </>
  );
}
```

**Custom Color and Size**

```tsx
<Spotlight
  size={300}
  color="rgba(59, 130, 246, 0.8)"
  intensity={0.25}
  blur={100}
/>
```

**Magnetic Spotlight (snaps to buttons)**

```tsx
<Spotlight
  magnetic={true}
  magneticElements={[
    { selector: 'button', strength: 0.4, threshold: 120 },
    { selector: '.card', strength: 0.3, threshold: 150 },
    { selector: '[data-spotlight]', strength: 0.5, threshold: 100 },
  ]}
  easing={0.08}
/>
```

**Disabled State**

```tsx
<Spotlight enabled={isSpotlightEnabled} />
```

### Performance Notes

- Uses `requestAnimationFrame` for smooth 60fps animation
- Only updates position when movement exceeds 0.1px threshold
- Uses `translate3d` transforms for GPU acceleration
- Wrapped in `React.memo` to prevent unnecessary re-renders
- Cleans up animation frame on unmount
- `will-change: transform, opacity` for performance hints

### Theme Compatibility

| Mode | Default Color | Visual Effect |
|------|---------------|---------------|
| Dark | `#ffffff` | White glow following cursor |
| Light | `#000000` | Dark subtle shadow effect |

---

## ParticleField

Interactive particle system with connections and mouse interaction effects.

### Description

ParticleField creates a field of floating particles with optional connecting lines between nearby particles. Supports mouse parallax effect and particle repulsion for interactive backgrounds.

### Props API

```typescript
interface ParticleFieldProps {
  /** Number of particles (max 50 for performance) */
  count?: number;
  /** Base color for particles (CSS color value) */
  color?: string;
  /** Animation speed multiplier (0.1 - 2) */
  speed?: number;
  /** Enable connections between nearby particles */
  connections?: boolean;
  /** Enable mouse interaction (parallax + repulsion) */
  mouseInteraction?: boolean;
  /** Connection distance threshold (in pixels) */
  connectionDistance?: number;
  /** Mouse repulsion strength (0 - 1) */
  repulsionStrength?: number;
  /** Custom class name */
  className?: string;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `count` | `number` | `30` | Number of particles (capped at 50) |
| `color` | `string` | Theme-aware | Base particle color (RGBA without closing paren) |
| `speed` | `number` | `1` | Animation speed (0.1-2.0 range) |
| `connections` | `boolean` | `true` | Draw lines between nearby particles |
| `mouseInteraction` | `boolean` | `true` | Enable parallax and repulsion |
| `connectionDistance` | `number` | `150` | Max distance for connections (px) |
| `repulsionStrength` | `number` | `0.3` | Mouse repulsion force (0-1) |
| `className` | `string` | `''` | Additional CSS classes |

### Usage Examples

**Basic Particle Field**

```tsx
import { ParticleField } from '@/components/effects';

function Background() {
  return (
    <div className="relative h-screen">
      <ParticleField />
    </div>
  );
}
```

**High-Density Interactive Field**

```tsx
<ParticleField
  count={50}
  connections={true}
  connectionDistance={200}
  mouseInteraction={true}
  repulsionStrength={0.5}
  speed={0.8}
/>
```

**Minimal Static Particles**

```tsx
<ParticleField
  count={15}
  connections={false}
  mouseInteraction={false}
  speed={0.5}
/>
```

**Custom Colors**

```tsx
<ParticleField
  color="rgba(59, 130, 246,"
  count={40}
  connections={true}
/>
```

### Performance Notes

- **Particle cap**: Maximum 50 particles enforced
- **Connection cap**: Maximum 100 connection lines
- **Speed clamp**: Enforced range 0.1-2.0
- Uses `ResizeObserver` for responsive container sizing
- Memoized particle generation and connection calculations
- CSS transitions disabled during active mouse interaction
- SVG rendering for connection lines (hardware accelerated)
- `will-change: transform, left, top` on particles
- Glow effect uses box-shadow (GPU composited)

### Theme Compatibility

| Mode | Particle Color | Connection Color | Glow |
|------|----------------|------------------|------|
| Dark | `rgba(200, 200, 200, *)` | `rgba(180, 180, 180, *)` | Stronger (0.5 opacity) |
| Light | `rgba(80, 80, 80, *)` | `rgba(100, 100, 100, *)` | Softer (0.3 opacity) |

---

## MorphingBlob

SVG-based morphing blob with animated gradients and glow effects.

### Description

MorphingBlob creates organic, fluid shapes that continuously morph between states using SVG path animations. Multiple overlapping blobs with staggered animations create a complex, layered effect.

### Props API

```typescript
interface MorphingBlobProps {
  /** Array of colors for gradient fill */
  colors?: string[];
  /** Size of the blob in pixels */
  size?: number;
  /** Animation speed multiplier (default: 1) */
  speed?: number;
  /** Blur amount in pixels */
  blur?: number;
  /** Glow intensity (0-1) */
  glow?: number;
  /** Custom className for container */
  className?: string;
  /** Opacity of the blob (0-1) */
  opacity?: number;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `colors` | `string[]` | `['#3b82f6', '#8b5cf6', '#ec4899']` | Gradient colors (blue, purple, pink) |
| `size` | `number` | `300` | Base blob size in pixels |
| `speed` | `number` | `1` | Animation speed multiplier |
| `blur` | `number` | `40` | Blur radius in pixels |
| `glow` | `number` | `0.5` | Glow filter intensity (0-1) |
| `className` | `string` | `''` | Additional CSS classes |
| `opacity` | `number` | `0.6` | Base opacity (0-1) |

### Usage Examples

**Basic Morphing Blob**

```tsx
import { MorphingBlob } from '@/components/effects';

function Hero() {
  return (
    <div className="relative">
      <MorphingBlob />
      <h1>Welcome</h1>
    </div>
  );
}
```

**Large Vibrant Blob**

```tsx
<MorphingBlob
  size={500}
  colors={['#f43f5e', '#8b5cf6', '#06b6d4', '#22c55e']}
  opacity={0.8}
  glow={0.7}
  speed={1.2}
/>
```

**Subtle Background Accent**

```tsx
<MorphingBlob
  size={200}
  blur={60}
  opacity={0.3}
  glow={0.2}
  speed={0.5}
/>
```

**Custom Color Scheme**

```tsx
<MorphingBlob
  colors={['#fbbf24', '#f97316', '#ef4444']}
  size={400}
/>
```

### Architecture

The component renders 4 overlapping `SingleBlob` components with:

| Blob | Scale | Offset (X, Y) | Delay | Opacity |
|------|-------|---------------|-------|---------|
| 1 | 1.0 | (0, 0) | 0s | 100% of base |
| 2 | 0.8 | (-30, 20) | 2s | 80% of base |
| 3 | 0.7 | (40, -25) | 4s | 70% of base |
| 4 | 0.6 | (-20, -40) | 6s | 60% of base |

### Performance Notes

- SVG-based animations (hardware accelerated)
- Uses `<animate>` elements instead of JavaScript
- Path morphing via SMIL `calcMode="spline"` with easing
- Gradient rotation animated via `animateTransform`
- `mix-blend-mode: screen` for color blending
- Memoized blob configurations and path generation
- `useId()` hook ensures unique SVG element IDs
- `aria-hidden="true"` for accessibility

### Theme Compatibility

MorphingBlob is theme-agnostic and uses custom colors. Recommendations:

| Mode | Suggested Colors | Opacity |
|------|------------------|---------|
| Dark | Vibrant saturated colors | 0.5-0.8 |
| Light | Pastel or muted tones | 0.3-0.5 |

---

## Performance Best Practices

### General Guidelines

1. **Avoid stacking multiple heavy effects** - Choose one primary effect
2. **Use `enabled` props** - Disable effects when not visible
3. **Reduce particle counts** on mobile/low-power devices
4. **Lower blur values** reduce GPU workload significantly
5. **Prefer CSS animations** over JavaScript when possible

### Memory Management

```tsx
// Disable effects when component unmounts or is hidden
const [effectsEnabled, setEffectsEnabled] = useState(true);

useEffect(() => {
  // Disable during heavy operations
  const handleVisibilityChange = () => {
    setEffectsEnabled(!document.hidden);
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);

return (
  <>
    <AuroraBackground intensity={effectsEnabled ? 0.6 : 0} />
    <Spotlight enabled={effectsEnabled} />
    <ParticleField count={effectsEnabled ? 30 : 0} />
  </>
);
```

### Mobile Considerations

```tsx
const isMobile = window.matchMedia('(max-width: 768px)').matches;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

<ParticleField
  count={isMobile ? 15 : 30}
  connections={!isMobile}
  mouseInteraction={!isMobile && !prefersReducedMotion}
/>
```

---

## Theme Integration

All effects integrate with the HYDRA theme system via `useTheme()` hook from `ThemeContext`.

### Accessing Theme State

```tsx
import { useTheme } from '../../contexts/ThemeContext';

const { resolvedTheme } = useTheme();
const isLight = resolvedTheme === 'light';
```

### Custom Theme-Aware Effects

```tsx
function ThemedBackground() {
  const { resolvedTheme } = useTheme();
  
  const colors = resolvedTheme === 'light'
    ? ['rgba(100, 100, 100, 0.2)', 'rgba(150, 150, 150, 0.15)']
    : ['rgba(200, 200, 200, 0.3)', 'rgba(255, 255, 255, 0.2)'];
    
  return (
    <AuroraBackground colors={colors} intensity={resolvedTheme === 'light' ? 0.4 : 0.6}>
      <Spotlight color={resolvedTheme === 'light' ? '#333' : '#fff'} />
      <ParticleField />
    </AuroraBackground>
  );
}
```

---

## Component Summary

| Component | Best For | Performance | Interactivity |
|-----------|----------|-------------|---------------|
| AuroraBackground | Full-page backgrounds | Excellent | None |
| Spotlight | Cursor effects, highlights | Excellent | Mouse tracking |
| ParticleField | Hero sections, ambient | Good (capped) | Mouse parallax + repulsion |
| MorphingBlob | Accent decorations | Good | None |

---

*Documentation generated for HYDRA Launcher v10.6.1*
