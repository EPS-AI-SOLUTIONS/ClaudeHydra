# BentoGrid Layout Component

```
+---------------------------+---------------------------+-------------+
|                           |                           |             |
|          2x2              |           2x1             |     1x1     |
|                           |                           |             |
|                           +---------------------------+-------------+
|                           |             |             |             |
|                           |     1x1     |     1x1     |     1x2     |
+---------------------------+-------------+-------------+             |
|           2x1             |             |             |             |
+---------------------------+     1x2     +-------------+-------------+
|     1x1     |     1x1     |             |           2x1             |
+-------------+-------------+-------------+---------------------------+
```

## Overview

BentoGrid is a modern, responsive grid layout component inspired by **bento.me**, **linear.app**, and **Apple's design language**. It creates visually appealing "bento box" style layouts with variable-sized cells, glassmorphism effects, and smooth animations.

### Key Features

| Feature | Description |
|---------|-------------|
| Variable Cell Sizes | Support for 1x1, 2x1, 1x2, and 2x2 cells |
| 3D Tilt Effects | Interactive perspective transforms on hover |
| Staggered Animations | Sequential entrance animations for items |
| Glassmorphism | Backdrop blur and gradient overlays |
| Cursor-Following Glow | Dynamic radial gradient that follows mouse |
| Theme Support | Automatic light/dark mode adaptation |
| Responsive | Mobile-first design with breakpoint handling |

---

## Installation & Import

```typescript
import BentoGrid, {
  BentoItem,
  BentoCard,
  BentoStat,
  BentoImage,
  BentoFeature
} from '@/components/layout/BentoGrid';
```

---

## Props API

### BentoGrid Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `BentoItemData[]` | **required** | Array of item configurations |
| `columns` | `2 \| 3 \| 4 \| 6` | `4` | Number of grid columns |
| `gap` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Gap between items |
| `animate` | `boolean` | `true` | Enable entrance animations |
| `animationDelay` | `number` | `100` | Delay between item animations (ms) |
| `className` | `string` | `''` | Additional grid container classes |
| `itemClassName` | `string` | `''` | Classes applied to all items |

### BentoItemData Interface

```typescript
interface BentoItemData {
  id: string;                    // Unique identifier (required)
  size?: BentoSize;              // '1x1' | '2x1' | '1x2' | '2x2'
  className?: string;            // Custom CSS classes
  children?: React.ReactNode;    // Item content
  background?: string;           // Custom background gradient
  borderColor?: string;          // Custom border color
  glowColor?: string;            // Custom hover glow color
  disableTilt?: boolean;         // Disable 3D tilt effect
  disableHover?: boolean;        // Disable all hover effects
}
```

### BentoItem Props

```typescript
interface BentoItemProps {
  size?: BentoSize;              // Default: '1x1'
  className?: string;
  children?: React.ReactNode;
  background?: string;
  borderColor?: string;
  glowColor?: string;
  disableTilt?: boolean;         // Default: false
  disableHover?: boolean;        // Default: false
  index?: number;                // For staggered animation
  animate?: boolean;             // Default: true
  animationDelay?: number;       // Default: 100ms
}
```

---

## Cell Sizes

### Size Types

```typescript
type BentoSize = '1x1' | '2x1' | '1x2' | '2x2';
```

### Visual Reference

```
+-------+       +---------------+       +-------+       +---------------+
|       |       |               |       |       |       |               |
|  1x1  |       |      2x1      |       |       |       |               |
|       |       |               |       |  1x2  |       |      2x2      |
+-------+       +---------------+       |       |       |               |
                                        |       |       |               |
                                        +-------+       +---------------+
```

### CSS Grid Mapping

| Size | Desktop | Mobile (< sm) |
|------|---------|---------------|
| `1x1` | `col-span-1 row-span-1` | `col-span-1 row-span-1` |
| `2x1` | `col-span-2 row-span-1` | `col-span-1 row-span-1` |
| `1x2` | `col-span-1 row-span-2` | `col-span-1 row-span-1` |
| `2x2` | `col-span-2 row-span-2` | `col-span-1 row-span-1` |

---

## Gap Sizes

| Gap | Tailwind Class | Pixels |
|-----|----------------|--------|
| `sm` | `gap-2` | 8px |
| `md` | `gap-3` | 12px |
| `lg` | `gap-4` | 16px |
| `xl` | `gap-6` | 24px |

---

## Responsive Breakpoints

### Column Configuration

| Columns | Mobile (base) | Tablet (md: 768px) | Desktop (lg: 1024px) |
|---------|---------------|--------------------|-----------------------|
| `2` | 2 columns | 2 columns | 2 columns |
| `3` | 2 columns | 3 columns | 3 columns |
| `4` | 2 columns | 4 columns | 4 columns |
| `6` | 2 columns | 3 columns | 6 columns |

### Size Responsiveness

On mobile (< 640px), larger items collapse to 1x1:

```
Desktop:                    Mobile:
+-------+-------+           +-------+-------+
|               |           |       |       |
|      2x2      |           |  1x1  |  1x1  |
|               |           +-------+-------+
+-------+-------+           |       |       |
                            |  1x1  |  1x1  |
                            +-------+-------+
```

---

## Usage Examples

### Basic Grid

```tsx
const items: BentoItemData[] = [
  { id: '1', size: '2x2', children: <MainFeature /> },
  { id: '2', size: '1x1', children: <StatCard /> },
  { id: '3', size: '1x1', children: <StatCard /> },
  { id: '4', size: '2x1', children: <ChartCard /> },
  { id: '5', size: '1x2', children: <ListCard /> },
  { id: '6', size: '1x1', children: <QuickAction /> },
];

<BentoGrid items={items} columns={4} gap="md" />
```

### Dashboard Layout

```tsx
const dashboardItems: BentoItemData[] = [
  {
    id: 'overview',
    size: '2x2',
    children: (
      <BentoCard
        title="System Overview"
        subtitle="Real-time monitoring"
        icon={<MonitorIcon />}
        accentColor="#3B82F6"
      >
        <SystemStatus />
      </BentoCard>
    ),
  },
  {
    id: 'cpu',
    size: '1x1',
    children: (
      <BentoStat
        label="CPU Usage"
        value="42%"
        change="5%"
        changeType="negative"
        sparkline={[20, 35, 28, 42, 38, 42]}
      />
    ),
  },
  {
    id: 'memory',
    size: '1x1',
    children: (
      <BentoStat
        label="Memory"
        value="8.2GB"
        change="12%"
        changeType="positive"
      />
    ),
  },
  {
    id: 'activity',
    size: '2x1',
    children: <ActivityChart />,
  },
];

<BentoGrid
  items={dashboardItems}
  columns={4}
  gap="lg"
  animate={true}
  animationDelay={150}
/>
```

### Custom Styling

```tsx
const styledItems: BentoItemData[] = [
  {
    id: 'hero',
    size: '2x1',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderColor: 'rgba(102, 126, 234, 0.3)',
    glowColor: 'rgba(102, 126, 234, 0.15)',
    children: <HeroContent />,
  },
  {
    id: 'static',
    size: '1x1',
    disableTilt: true,
    disableHover: true,
    children: <StaticContent />,
  },
];

<BentoGrid items={styledItems} columns={3} />
```

### Feature Showcase

```tsx
<BentoGrid
  items={[
    {
      id: 'feature-1',
      size: '1x1',
      children: (
        <BentoFeature
          title="Lightning Fast"
          description="Optimized for performance with lazy loading and code splitting."
          icon={<ZapIcon />}
          gradientFrom="#F59E0B"
          gradientTo="#D97706"
        />
      ),
    },
    {
      id: 'feature-2',
      size: '1x1',
      children: (
        <BentoFeature
          title="Secure by Default"
          description="Built-in security features protect your data."
          icon={<ShieldIcon />}
          gradientFrom="#10B981"
          gradientTo="#059669"
        />
      ),
    },
  ]}
  columns={2}
  gap="lg"
/>
```

### Image Gallery

```tsx
const galleryItems: BentoItemData[] = [
  {
    id: 'main-image',
    size: '2x2',
    children: (
      <BentoImage
        src="/images/hero.jpg"
        alt="Hero image"
        objectFit="cover"
        overlay={
          <div className="text-white">
            <h2>Featured Project</h2>
            <p>Description text</p>
          </div>
        }
      />
    ),
  },
  {
    id: 'thumb-1',
    size: '1x1',
    children: <BentoImage src="/images/thumb1.jpg" />,
  },
  {
    id: 'thumb-2',
    size: '1x1',
    children: <BentoImage src="/images/thumb2.jpg" />,
  },
];

<BentoGrid items={galleryItems} columns={3} gap="sm" />
```

---

## Animations & Effects

### Entrance Animation

Items animate in with staggered timing:

```
Timeline:
0ms    → Item 1 visible
100ms  → Item 2 visible
200ms  → Item 3 visible
...

Animation properties:
- opacity: 0 → 1
- translateY: 8px → 0
- scale: 0.95 → 1
- duration: 500ms
- easing: ease-out
```

### 3D Tilt Effect

On hover, items respond to mouse position with perspective transforms:

```typescript
// Rotation calculation (max 8 degrees)
const rotateX = ((mouseY - centerY) / centerY) * -8;
const rotateY = ((mouseX - centerX) / centerX) * 8;

// Applied transform
transform: perspective(1000px)
           rotateX(${rotateX}deg)
           rotateY(${rotateY}deg)
           scale3d(1.02, 1.02, 1.02)
```

### Hover Glow

A radial gradient follows the cursor:

```css
background: radial-gradient(
  circle at ${mouseX}% ${mouseY}%,
  rgba(255, 255, 255, 0.06) 0%,
  transparent 60%
);
```

### Shadow Transitions

| State | Light Mode | Dark Mode |
|-------|------------|-----------|
| Default | `0 4px 12px rgba(0,0,0,0.04)` | `0 4px 12px rgba(0,0,0,0.2)` |
| Hover | `0 20px 40px rgba(0,0,0,0.1)` | `0 20px 40px rgba(0,0,0,0.4)` |

---

## Pre-built Card Variants

### BentoCard

Generic card with header (icon, title, subtitle) and content area.

```tsx
<BentoCard
  title="Card Title"
  subtitle="Optional subtitle"
  icon={<Icon />}
  accentColor="#3B82F6"
>
  {/* Content */}
</BentoCard>
```

### BentoStat

Statistics display with value, change indicator, and sparkline.

```tsx
<BentoStat
  label="Revenue"
  value="$12.4k"
  change="23%"
  changeType="positive"  // 'positive' | 'negative' | 'neutral'
  icon={<DollarIcon />}
  sparkline={[10, 15, 12, 18, 22, 20, 24]}
/>
```

### BentoImage

Image with loading skeleton and optional overlay.

```tsx
<BentoImage
  src="/path/to/image.jpg"
  alt="Description"
  objectFit="cover"  // 'cover' | 'contain' | 'fill'
  overlay={<OverlayContent />}
/>
```

### BentoFeature

Feature highlight with gradient background.

```tsx
<BentoFeature
  title="Feature Name"
  description="Feature description text"
  icon={<FeatureIcon />}
  gradientFrom="#667eea"
  gradientTo="#764ba2"
/>
```

---

## Best Practices

### Layout Composition

```
DO: Balanced layouts with visual hierarchy
+-------+-------+-------+-------+
|               |       |       |
|      2x2      |  1x1  |  1x1  |
|               +-------+-------+
|               |       2x1     |
+-------+-------+---------------+


DON'T: Unbalanced or chaotic layouts
+-------+-------+-------+-------+
|  1x1  |               |       |
+-------+      2x2      |  1x2  |
|  1x1  |               |       |
+-------+-------+-------+-------+
```

### Content Guidelines

1. **Primary Content (2x2)**
   - Main dashboards
   - Hero sections
   - Featured items
   - Charts/graphs

2. **Secondary Content (2x1)**
   - Horizontal lists
   - Progress bars
   - Activity feeds
   - Navigation cards

3. **Vertical Content (1x2)**
   - Vertical lists
   - Timelines
   - Side panels
   - Tall images

4. **Atomic Content (1x1)**
   - Stats/KPIs
   - Quick actions
   - Status indicators
   - Thumbnails

### Performance Tips

```tsx
// Disable animations for large grids
<BentoGrid items={manyItems} animate={false} />

// Disable tilt for static content
{ id: 'static', disableTilt: true, disableHover: true }

// Increase animation delay for smoother loading
<BentoGrid animationDelay={200} />
```

### Accessibility

- Use semantic HTML inside BentoCard children
- Ensure sufficient color contrast
- Add proper alt text to BentoImage
- Consider reduced-motion preferences:

```tsx
// In your component
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

<BentoGrid animate={!prefersReducedMotion} />
```

---

## Theme Integration

The component automatically adapts to light/dark themes via `useTheme()`:

| Property | Light Mode | Dark Mode |
|----------|------------|-----------|
| Background | `rgba(255,255,255,0.9)` | `rgba(26,26,26,0.9)` |
| Border | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.08)` |
| Glow | `rgba(0,0,0,0.03)` | `rgba(255,255,255,0.06)` |
| Shine | `rgba(255,255,255,0.4)` | `rgba(255,255,255,0.05)` |
| Text (primary) | `text-gray-900` | `text-white` |
| Text (secondary) | `text-gray-500` | `text-gray-400` |

---

## Common Patterns

### Dashboard Grid

```
+---------------+-------+-------+
|               |  CPU  |  MEM  |
|    OVERVIEW   +-------+-------+
|               |    ACTIVITY   |
+-------+-------+---------------+
| QUICK | QUICK |               |
| ACTION| ACTION|     LOGS      |
+-------+-------+---------------+
```

### Marketing Page

```
+---------------+---------------+
|                               |
|           HERO 2x2            |
|                               |
+-------+-------+-------+-------+
| FEAT  | FEAT  | FEAT  | FEAT  |
| 1x1   | 1x1   | 1x1   | 1x1   |
+-------+-------+-------+-------+
```

### Portfolio Grid

```
+---------------+-------+
|               |       |
|   FEATURED    |  1x1  |
|     2x2       +-------+
|               |       |
+-------+-------+  1x2  |
|     2x1       |       |
+---------------+-------+
```

---

## File Location

```
C:/Users/BIURODOM/Desktop/ClaudeHYDRA/
  hydra-launcher/
    src/
      components/
        layout/
          BentoGrid.tsx    <-- Component source
```

---

## Version History

| Version | Changes |
|---------|---------|
| 1.0.0 | Initial release with BentoGrid, BentoItem |
| 1.1.0 | Added BentoCard, BentoStat variants |
| 1.2.0 | Added BentoImage, BentoFeature |
| 1.3.0 | Theme integration, responsive improvements |

---

> **HYDRA 10.6.1** - BentoGrid Layout Component Documentation
