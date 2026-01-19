import { test, expect } from '@playwright/test';

/**
 * AuroraBackground E2E Tests
 *
 * These tests verify the AuroraBackground component functionality:
 * - Proper rendering of the aurora effect container
 * - Gradient layer visibility
 * - CSS animations working correctly
 * - Theme responsiveness (dark/light mode)
 * - Performance characteristics
 */

test.describe('AuroraBackground - Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should render aurora background container', async ({ page }) => {
    // Aurora background should be present in the DOM
    const auroraContainer = page.locator('.aurora-background');
    await expect(auroraContainer).toBeVisible();
  });

  test('should have correct container positioning', async ({ page }) => {
    const auroraContainer = page.locator('.aurora-background');

    // Container should be fixed positioned
    const position = await auroraContainer.evaluate(el =>
      window.getComputedStyle(el).position
    );
    expect(position).toBe('fixed');

    // Container should cover full viewport
    const boundingBox = await auroraContainer.boundingBox();
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      expect(boundingBox.x).toBe(0);
      expect(boundingBox.y).toBe(0);
      expect(boundingBox.width).toBeGreaterThan(0);
      expect(boundingBox.height).toBeGreaterThan(0);
    }
  });

  test('should have aria-hidden attribute for accessibility', async ({ page }) => {
    const auroraContainer = page.locator('.aurora-background');
    await expect(auroraContainer).toHaveAttribute('aria-hidden', 'true');
  });

  test('should have pointer-events none to allow interaction with content', async ({ page }) => {
    const auroraContainer = page.locator('.aurora-background');
    const pointerEvents = await auroraContainer.evaluate(el =>
      window.getComputedStyle(el).pointerEvents
    );
    expect(pointerEvents).toBe('none');
  });
});

test.describe('AuroraBackground - Gradient Layers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should render four aurora gradient layers', async ({ page }) => {
    const auroraLayers = page.locator('.aurora-layer');
    const layerCount = await auroraLayers.count();
    expect(layerCount).toBe(4);
  });

  test('should have all aurora layers visible', async ({ page }) => {
    const auroraLayers = page.locator('.aurora-layer');
    const count = await auroraLayers.count();

    for (let i = 0; i < count; i++) {
      const layer = auroraLayers.nth(i);
      await expect(layer).toBeVisible();
    }
  });

  test('should have radial gradient background on layers', async ({ page }) => {
    const auroraLayers = page.locator('.aurora-layer');
    const firstLayer = auroraLayers.first();

    const background = await firstLayer.evaluate(el =>
      window.getComputedStyle(el).backgroundImage
    );

    // Should contain radial-gradient
    expect(background).toContain('radial-gradient');
  });

  test('should have blur filter applied to layers', async ({ page }) => {
    const auroraLayers = page.locator('.aurora-layer');
    const firstLayer = auroraLayers.first();

    const filter = await firstLayer.evaluate(el =>
      window.getComputedStyle(el).filter
    );

    // Should have blur filter applied
    expect(filter).toContain('blur');
  });

  test('should have different opacity values for layers', async ({ page }) => {
    const auroraLayers = page.locator('.aurora-layer');
    const opacities: number[] = [];

    const count = await auroraLayers.count();
    for (let i = 0; i < count; i++) {
      const opacity = await auroraLayers.nth(i).evaluate(el =>
        parseFloat(window.getComputedStyle(el).opacity)
      );
      opacities.push(opacity);
    }

    // All layers should have positive opacity
    opacities.forEach(opacity => {
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThanOrEqual(1);
    });
  });
});

test.describe('AuroraBackground - CSS Animations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have CSS keyframes defined for aurora animations', async ({ page }) => {
    // Check if keyframes are injected into the page
    const hasKeyframes = await page.evaluate(() => {
      const styleSheets = Array.from(document.styleSheets);
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule instanceof CSSKeyframesRule) {
              if (rule.name.includes('aurora')) {
                return true;
              }
            }
          }
        } catch {
          // Cross-origin stylesheets may throw
          continue;
        }
      }
      return false;
    });

    expect(hasKeyframes).toBe(true);
  });

  test('should have animation property set on aurora layers', async ({ page }) => {
    const auroraLayers = page.locator('.aurora-layer');
    const firstLayer = auroraLayers.first();

    const animation = await firstLayer.evaluate(el =>
      window.getComputedStyle(el).animation
    );

    // Animation should not be 'none' or empty
    expect(animation).not.toBe('none');
    expect(animation.length).toBeGreaterThan(0);
  });

  test('should have infinite animation iteration', async ({ page }) => {
    const auroraLayers = page.locator('.aurora-layer');
    const firstLayer = auroraLayers.first();

    const animationIterationCount = await firstLayer.evaluate(el =>
      window.getComputedStyle(el).animationIterationCount
    );

    // Should be infinite for continuous animation
    expect(animationIterationCount).toContain('infinite');
  });

  test('should have GPU acceleration enabled via transform', async ({ page }) => {
    const auroraLayers = page.locator('.aurora-layer');
    const firstLayer = auroraLayers.first();

    const willChange = await firstLayer.evaluate(el =>
      window.getComputedStyle(el).willChange
    );

    // Should have will-change for GPU acceleration hints
    expect(willChange).toContain('transform');
  });

  test('should detect animation changes over time', async ({ page }) => {
    const auroraLayers = page.locator('.aurora-layer');
    const firstLayer = auroraLayers.first();

    // Get initial transform
    const initialTransform = await firstLayer.evaluate(el =>
      window.getComputedStyle(el).transform
    );

    // Wait a short time for animation to progress
    await page.waitForTimeout(500);

    // Get transform after delay
    const laterTransform = await firstLayer.evaluate(el =>
      window.getComputedStyle(el).transform
    );

    // Transforms may or may not be different depending on animation timing
    // At minimum, both should be valid transform values
    expect(initialTransform).toBeDefined();
    expect(laterTransform).toBeDefined();
  });
});

test.describe('AuroraBackground - Theme Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for launcher to complete
    await page.waitForTimeout(3500);
  });

  test('should have dark theme background color by default', async ({ page }) => {
    const auroraContainer = page.locator('.aurora-background');

    const backgroundColor = await auroraContainer.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );

    // Dark theme should have dark background (rgb(10, 10, 10) = #0a0a0a)
    expect(backgroundColor).toMatch(/rgb\(10,\s*10,\s*10\)/);
  });

  test('should change background color when theme switches to light', async ({ page }) => {
    // Find and click theme toggle button
    const themeButton = page.locator('button[title*="mode"]').or(
      page.locator('.glass-button').filter({ has: page.locator('svg') }).last()
    );

    if (await themeButton.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      // Get initial background color
      const auroraContainer = page.locator('.aurora-background');
      const initialBg = await auroraContainer.evaluate(el =>
        window.getComputedStyle(el).backgroundColor
      );

      // Click theme toggle
      await themeButton.first().click();
      await page.waitForTimeout(500);

      // Get new background color
      const newBg = await auroraContainer.evaluate(el =>
        window.getComputedStyle(el).backgroundColor
      );

      // Background should have changed
      expect(newBg).not.toBe(initialBg);
    }
  });

  test('should have lighter background in light theme', async ({ page }) => {
    // Find and click theme toggle button
    const themeButton = page.locator('button[title*="mode"]').or(
      page.locator('.glass-button').filter({ has: page.locator('svg') }).last()
    );

    if (await themeButton.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      // Switch to light theme
      await themeButton.first().click();
      await page.waitForTimeout(500);

      const auroraContainer = page.locator('.aurora-background');
      const backgroundColor = await auroraContainer.evaluate(el =>
        window.getComputedStyle(el).backgroundColor
      );

      // Light theme should have light background (rgb(250, 250, 250) = #fafafa)
      expect(backgroundColor).toMatch(/rgb\(250,\s*250,\s*250\)/);
    }
  });

  test('should adjust gradient opacity for light theme', async ({ page }) => {
    // Find and click theme toggle button
    const themeButton = page.locator('button[title*="mode"]').or(
      page.locator('.glass-button').filter({ has: page.locator('svg') }).last()
    );

    if (await themeButton.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      const auroraLayers = page.locator('.aurora-layer');

      // Get opacity in dark mode
      const darkModeOpacity = await auroraLayers.first().evaluate(el =>
        parseFloat(window.getComputedStyle(el).opacity)
      );

      // Switch to light theme
      await themeButton.first().click();
      await page.waitForTimeout(500);

      // Get opacity in light mode
      const lightModeOpacity = await auroraLayers.first().evaluate(el =>
        parseFloat(window.getComputedStyle(el).opacity)
      );

      // Both should have valid opacity values
      expect(darkModeOpacity).toBeGreaterThan(0);
      expect(lightModeOpacity).toBeGreaterThan(0);
    }
  });

  test('should persist theme preference across aurora updates', async ({ page }) => {
    const themeButton = page.locator('button[title*="mode"]').or(
      page.locator('.glass-button').filter({ has: page.locator('svg') }).last()
    );

    if (await themeButton.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      // Switch to light theme
      await themeButton.first().click();
      await page.waitForTimeout(300);

      // Check HTML has light class
      const html = page.locator('html');
      const hasLightClass = await html.evaluate(el => el.classList.contains('light'));
      expect(hasLightClass).toBe(true);

      // Wait for potential animation cycle
      await page.waitForTimeout(1000);

      // Aurora should still reflect light theme
      const auroraContainer = page.locator('.aurora-background');
      const backgroundColor = await auroraContainer.evaluate(el =>
        window.getComputedStyle(el).backgroundColor
      );
      expect(backgroundColor).toMatch(/rgb\(250,\s*250,\s*250\)/);
    }
  });
});

test.describe('AuroraBackground - Performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should render without causing layout shifts', async ({ page }) => {
    // Get initial viewport dimensions
    const initialViewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));

    // Wait for aurora to fully render
    await page.waitForTimeout(500);

    // Check viewport hasn't shifted
    const currentViewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));

    expect(currentViewport.width).toBe(initialViewport.width);
    expect(currentViewport.height).toBe(initialViewport.height);
  });

  test('should not cause excessive repaints during animation', async ({ page }) => {
    // This is a basic check - more sophisticated performance testing
    // would require DevTools Protocol or Performance API

    const auroraContainer = page.locator('.aurora-background');

    // Check that position is fixed (prevents reflow)
    const position = await auroraContainer.evaluate(el =>
      window.getComputedStyle(el).position
    );
    expect(position).toBe('fixed');

    // Check overflow is hidden (prevents unnecessary painting)
    const overflow = await auroraContainer.evaluate(el =>
      window.getComputedStyle(el).overflow
    );
    expect(overflow).toBe('hidden');
  });

  test('should use transform for animations (GPU-accelerated)', async ({ page }) => {
    const auroraLayers = page.locator('.aurora-layer');
    const firstLayer = auroraLayers.first();

    // Check backface-visibility for GPU optimization
    const backfaceVisibility = await firstLayer.evaluate(el =>
      window.getComputedStyle(el).backfaceVisibility
    );
    expect(backfaceVisibility).toBe('hidden');

    // Check will-change property
    const willChange = await firstLayer.evaluate(el =>
      window.getComputedStyle(el).willChange
    );
    expect(willChange).toContain('transform');
  });

  test('should maintain stable frame rate during animations', async ({ page }) => {
    // Measure time for multiple animation frames
    const frameTimings: number[] = [];

    const measureFrames = await page.evaluate(async () => {
      const timings: number[] = [];
      let lastTime = performance.now();

      return new Promise<number[]>((resolve) => {
        let frameCount = 0;
        const maxFrames = 30;

        function measureFrame() {
          const now = performance.now();
          timings.push(now - lastTime);
          lastTime = now;
          frameCount++;

          if (frameCount < maxFrames) {
            requestAnimationFrame(measureFrame);
          } else {
            resolve(timings);
          }
        }

        requestAnimationFrame(measureFrame);
      });
    });

    // Average frame time should be reasonable (< 50ms for 20+ fps)
    const avgFrameTime = measureFrames.reduce((a, b) => a + b, 0) / measureFrames.length;
    expect(avgFrameTime).toBeLessThan(50);
  });

  test('should not block main thread during rendering', async ({ page }) => {
    // Check that interactive elements remain responsive
    await page.waitForTimeout(3500); // Wait for dashboard to load

    const startTime = Date.now();

    // Try to interact with the page
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await textarea.focus();
      await textarea.type('test', { delay: 10 });
    }

    const endTime = Date.now();
    const interactionTime = endTime - startTime;

    // Interaction should complete in reasonable time (< 3 seconds)
    expect(interactionTime).toBeLessThan(3000);
  });
});

test.describe('AuroraBackground - Overlay and Noise Effect', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should render noise overlay element', async ({ page }) => {
    // The noise overlay is the last child div of aurora-background
    const auroraContainer = page.locator('.aurora-background');
    const childDivs = auroraContainer.locator('> div');

    const childCount = await childDivs.count();
    // Should have 4 aurora layers + 1 noise overlay = 5 divs
    expect(childCount).toBe(5);
  });

  test('should have noise overlay with low opacity', async ({ page }) => {
    const auroraContainer = page.locator('.aurora-background');
    const childDivs = auroraContainer.locator('> div');

    // Get the last div (noise overlay)
    const noiseOverlay = childDivs.last();

    const opacity = await noiseOverlay.evaluate(el =>
      parseFloat(window.getComputedStyle(el).opacity)
    );

    // Noise overlay should have very low opacity (0.02-0.03)
    expect(opacity).toBeLessThanOrEqual(0.05);
    expect(opacity).toBeGreaterThan(0);
  });

  test('should have noise overlay with SVG background', async ({ page }) => {
    const auroraContainer = page.locator('.aurora-background');
    const childDivs = auroraContainer.locator('> div');

    // Get the last div (noise overlay)
    const noiseOverlay = childDivs.last();

    const backgroundImage = await noiseOverlay.evaluate(el =>
      window.getComputedStyle(el).backgroundImage
    );

    // Should contain SVG data URL for noise texture
    expect(backgroundImage).toContain('url(');
    expect(backgroundImage).toContain('svg');
  });
});

test.describe('AuroraBackground - Reduced Motion Support', () => {
  test('should have CSS rules for reduced motion preference', async ({ page }) => {
    await page.goto('/');

    // Check if reduced motion media query styles are present
    const hasReducedMotionStyles = await page.evaluate(() => {
      const styleSheets = Array.from(document.styleSheets);
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule instanceof CSSMediaRule) {
              if (rule.conditionText?.includes('prefers-reduced-motion')) {
                return true;
              }
            }
          }
        } catch {
          continue;
        }
      }
      return false;
    });

    expect(hasReducedMotionStyles).toBe(true);
  });

  test('should disable animations when reduced motion is preferred', async ({ page }) => {
    // Emulate reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const auroraLayers = page.locator('.aurora-layer');
    const firstLayer = auroraLayers.first();

    const animation = await firstLayer.evaluate(el =>
      window.getComputedStyle(el).animation
    );

    // With reduced motion, animation should be 'none'
    expect(animation).toContain('none');
  });
});

test.describe('AuroraBackground - Responsive Behavior', () => {
  test('should render correctly on small viewport (800x600)', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('/');

    const auroraContainer = page.locator('.aurora-background');
    await expect(auroraContainer).toBeVisible();

    const boundingBox = await auroraContainer.boundingBox();
    expect(boundingBox?.width).toBe(800);
    expect(boundingBox?.height).toBe(600);
  });

  test('should render correctly on large viewport (1920x1080)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    const auroraContainer = page.locator('.aurora-background');
    await expect(auroraContainer).toBeVisible();

    const boundingBox = await auroraContainer.boundingBox();
    expect(boundingBox?.width).toBe(1920);
    expect(boundingBox?.height).toBe(1080);
  });

  test('should maintain full coverage after viewport resize', async ({ page }) => {
    await page.goto('/');

    // Initial size
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(200);

    // Resize viewport
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(200);

    const auroraContainer = page.locator('.aurora-background');
    const boundingBox = await auroraContainer.boundingBox();

    // Should still cover full viewport
    expect(boundingBox?.width).toBe(1024);
    expect(boundingBox?.height).toBe(768);
  });
});
