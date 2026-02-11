#!/usr/bin/env node
/**
 * Borders Demo - Showcases all Unicode box-drawing styles
 * Run: node examples/borders-demo.js
 */

import chalk from 'chalk';
import { createBorderRenderer, quickBox, quickPanel } from '../src/cli/Borders.js';

// Demo all border styles
console.log(chalk.bold.cyan('\n=== Unicode Box-Drawing Styles Demo ===\n'));

const styles = ['single', 'double', 'rounded', 'bold', 'dashed', 'dotted', 'ascii'];
const sampleContent = 'Hello, World!';

// Show each style
for (const style of styles) {
  const renderer = createBorderRenderer(style, { color: chalk.cyan });
  console.log(chalk.yellow(`\n${style.toUpperCase()} style:`));
  renderer.printBox(sampleContent, { title: `${style} Box` });
}

// Demo panels with icons
console.log(chalk.bold.cyan('\n=== Themed Panels ===\n'));

const renderer = createBorderRenderer('rounded', { color: chalk.gray });

console.log(chalk.green('Info Panel:'));
renderer.print(
  renderer.infoPanel('This is an informational message.\nIt can have multiple lines.'),
);

console.log(chalk.green('\nSuccess Panel:'));
renderer.print(renderer.successPanel('Operation completed successfully!'));

console.log(chalk.yellow('\nWarning Panel:'));
renderer.print(renderer.warningPanel('Please review the configuration.'));

console.log(chalk.red('\nError Panel:'));
renderer.print(renderer.errorPanel('Connection failed. Please check your network.'));

// Demo sections
console.log(chalk.bold.cyan('\n=== Section Headers ===\n'));

const boldRenderer = createBorderRenderer('bold');

console.log(boldRenderer.sectionHeader('Left Aligned Section', { width: 60, position: 'left' }));
console.log(
  boldRenderer.sectionHeader('Center Aligned Section', { width: 60, position: 'center' }),
);
console.log(boldRenderer.sectionHeader('Right Aligned Section', { width: 60, position: 'right' }));

// Demo side by side boxes
console.log(chalk.bold.cyan('\n=== Side-by-Side Layout ===\n'));

const sideRenderer = createBorderRenderer('single');
const sideBySide = sideRenderer.sideBySide(
  [
    { content: 'Box 1\nLeft column', title: 'First', width: 25 },
    { content: 'Box 2\nMiddle column', title: 'Second', width: 25 },
    { content: 'Box 3\nRight column', title: 'Third', width: 25 },
  ],
  { gap: 2 },
);
sideRenderer.print(sideBySide);

// Demo grid layout
console.log(chalk.bold.cyan('\n=== Grid Layout ===\n'));

const gridRenderer = createBorderRenderer('rounded');
const grid = gridRenderer.grid(
  [
    { content: 'Item 1', title: 'A' },
    { content: 'Item 2', title: 'B' },
    { content: 'Item 3', title: 'C' },
    { content: 'Item 4', title: 'D' },
  ],
  { columns: 2, gap: 2 },
);
gridRenderer.print(grid);

// Demo table
console.log(chalk.bold.cyan('\n=== Table with Borders ===\n'));

const tableRenderer = createBorderRenderer('single');
const colWidths = [15, 10, 20];

console.log(tableRenderer.tableDivider(colWidths, 'top'));
console.log(
  tableRenderer.tableRow(['Name', 'Age', 'City'], colWidths, {
    cellColor: chalk.bold,
  }),
);
console.log(tableRenderer.tableDivider(colWidths, 'middle'));
console.log(tableRenderer.tableRow(['Alice', '28', 'New York'], colWidths));
console.log(tableRenderer.tableRow(['Bob', '35', 'Los Angeles'], colWidths));
console.log(tableRenderer.tableRow(['Charlie', '42', 'Chicago'], colWidths));
console.log(tableRenderer.tableDivider(colWidths, 'bottom'));

// Demo callout and quote
console.log(chalk.bold.cyan('\n=== Decorative Elements ===\n'));

const decoRenderer = createBorderRenderer('rounded');

console.log(chalk.yellow('Callout:'));
decoRenderer.print(
  decoRenderer.callout(
    '\u2139',
    'This is an important callout!\nPay attention to this information.',
  ),
);

console.log(chalk.yellow('\nQuote:'));
decoRenderer.print(
  decoRenderer.quote(
    'The best time to plant a tree was 20 years ago.\nThe second best time is now.',
    'Chinese Proverb',
  ),
);

// Demo banner
console.log(chalk.bold.cyan('\n=== Banner ===\n'));

const bannerRenderer = createBorderRenderer('double', { color: chalk.magenta });
bannerRenderer.print(bannerRenderer.banner('HYDRA CLI', { color: chalk.bold.magenta }));

// Quick functions demo
console.log(chalk.bold.cyan('\n=== Quick Functions ===\n'));

console.log('quickBox():');
const quick1 = quickBox('Simple box with quickBox()', { style: 'rounded' });
console.log(quick1.join('\n'));

console.log('\nquickPanel():');
const quick2 = quickPanel('Quick Panel', 'Created with quickPanel() helper', { style: 'bold' });
console.log(quick2.join('\n'));

console.log(chalk.bold.green('\n=== Demo Complete! ===\n'));
