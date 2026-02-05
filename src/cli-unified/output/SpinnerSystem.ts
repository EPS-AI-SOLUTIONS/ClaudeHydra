/**
 * Unified Spinner System
 * Based on src/cli/Spinner.js with all 25+ spinner types
 * @module cli-unified/output/SpinnerSystem
 */

import ora from 'ora';
import { themeRegistry } from '../core/ThemeRegistry.js';

/**
 * Modern Unicode spinner types with animation frames
 */
export const SpinnerTypes = {
  dots: { interval: 80, frames: ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'] },
  dots2: { interval: 80, frames: ['\u28fe', '\u28fd', '\u28fb', '\u28bf', '\u287f', '\u28df', '\u28ef', '\u28f7'] },
  dots3: { interval: 80, frames: ['\u2801', '\u2802', '\u2804', '\u2840', '\u2880', '\u2820', '\u2810', '\u2808'] },
  line: { interval: 130, frames: ['\u2500', '\\', '\u2502', '/'] },
  line2: { interval: 100, frames: ['\u2550', '\u2572', '\u2551', '\u2571'] },
  circle: { interval: 120, frames: ['\u25d0', '\u25d3', '\u25d1', '\u25d2'] },
  circle2: { interval: 100, frames: ['\u25f4', '\u25f7', '\u25f6', '\u25f5'] },
  circle3: { interval: 80, frames: ['\u25dc', '\u25e0', '\u25dd', '\u25de', '\u25e1', '\u25df'] },
  square: { interval: 100, frames: ['\u25f0', '\u25f3', '\u25f2', '\u25f1'] },
  square2: { interval: 100, frames: ['\u2596', '\u2598', '\u259d', '\u2597'] },
  square3: { interval: 80, frames: ['\u2581', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588', '\u2587', '\u2586', '\u2585', '\u2584', '\u2583'] },
  bounce: { interval: 120, frames: ['\u2801', '\u2802', '\u2804', '\u2802'] },
  bounce2: { interval: 100, frames: ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[ ===]', '[  ==]', '[   =]', '[    ]'] },
  pulse: { interval: 100, frames: ['\u2588', '\u2593', '\u2592', '\u2591', '\u2592', '\u2593'] },
  pulse2: { interval: 100, frames: ['\u2665', '\u2661', '\u2665', '\u2661', '\ud83d\udc93'] },
  wave: { interval: 100, frames: ['\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588\u2587\u2586\u2585\u2584\u2583\u2582\u2581', '\u2582\u2583\u2584\u2585\u2586\u2587\u2588\u2587\u2586\u2585\u2584\u2583\u2582\u2581\u2581', '\u2583\u2584\u2585\u2586\u2587\u2588\u2587\u2586\u2585\u2584\u2583\u2582\u2581\u2581\u2582', '\u2584\u2585\u2586\u2587\u2588\u2587\u2586\u2585\u2584\u2583\u2582\u2581\u2581\u2582\u2583'] },
  wave2: { interval: 80, frames: ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588', '\u2587', '\u2586', '\u2585', '\u2584', '\u2583', '\u2582'] },
  arrow: { interval: 100, frames: ['\u2190', '\u2196', '\u2191', '\u2197', '\u2192', '\u2198', '\u2193', '\u2199'] },
  arrow2: { interval: 80, frames: ['\u21d0', '\u21d6', '\u21d1', '\u21d7', '\u21d2', '\u21d8', '\u21d3', '\u21d9'] },
  arrow3: { interval: 100, frames: ['\u25b9\u25b9\u25b9\u25b9\u25b9', '\u25b8\u25b9\u25b9\u25b9\u25b9', '\u25b9\u25b8\u25b9\u25b9\u25b9', '\u25b9\u25b9\u25b8\u25b9\u25b9', '\u25b9\u25b9\u25b9\u25b8\u25b9', '\u25b9\u25b9\u25b9\u25b9\u25b8'] },
  clock: { interval: 100, frames: ['\ud83d\udd50', '\ud83d\udd51', '\ud83d\udd52', '\ud83d\udd53', '\ud83d\udd54', '\ud83d\udd55', '\ud83d\udd56', '\ud83d\udd57', '\ud83d\udd58', '\ud83d\udd59', '\ud83d\udd5a', '\ud83d\udd5b'] },
  moon: { interval: 80, frames: ['\ud83c\udf11', '\ud83c\udf12', '\ud83c\udf13', '\ud83c\udf14', '\ud83c\udf15', '\ud83c\udf16', '\ud83c\udf17', '\ud83c\udf18'] },
  earth: { interval: 180, frames: ['\ud83c\udf0d', '\ud83c\udf0e', '\ud83c\udf0f'] },
  toggle: { interval: 250, frames: ['\u22b6', '\u22b7'] },
  toggle2: { interval: 80, frames: ['\u25ab', '\u25aa'] },
  boxBounce: { interval: 120, frames: ['\u2596', '\u2598', '\u259d', '\u2597'] },
  boxBounce2: { interval: 100, frames: ['\u258c', '\u2580', '\u2590', '\u2584'] },
  triangle: { interval: 50, frames: ['\u25e2', '\u25e3', '\u25e4', '\u25e5'] },
  binary: { interval: 80, frames: ['010010', '001100', '100101', '111010', '101011', '011100'] },
  aesthetic: { interval: 80, frames: ['\u25b0\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1', '\u25b0\u25b0\u25b1\u25b1\u25b1\u25b1\u25b1', '\u25b0\u25b0\u25b0\u25b1\u25b1\u25b1\u25b1', '\u25b0\u25b0\u25b0\u25b0\u25b1\u25b1\u25b1', '\u25b0\u25b0\u25b0\u25b0\u25b0\u25b1\u25b1', '\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b1', '\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0'] },
  star: { interval: 70, frames: ['\u2736', '\u2738', '\u2739', '\u273a', '\u2739', '\u2737'] },
  growVertical: { interval: 120, frames: ['\u2581', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2586', '\u2585', '\u2584', '\u2583'] },
  growHorizontal: { interval: 120, frames: ['\u258f', '\u258e', '\u258d', '\u258c', '\u258b', '\u258a', '\u2589', '\u258a', '\u258b', '\u258c', '\u258d', '\u258e'] },
  noise: { interval: 100, frames: ['\u2593', '\u2592', '\u2591'] },
  point: { interval: 125, frames: ['\u2219\u2219\u2219', '\u25cf\u2219\u2219', '\u2219\u25cf\u2219', '\u2219\u2219\u25cf', '\u2219\u2219\u2219'] },
  simpleDots: { interval: 400, frames: ['.  ', '.. ', '...', '   '] },
  hydra: { interval: 100, frames: ['\ud83d\udc0d      ', ' \ud83d\udc0d     ', '  \ud83d\udc0d    ', '\ud83d\udc0d\ud83d\udc0d\ud83d\udc0d  ', '  \ud83d\udc0d    ', ' \ud83d\udc0d     ', '\ud83d\udc0d      '] },
  classic: { interval: 80, frames: ['|', '/', '-', '\\'] },
  witcher: { interval: 100, frames: ['\u2694', '\ud83d\udee1', '\u2728', '\ud83d\udd25'] },
  cyber: { interval: 80, frames: ['\u2588\u2591\u2591', '\u2591\u2588\u2591', '\u2591\u2591\u2588'] }
};

export function getSpinnerType(type) {
  return SpinnerTypes[type] || SpinnerTypes.dots;
}

export function getAvailableSpinnerTypes() {
  return Object.keys(SpinnerTypes);
}

/**
 * Spinner wrapper for ora with theme integration
 */
export class Spinner {
  #ora;
  #theme;
  #active = false;
  #type;

  constructor(options = {}) {
    this.#theme = options.theme || themeRegistry.getCurrent();
    this.#type = options.type || this.#theme.spinnerType || 'dots';

    let spinnerConfig;
    if (options.frames) {
      spinnerConfig = { interval: options.interval || 80, frames: options.frames };
    } else if (SpinnerTypes[this.#type]) {
      spinnerConfig = SpinnerTypes[this.#type];
    } else if (this.#theme.spinner) {
      spinnerConfig = { interval: options.interval || 80, frames: this.#theme.spinner };
    } else {
      spinnerConfig = SpinnerTypes.dots;
    }

    this.#ora = ora({
      text: options.text || '',
      color: options.color || 'cyan',
      spinner: spinnerConfig
    });
  }

  start(text) {
    if (text) this.#ora.text = text;
    this.#ora.start();
    this.#active = true;
    return this;
  }

  stop() {
    this.#ora.stop();
    this.#active = false;
    return this;
  }

  succeed(text) {
    this.#ora.succeed(text);
    this.#active = false;
    return this;
  }

  fail(text) {
    this.#ora.fail(text);
    this.#active = false;
    return this;
  }

  warn(text) {
    this.#ora.warn(text);
    this.#active = false;
    return this;
  }

  info(text) {
    this.#ora.info(text);
    this.#active = false;
    return this;
  }

  text(text) {
    this.#ora.text = text;
    return this;
  }

  color(color) {
    this.#ora.color = color;
    return this;
  }

  get isSpinning() {
    return this.#active;
  }

  clear() {
    this.#ora.clear();
    return this;
  }

  render() {
    this.#ora.render();
    return this;
  }

  setType(type) {
    if (SpinnerTypes[type]) {
      this.#type = type;
      this.#ora.spinner = SpinnerTypes[type];
    }
    return this;
  }

  get type() {
    return this.#type;
  }

  setFrames(frames, interval = 80) {
    this.#ora.spinner = { frames, interval };
    return this;
  }

  prefixText(prefix) {
    this.#ora.prefixText = prefix;
    return this;
  }

  suffixText(suffix) {
    this.#ora.suffixText = suffix;
    return this;
  }
}

/**
 * Progress bar indicator
 */
export class ProgressBar {
  #current = 0;
  #total = 100;
  #width = 30;
  #label = '';
  #theme;

  constructor(options = {}) {
    this.#total = options.total || 100;
    this.#width = options.width || 30;
    this.#label = options.label || '';
    this.#theme = options.theme || themeRegistry.getCurrent();
  }

  update(value, label) {
    this.#current = Math.min(value, this.#total);
    if (label !== undefined) this.#label = label;
    this.#render();
    return this;
  }

  increment(amount = 1) {
    return this.update(this.#current + amount);
  }

  complete(label) {
    return this.update(this.#total, label || 'Complete');
  }

  #render() {
    const percent = this.#current / this.#total;
    const filled = Math.round(this.#width * percent);
    const empty = this.#width - filled;

    const bar = this.#theme.colors.primary('[') +
      this.#theme.colors.success('='.repeat(filled)) +
      this.#theme.colors.dim('-'.repeat(empty)) +
      this.#theme.colors.primary(']');

    const percentStr = this.#theme.colors.highlight(`${Math.round(percent * 100)}%`.padStart(4));
    const label = this.#label ? ` ${this.#theme.colors.dim(this.#label)}` : '';

    process.stdout.write(`\r\x1b[K${bar} ${percentStr}${label}`);
  }

  finish() {
    console.log();
  }

  get current() { return this.#current; }
  get total() { return this.#total; }
  get percent() { return this.#current / this.#total; }
}

/**
 * Multi-spinner manager
 */
export class MultiSpinner {
  #spinners = new Map();

  add(id, options = {}) {
    const spinner = new Spinner(options);
    this.#spinners.set(id, spinner);
    return spinner;
  }

  get(id) {
    return this.#spinners.get(id);
  }

  remove(id) {
    const spinner = this.#spinners.get(id);
    if (spinner) {
      spinner.stop();
      this.#spinners.delete(id);
      return true;
    }
    return false;
  }

  startAll() {
    for (const spinner of this.#spinners.values()) spinner.start();
    return this;
  }

  stopAll() {
    for (const spinner of this.#spinners.values()) spinner.stop();
    return this;
  }

  succeedAll(text) {
    for (const spinner of this.#spinners.values()) spinner.succeed(text);
    return this;
  }

  failAll(text) {
    for (const spinner of this.#spinners.values()) spinner.fail(text);
    return this;
  }

  get activeCount() {
    let count = 0;
    for (const spinner of this.#spinners.values()) {
      if (spinner.isSpinning) count++;
    }
    return count;
  }

  get ids() {
    return Array.from(this.#spinners.keys());
  }
}

/**
 * Animated text effects
 */
export class AnimatedText {
  static async typewriter(text, speed = 50) {
    for (const char of text) {
      process.stdout.write(char);
      await new Promise(resolve => setTimeout(resolve, speed));
    }
    process.stdout.write('\n');
  }

  static async rainbow(text, cycles = 1) {
    const colors = ['\x1b[31m', '\x1b[33m', '\x1b[32m', '\x1b[36m', '\x1b[34m', '\x1b[35m'];
    for (let cycle = 0; cycle < cycles; cycle++) {
      for (let i = 0; i < colors.length; i++) {
        process.stdout.write('\r' + colors[i] + text + '\x1b[0m');
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
    process.stdout.write('\n');
  }

  static async pulse(text, duration = 2000) {
    const intensities = ['\x1b[2m', '\x1b[0m', '\x1b[1m', '\x1b[0m'];
    const start = Date.now();
    let i = 0;
    while (Date.now() - start < duration) {
      process.stdout.write('\r' + intensities[i % intensities.length] + text + '\x1b[0m');
      await new Promise(resolve => setTimeout(resolve, 200));
      i++;
    }
    process.stdout.write('\r' + text + '\n');
  }

  static async slideIn(text, width = 40) {
    for (let i = width; i >= 0; i--) {
      process.stdout.write('\r' + ' '.repeat(i) + text + ' '.repeat(Math.max(0, width - i - text.length)));
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    process.stdout.write('\n');
  }
}

// Factory functions
export function createSpinner(textOrOptions) {
  if (typeof textOrOptions === 'string') {
    return new Spinner({ text: textOrOptions });
  }
  return new Spinner(textOrOptions);
}

export function createTypedSpinner(type, text) {
  return new Spinner({ type, text });
}

export function createProgressBar(options) {
  return new ProgressBar(options);
}

export function createMultiSpinner() {
  return new MultiSpinner();
}

export default Spinner;
