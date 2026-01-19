# UI Components Documentation

## Overview

This document provides comprehensive documentation for the reusable UI components in the HYDRA Launcher application. These components are designed to provide a consistent, accessible, and visually appealing user interface with advanced animations and effects.

**Location:** `hydra-launcher/src/components/ui/`

---

## Table of Contents

1. [GlowCard](#glowcard)
2. [AnimatedText](#animatedtext)
3. [FloatingDock](#floatingdock)

---

## GlowCard

### Description

`GlowCard` is a premium animated card component featuring a rotating gradient border glow effect. It provides an elevated visual experience with 3D perspective transforms on hover, backdrop blur with noise texture, and configurable glow colors per provider.

### Features

- Animated rotating gradient border glow
- Configurable glow color (with provider presets)
- Hover state with intensified glow and 3D transform
- Backdrop blur with noise texture
- Multiple variants: `default`, `elevated`, `floating`
- Cursor-following glow effect
- Theme-aware (light/dark mode support)

### Props API

```typescript
interface GlowCardProps {
  /** Glow color - CSS color value (hex, rgb, hsl). Default: '#ffffff' */
  glowColor?: string;

  /** Glow intensity 0-1. Default: 0.6 */
  intensity?: number;

  /** Card variant. Default: 'default' */
  variant?: 'default' | 'elevated' | 'floating';

  /** Additional CSS classes */
  className?: string;

  /** Click handler */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;

  /** Children to render inside card */
  children?: React.ReactNode;

  /** Disable hover effects. Default: false */
  disableHover?: boolean;

  /** Disable 3D tilt effect. Default: false */
  disableTilt?: boolean;

  /** Disable glow animation. Default: false */
  disableAnimation?: boolean;

  /** Border radius in pixels. Default: 16 */
  borderRadius?: number;

  /** Animation speed multiplier. Default: 1 */
  animationSpeed?: number;

  /** Aria label for accessibility */
  'aria-label'?: string;

  /** Aria role */
  role?: string;

  /** Tab index for keyboard navigation */
  tabIndex?: number;
}
```

### Provider Glow Presets

```typescript
const PROVIDER_GLOW_COLORS = {
  claude: '#f59e0b',    // Amber
  gemini: '#3b82f6',    // Blue
  jules: '#a855f7',     // Purple
  codex: '#22c55e',     // Green
  grok: '#6b7280',      // Gray
  deepseek: '#ef4444',  // Red
  ollama: '#ec4899',    // Pink
  default: '#ffffff',   // White
};
```

### Usage Examples

#### Basic Usage

```tsx
import { GlowCard } from './components/ui/GlowCard';

function MyComponent() {
  return (
    <GlowCard>
      <div className="p-4">
        <h3>Card Content</h3>
        <p>This is a basic glow card.</p>
      </div>
    </GlowCard>
  );
}
```

#### With Provider Color

```tsx
import { GlowCard, getProviderGlowColor } from './components/ui/GlowCard';

function ProviderCard({ provider }: { provider: string }) {
  return (
    <GlowCard
      glowColor={getProviderGlowColor(provider)}
      intensity={0.8}
    >
      <div className="p-6">
        <h3>{provider} Integration</h3>
      </div>
    </GlowCard>
  );
}
```

#### Elevated Variant with Click Handler

```tsx
import { GlowCard } from './components/ui/GlowCard';

function ClickableCard() {
  const handleClick = () => {
    console.log('Card clicked!');
  };

  return (
    <GlowCard
      variant="elevated"
      glowColor="#3b82f6"
      onClick={handleClick}
      aria-label="Click to open details"
    >
      <div className="p-4">
        <p>Click me!</p>
      </div>
    </GlowCard>
  );
}
```

#### Floating Variant with Custom Animation Speed

```tsx
import { GlowCard } from './components/ui/GlowCard';

function FloatingCard() {
  return (
    <GlowCard
      variant="floating"
      glowColor="#a855f7"
      animationSpeed={2}
      borderRadius={24}
    >
      <div className="p-8">
        <h2>Premium Feature</h2>
        <p>This card floats above the content.</p>
      </div>
    </GlowCard>
  );
}
```

#### Static Card (No Animations)

```tsx
import { GlowCard } from './components/ui/GlowCard';

function StaticCard() {
  return (
    <GlowCard
      disableHover
      disableTilt
      disableAnimation
      intensity={0.4}
    >
      <div className="p-4">
        <p>Static content without animations.</p>
      </div>
    </GlowCard>
  );
}
```

### Variants

| Variant | Description | Shadow Style |
|---------|-------------|--------------|
| `default` | Standard card with subtle shadow | Light shadow with minimal elevation |
| `elevated` | Raised card with deeper shadows | Medium shadow for depth perception |
| `floating` | Appears to float above content | Strong shadow + slight Y-offset |

### Accessibility (a11y) Considerations

1. **Keyboard Navigation**: When `onClick` is provided, the component automatically:
   - Sets `role="button"`
   - Makes it focusable with `tabIndex={0}`
   - Handles `Enter` and `Space` key presses

2. **ARIA Support**: Use `aria-label` prop to provide descriptive labels for screen readers.

3. **Focus Indicators**: Ensure proper focus styles are applied via CSS for keyboard users.

4. **Motion Preferences**: Consider respecting `prefers-reduced-motion` media query by setting `disableAnimation={true}`.

```tsx
// Example with reduced motion support
import { useEffect, useState } from 'react';

function AccessibleGlowCard({ children }) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
  }, []);

  return (
    <GlowCard
      disableAnimation={prefersReducedMotion}
      disableTilt={prefersReducedMotion}
    >
      {children}
    </GlowCard>
  );
}
```

---

## AnimatedText

### Description

`AnimatedText` is an advanced text animation component supporting multiple animation effects including gradient color transitions, typewriter effects, split letter animations, blur reveals, and wave patterns.

### Features

- **Gradient**: Animated color gradient sliding across text
- **Typewriter**: Classic typewriter effect with blinking cursor
- **Split**: Each letter animates in separately with 3D transforms
- **Blur**: Text reveals from blur to sharp
- **Wave**: Letters animate in a continuous wave pattern

### Props API

```typescript
interface AnimatedTextProps {
  /** Text to animate */
  text: string;

  /** Animation effect type. Default: 'gradient' */
  effect?: 'gradient' | 'typewriter' | 'split' | 'blur' | 'wave';

  /** Animation speed in ms (meaning varies by effect). Default: 50 */
  speed?: number;

  /** Gradient colors (for gradient effect) */
  colors?: string[];

  /** Delay between letters in ms. Default: 50 */
  letterDelay?: number;

  /** Loop animation continuously. Default: false */
  loop?: boolean;

  /** Custom className */
  className?: string;

  /** Callback when animation completes */
  onComplete?: () => void;

  /** Custom tag to render. Default: 'span' */
  as?: React.ElementType;

  /** Cursor character for typewriter effect. Default: '|' */
  cursor?: string;

  /** Show cursor for typewriter effect. Default: true */
  showCursor?: boolean;

  /** Pause duration at end before looping (ms). Default: 2000 */
  loopPause?: number;

  /** Wave amplitude in pixels. Default: 10 */
  waveAmplitude?: number;

  /** Wave frequency. Default: 0.1 */
  waveFrequency?: number;
}
```

### Usage Examples

#### Gradient Effect

```tsx
import { AnimatedText } from './components/ui/AnimatedText';

function GradientTitle() {
  return (
    <AnimatedText
      text="HYDRA Dashboard"
      effect="gradient"
      colors={['#f59e0b', '#ef4444', '#8b5cf6', '#f59e0b']}
      speed={30}
    />
  );
}
```

#### Typewriter Effect

```tsx
import { AnimatedText } from './components/ui/AnimatedText';

function TypewriterDemo() {
  return (
    <AnimatedText
      text="Initializing system..."
      effect="typewriter"
      speed={80}
      cursor="_"
      showCursor={true}
      loop={true}
      loopPause={3000}
    />
  );
}
```

#### Split Letter Animation

```tsx
import { AnimatedText } from './components/ui/AnimatedText';

function SplitTitle() {
  const handleComplete = () => {
    console.log('Animation complete!');
  };

  return (
    <AnimatedText
      text="Welcome"
      effect="split"
      letterDelay={100}
      onComplete={handleComplete}
      className="text-4xl font-bold"
    />
  );
}
```

#### Blur Reveal

```tsx
import { AnimatedText } from './components/ui/AnimatedText';

function BlurReveal() {
  return (
    <AnimatedText
      text="Revealing Content"
      effect="blur"
      letterDelay={80}
      loop={true}
      loopPause={2500}
    />
  );
}
```

#### Wave Animation

```tsx
import { AnimatedText } from './components/ui/AnimatedText';

function WaveText() {
  return (
    <AnimatedText
      text="Loading..."
      effect="wave"
      waveAmplitude={8}
      waveFrequency={0.15}
      className="text-lg text-gray-400"
    />
  );
}
```

#### As Heading Element

```tsx
import { AnimatedText } from './components/ui/AnimatedText';

function AnimatedHeading() {
  return (
    <AnimatedText
      text="Main Title"
      effect="gradient"
      as="h1"
      className="text-5xl font-extrabold"
      colors={['#22c55e', '#3b82f6', '#22c55e']}
    />
  );
}
```

### Effect Comparison

| Effect | Description | Best For | Speed Meaning |
|--------|-------------|----------|---------------|
| `gradient` | Color slides across text | Titles, branding | Gradient animation speed |
| `typewriter` | Types text character by character | Loading states, terminals | Characters per second |
| `split` | Letters fly in with 3D transform | Headlines, emphasis | N/A (uses letterDelay) |
| `blur` | Text sharpens from blur | Reveals, transitions | N/A (uses letterDelay) |
| `wave` | Continuous wave motion | Loading indicators | N/A (uses waveFrequency) |

### Accessibility (a11y) Considerations

1. **Semantic HTML**: Use the `as` prop to render appropriate heading levels (`h1`-`h6`) for proper document structure.

2. **Motion Preferences**: For users who prefer reduced motion, consider:

```tsx
function AccessibleAnimatedText({ text, ...props }) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
  }, []);

  if (prefersReducedMotion) {
    return <span className={props.className}>{text}</span>;
  }

  return <AnimatedText text={text} {...props} />;
}
```

3. **Screen Reader Compatibility**: The full text is always available in the DOM, ensuring screen readers can access the content regardless of animation state.

4. **Typewriter Cursor**: The cursor is purely decorative; ensure important information is conveyed through the text itself.

---

## FloatingDock

### Description

`FloatingDock` is a macOS-style dock component with smooth magnification effects on hover. It supports multiple positions (bottom, left, right), customizable icon sizes, badges, and active states.

### Features

- macOS-style dock magnification effect
- Gaussian-based smooth scaling
- Multiple dock positions (bottom, left, right)
- Tooltips on hover
- Badge support (numeric and string)
- Active/selected state indicators
- Glassmorphism background effect
- Spring-like animation curves

### Props API

#### FloatingDockProps

```typescript
interface FloatingDockProps {
  /** Array of dock items to display */
  items: DockItem[];

  /** Position of the dock. Default: 'bottom' */
  position?: 'bottom' | 'left' | 'right';

  /** Magnification factor (1.0 = no magnification). Default: 1.5 */
  magnification?: number;

  /** Base icon size in pixels. Default: 48 */
  baseIconSize?: number;

  /** Distance from edge in pixels. Default: 16 */
  distance?: number;

  /** Whether to show the dock. Default: true */
  visible?: boolean;

  /** Additional class names */
  className?: string;
}
```

#### DockItem

```typescript
interface DockItem {
  /** Unique identifier for the item */
  id: string;

  /** Icon element (ReactNode - emoji, Lucide icon, or custom SVG) */
  icon: React.ReactNode;

  /** Label shown in tooltip on hover */
  label: string;

  /** Click handler */
  onClick?: () => void;

  /** Optional badge (number or string) */
  badge?: number | string;

  /** Whether the item is active/selected */
  isActive?: boolean;

  /** Whether the item is disabled */
  disabled?: boolean;
}
```

### Usage Examples

#### Basic Bottom Dock

```tsx
import { FloatingDock } from './components/ui/FloatingDock';
import { Home, Settings, User, Bell } from 'lucide-react';

function BasicDock() {
  const items = [
    {
      id: 'home',
      icon: <Home size={24} />,
      label: 'Home',
      onClick: () => console.log('Home clicked'),
      isActive: true,
    },
    {
      id: 'profile',
      icon: <User size={24} />,
      label: 'Profile',
      onClick: () => console.log('Profile clicked'),
    },
    {
      id: 'notifications',
      icon: <Bell size={24} />,
      label: 'Notifications',
      onClick: () => console.log('Notifications clicked'),
      badge: 5,
    },
    {
      id: 'settings',
      icon: <Settings size={24} />,
      label: 'Settings',
      onClick: () => console.log('Settings clicked'),
    },
  ];

  return <FloatingDock items={items} />;
}
```

#### Left Position with Custom Magnification

```tsx
import { FloatingDock } from './components/ui/FloatingDock';

function LeftDock() {
  const items = [
    { id: 'item1', icon: '🏠', label: 'Dashboard', onClick: () => {} },
    { id: 'item2', icon: '📊', label: 'Analytics', onClick: () => {} },
    { id: 'item3', icon: '⚙️', label: 'Settings', onClick: () => {} },
  ];

  return (
    <FloatingDock
      items={items}
      position="left"
      magnification={2.0}
      baseIconSize={56}
    />
  );
}
```

#### With Badges and Disabled Items

```tsx
import { FloatingDock, DockItem } from './components/ui/FloatingDock';
import { Mail, Inbox, Trash, Archive } from 'lucide-react';

function MailDock() {
  const items: DockItem[] = [
    {
      id: 'inbox',
      icon: <Inbox size={24} />,
      label: 'Inbox',
      onClick: () => {},
      badge: 12,
      isActive: true,
    },
    {
      id: 'mail',
      icon: <Mail size={24} />,
      label: 'Compose',
      onClick: () => {},
    },
    {
      id: 'archive',
      icon: <Archive size={24} />,
      label: 'Archive',
      onClick: () => {},
      badge: '99+',
    },
    {
      id: 'trash',
      icon: <Trash size={24} />,
      label: 'Trash (Coming Soon)',
      disabled: true,
    },
  ];

  return <FloatingDock items={items} distance={24} />;
}
```

#### Conditional Visibility

```tsx
import { useState } from 'react';
import { FloatingDock } from './components/ui/FloatingDock';

function ToggleableDock() {
  const [isVisible, setIsVisible] = useState(true);

  const items = [
    { id: 'toggle', icon: '👁️', label: 'Toggle Dock', onClick: () => setIsVisible(v => !v) },
    { id: 'item2', icon: '📝', label: 'Notes', onClick: () => {} },
    { id: 'item3', icon: '📅', label: 'Calendar', onClick: () => {} },
  ];

  return (
    <>
      <button onClick={() => setIsVisible(v => !v)}>
        Toggle Dock
      </button>
      <FloatingDock items={items} visible={isVisible} />
    </>
  );
}
```

#### Right Position with Small Icons

```tsx
import { FloatingDock } from './components/ui/FloatingDock';

function CompactRightDock() {
  const items = [
    { id: 'a', icon: 'A', label: 'Option A', onClick: () => {} },
    { id: 'b', icon: 'B', label: 'Option B', onClick: () => {} },
    { id: 'c', icon: 'C', label: 'Option C', onClick: () => {}, isActive: true },
  ];

  return (
    <FloatingDock
      items={items}
      position="right"
      baseIconSize={36}
      magnification={1.3}
      distance={8}
    />
  );
}
```

### Position Variants

| Position | Description | Tooltip Direction |
|----------|-------------|-------------------|
| `bottom` | Dock at bottom center (default) | Above items |
| `left` | Dock at left center | Right of items |
| `right` | Dock at right center | Left of items |

### Magnification Behavior

The magnification effect uses a Gaussian falloff algorithm:

- Items directly under the cursor scale up to `magnification` factor
- Adjacent items scale proportionally based on distance
- Effect smoothly transitions across approximately 3 items
- No magnification when mouse is outside dock area

### Accessibility (a11y) Considerations

1. **Keyboard Navigation**: Dock items are `<button>` elements and can be focused with Tab key.

2. **Tooltips**: Labels appear on hover providing context for icon-only buttons.

3. **Disabled State**: Disabled items have `aria-disabled` semantics through the native `disabled` attribute.

4. **Active State**: Visual indicators show which item is currently active.

5. **Reduced Motion**: Consider implementing:

```tsx
function AccessibleFloatingDock(props) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
  }, []);

  return (
    <FloatingDock
      {...props}
      magnification={prefersReducedMotion ? 1 : props.magnification}
    />
  );
}
```

6. **Focus Management**: Ensure focus is properly managed when dock visibility changes.

---

## CSS Dependencies

### GlowCard Animation Keyframes

Add to your global CSS or ensure the component includes:

```css
@keyframes gradient-border-rotate {
  0% {
    background-position: 0% 0%;
  }
  100% {
    background-position: 300% 0%;
  }
}
```

### FloatingDock Animation Keyframes

These are included inline in the component:

```css
@keyframes dock-glow {
  0%, 100% {
    box-shadow: 0 0 20px rgba(255, 255, 255, 0.15), 0 0 40px rgba(255, 255, 255, 0.05);
  }
  50% {
    box-shadow: 0 0 30px rgba(255, 255, 255, 0.2), 0 0 60px rgba(255, 255, 255, 0.08);
  }
}

@keyframes dock-bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}
```

---

## Theme Integration

All components integrate with the `ThemeContext` from `../../contexts/ThemeContext` for automatic light/dark mode support. Components automatically adjust:

- Background colors
- Border colors
- Shadow intensities
- Glow opacities

---

## Best Practices

1. **Performance**: For lists with many GlowCards, consider using `disableAnimation` or `disableTilt` to reduce GPU load.

2. **Accessibility First**: Always provide meaningful `aria-label` values and respect user motion preferences.

3. **Consistent Styling**: Use provider color presets (`PROVIDER_GLOW_COLORS`) for brand consistency.

4. **Responsive Design**: Adjust `baseIconSize` and `magnification` for different screen sizes.

5. **Semantic HTML**: Use the `as` prop in AnimatedText to maintain proper heading hierarchy.
