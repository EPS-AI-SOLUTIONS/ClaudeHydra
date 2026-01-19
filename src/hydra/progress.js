/**
 * HYDRA Progress Module
 * Animated progress bars, spinners, and splash screens
 */

import { createStyler, ANSI, PROGRESS } from './colors.js';

/**
 * Spinner animation
 */
export class Spinner {
  constructor(options = {}) {
    this.frames = options.frames || PROGRESS.spinner;
    this.interval = options.interval || 80;
    this.text = options.text || '';
    this.colorized = options.colorized !== false;
    this.styler = createStyler(this.colorized);
    this.stream = options.stream || process.stdout;
    this.frameIndex = 0;
    this.timer = null;
    this.isSpinning = false;
  }

  start(text) {
    if (this.isSpinning) return this;
    if (text) this.text = text;

    this.isSpinning = true;
    this.stream.write(ANSI.cursorHide);

    this.timer = setInterval(() => {
      this.render();
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, this.interval);

    return this;
  }

  render() {
    const frame = this.frames[this.frameIndex];
    const c = this.styler.c;
    this.stream.write(
      `${ANSI.clearLine}\r${c.cyan}${frame}${c.reset} ${this.text}`
    );
  }

  update(text) {
    this.text = text;
    return this;
  }

  succeed(text) {
    return this.stop(text, this.styler.ok());
  }

  fail(text) {
    return this.stop(text, this.styler.fail());
  }

  warn(text) {
    return this.stop(text, this.styler.warn());
  }

  stop(text, symbol = '') {
    if (!this.isSpinning) return this;

    clearInterval(this.timer);
    this.timer = null;
    this.isSpinning = false;

    const finalText = text || this.text;
    this.stream.write(
      `${ANSI.clearLine}\r${symbol} ${finalText}\n${ANSI.cursorShow}`
    );

    return this;
  }
}

/**
 * Progress bar
 */
export class ProgressBar {
  constructor(options = {}) {
    this.total = options.total || 100;
    this.current = 0;
    this.width = options.width || 40;
    this.complete = options.complete || PROGRESS.full;
    this.incomplete = options.incomplete || PROGRESS.empty;
    this.colorized = options.colorized !== false;
    this.styler = createStyler(this.colorized);
    this.stream = options.stream || process.stdout;
    this.format = options.format || '{bar} {percent}% | {current}/{total} | {eta}';
    this.startTime = null;
    this.lastRender = 0;
    this.renderThrottle = options.renderThrottle || 16; // ~60fps
  }

  start(total) {
    if (total) this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.stream.write(ANSI.cursorHide);
    this.render();
    return this;
  }

  update(current, tokens = {}) {
    this.current = Math.min(current, this.total);

    // Throttle rendering
    const now = Date.now();
    if (now - this.lastRender < this.renderThrottle && this.current < this.total) {
      return this;
    }
    this.lastRender = now;

    this.render(tokens);
    return this;
  }

  increment(delta = 1, tokens = {}) {
    return this.update(this.current + delta, tokens);
  }

  render(tokens = {}) {
    const percent = Math.round((this.current / this.total) * 100);
    const filled = Math.round((this.current / this.total) * this.width);
    const empty = this.width - filled;

    const c = this.styler.c;
    const bar =
      c.green +
      this.complete.repeat(filled) +
      c.dim +
      this.incomplete.repeat(empty) +
      c.reset;

    // Calculate ETA
    const elapsed = Date.now() - this.startTime;
    const rate = this.current / (elapsed / 1000);
    const remaining = (this.total - this.current) / rate;
    const eta = isFinite(remaining) ? this.formatTime(remaining) : '--:--';

    let output = this.format
      .replace('{bar}', bar)
      .replace('{percent}', percent.toString().padStart(3))
      .replace('{current}', this.current.toString())
      .replace('{total}', this.total.toString())
      .replace('{eta}', eta)
      .replace('{elapsed}', this.formatTime(elapsed / 1000));

    // Custom tokens
    for (const [key, value] of Object.entries(tokens)) {
      output = output.replace(`{${key}}`, value);
    }

    this.stream.write(`${ANSI.clearLine}\r${output}`);
  }

  formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  stop(clear = false) {
    if (clear) {
      this.stream.write(ANSI.clearLine + '\r');
    } else {
      this.stream.write('\n');
    }
    this.stream.write(ANSI.cursorShow);
    return this;
  }
}

/**
 * Multi-step progress tracker
 */
export class StepProgress {
  constructor(steps, options = {}) {
    this.steps = steps.map((s, i) => ({
      name: typeof s === 'string' ? s : s.name,
      status: 'pending',
      duration: null,
      index: i,
    }));
    this.currentStep = -1;
    this.colorized = options.colorized !== false;
    this.styler = createStyler(this.colorized);
    this.stream = options.stream || process.stdout;
    this.startTime = null;
    this.stepStartTime = null;
  }

  start() {
    this.startTime = Date.now();
    this.render();
    return this;
  }

  nextStep() {
    // Complete previous step
    if (this.currentStep >= 0) {
      this.steps[this.currentStep].status = 'done';
      this.steps[this.currentStep].duration = Date.now() - this.stepStartTime;
    }

    this.currentStep++;
    if (this.currentStep < this.steps.length) {
      this.steps[this.currentStep].status = 'running';
      this.stepStartTime = Date.now();
    }

    this.render();
    return this;
  }

  failStep(error) {
    if (this.currentStep >= 0) {
      this.steps[this.currentStep].status = 'failed';
      this.steps[this.currentStep].error = error;
    }
    this.render();
    return this;
  }

  skipStep() {
    if (this.currentStep >= 0) {
      this.steps[this.currentStep].status = 'skipped';
    }
    this.render();
    return this;
  }

  render() {
    const c = this.styler.c;

    // Clear previous output
    if (this.currentStep > 0) {
      this.stream.write(ANSI.cursorUp(this.steps.length + 1));
    }

    // Render each step
    for (const step of this.steps) {
      let icon, color;
      switch (step.status) {
        case 'done':
          icon = '✓';
          color = c.green;
          break;
        case 'running':
          icon = '●';
          color = c.cyan;
          break;
        case 'failed':
          icon = '✗';
          color = c.red;
          break;
        case 'skipped':
          icon = '○';
          color = c.dim;
          break;
        default:
          icon = '○';
          color = c.dim;
      }

      const duration = step.duration ? ` ${c.dim}(${step.duration}ms)${c.reset}` : '';
      this.stream.write(
        `${ANSI.clearLine}  ${color}${icon}${c.reset} ${step.name}${duration}\n`
      );
    }

    // Total time
    const total = Date.now() - this.startTime;
    this.stream.write(
      `${ANSI.clearLine}${c.dim}  Total: ${total}ms${c.reset}\n`
    );

    return this;
  }

  finish() {
    // Mark remaining steps
    if (this.currentStep >= 0 && this.currentStep < this.steps.length) {
      this.steps[this.currentStep].status = 'done';
      this.steps[this.currentStep].duration = Date.now() - this.stepStartTime;
    }
    this.render();

    return {
      totalTime: Date.now() - this.startTime,
      steps: this.steps,
    };
  }
}

/**
 * Animated splash screen
 */
export class SplashScreen {
  constructor(options = {}) {
    this.colorized = options.colorized !== false;
    this.styler = createStyler(this.colorized);
    this.stream = options.stream || process.stdout;
    this.steps = [];
    this.progress = null;
  }

  show(banner) {
    this.stream.write(ANSI.clearScreen);
    this.stream.write(ANSI.cursorPosition(1, 1));
    console.log(banner);
    return this;
  }

  addStep(name) {
    this.steps.push(name);
    return this;
  }

  async runSteps(stepRunner) {
    this.progress = new StepProgress(this.steps, {
      colorized: this.colorized,
      stream: this.stream,
    });

    this.progress.start();

    for (let i = 0; i < this.steps.length; i++) {
      this.progress.nextStep();

      try {
        await stepRunner(this.steps[i], i);
      } catch (error) {
        this.progress.failStep(error.message);
        throw error;
      }
    }

    return this.progress.finish();
  }
}

/**
 * Create a simple spinner
 */
export function createSpinner(text, options = {}) {
  return new Spinner({ ...options, text });
}

/**
 * Create a progress bar
 */
export function createProgressBar(total, options = {}) {
  return new ProgressBar({ ...options, total });
}
