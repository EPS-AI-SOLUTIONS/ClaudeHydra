#!/usr/bin/env node
/**
 * Table and List Rendering Demo
 * Demonstrates all available styles and features
 */

import { ALIGNMENT, createListRenderer, createTableRenderer } from '../src/cli/TableRenderer.js';
import { bold, cyan, dim, green, yellow } from '../src/logger/colors.js';

// ============================================================================
// Demo Data
// ============================================================================

const users = [
  { id: 1, name: 'Alice Johnson', age: 28, city: 'New York', active: true },
  { id: 2, name: 'Bob Smith', age: 34, city: 'Los Angeles', active: false },
  { id: 3, name: 'Charlie Brown', age: 22, city: 'Chicago', active: true },
  { id: 4, name: 'Diana Prince', age: 30, city: 'Seattle', active: true },
  { id: 5, name: 'Edward Norton', age: 45, city: 'Boston', active: false },
];

const tasks = [
  'Set up development environment',
  'Review pull requests',
  'Write documentation',
  'Run test suite',
  'Deploy to staging',
];

const checklistItems = [
  { text: 'Install dependencies', checked: true },
  { text: 'Configure environment', checked: true },
  { text: 'Write tests', checked: false },
  { text: 'Submit PR', checked: false },
];

const nestedItems = [
  {
    text: 'Frontend',
    children: [{ text: 'React components' }, { text: 'CSS styling' }, { text: 'State management' }],
  },
  {
    text: 'Backend',
    children: [{ text: 'API endpoints' }, { text: 'Database schema' }, { text: 'Authentication' }],
  },
  { text: 'Deployment' },
];

// ============================================================================
// Table Style Demos
// ============================================================================

function demoTableStyles() {
  console.log(`\n${bold(cyan('='.repeat(60)))}`);
  console.log(bold(cyan('  TABLE STYLES DEMO')));
  console.log(`${bold(cyan('='.repeat(60)))}\n`);

  const tableStyles = [
    'simple',
    'grid',
    'outline',
    'borderless',
    'unicode',
    'double',
    'rounded',
    'heavy',
  ];

  for (const style of tableStyles) {
    console.log(yellow(`\n>>> ${style.toUpperCase()} STYLE <<<\n`));
    const renderer = createTableRenderer({ style });
    renderer.print(users.slice(0, 3), ['id', 'name', 'age']);
  }
}

// ============================================================================
// Table Features Demo
// ============================================================================

function demoTableFeatures() {
  console.log(`\n${bold(cyan('='.repeat(60)))}`);
  console.log(bold(cyan('  TABLE FEATURES DEMO')));
  console.log(`${bold(cyan('='.repeat(60)))}\n`);

  // Zebra striping
  console.log(yellow('\n>>> ZEBRA STRIPING <<<\n'));
  const zebraRenderer = createTableRenderer({ style: 'unicode', zebra: true });
  zebraRenderer.print(users, ['id', 'name', 'age', 'city']);

  // Column alignment
  console.log(yellow('\n>>> COLUMN ALIGNMENT <<<\n'));
  const alignedColumns = [
    { key: 'id', header: 'ID', align: ALIGNMENT.CENTER, width: 5 },
    { key: 'name', header: 'Full Name', align: ALIGNMENT.LEFT },
    { key: 'age', header: 'Age', align: ALIGNMENT.RIGHT, width: 8 },
    { key: 'city', header: 'Location', align: ALIGNMENT.CENTER },
  ];
  const alignRenderer = createTableRenderer({ style: 'unicode' });
  alignRenderer.print(users.slice(0, 3), alignedColumns);

  // Custom formatters
  console.log(yellow('\n>>> CUSTOM FORMATTERS <<<\n'));
  const formattedColumns = [
    { key: 'name', header: 'User' },
    {
      key: 'age',
      header: 'Age Category',
      formatter: (val) => (val < 25 ? 'Young' : val < 35 ? 'Adult' : 'Senior'),
    },
    {
      key: 'active',
      header: 'Status',
      formatter: (val) => (val ? 'Active' : 'Inactive'),
    },
  ];
  const formatRenderer = createTableRenderer({ style: 'rounded' });
  formatRenderer.print(users, formattedColumns);

  // Row numbers
  console.log(yellow('\n>>> ROW NUMBERS <<<\n'));
  const rowNumRenderer = createTableRenderer({ style: 'unicode' });
  rowNumRenderer.print(users.slice(0, 3), ['name', 'city'], { showRowNumbers: true });

  // Table with title
  console.log(yellow('\n>>> TABLE WITH TITLE <<<\n'));
  const titleRenderer = createTableRenderer({ style: 'double' });
  titleRenderer.print(users.slice(0, 3), ['name', 'age'], { title: 'User Directory' });
}

// ============================================================================
// List Style Demos
// ============================================================================

function demoListStyles() {
  console.log(`\n${bold(cyan('='.repeat(60)))}`);
  console.log(bold(cyan('  LIST STYLES DEMO')));
  console.log(`${bold(cyan('='.repeat(60)))}\n`);

  const listStyles = ['bullet', 'dash', 'arrow', 'star', 'numbered', 'lettered', 'roman'];

  for (const style of listStyles) {
    console.log(yellow(`\n>>> ${style.toUpperCase()} LIST <<<\n`));
    const renderer = createListRenderer({ style });
    renderer.print(tasks.slice(0, 4));
  }
}

// ============================================================================
// List Features Demo
// ============================================================================

function demoListFeatures() {
  console.log(`\n${bold(cyan('='.repeat(60)))}`);
  console.log(bold(cyan('  LIST FEATURES DEMO')));
  console.log(`${bold(cyan('='.repeat(60)))}\n`);

  // Checkbox list
  console.log(yellow('\n>>> CHECKBOX LIST <<<\n'));
  const checkboxRenderer = createListRenderer({ style: 'checkbox' });
  checkboxRenderer.print(checklistItems);

  // Nested list
  console.log(yellow('\n>>> NESTED LIST <<<\n'));
  const nestedRenderer = createListRenderer({ style: 'bullet' });
  nestedRenderer.print(nestedItems);

  // Numbered nested
  console.log(yellow('\n>>> NUMBERED NESTED LIST <<<\n'));
  const numberedNestedRenderer = createListRenderer({ style: 'numbered' });
  numberedNestedRenderer.print(nestedItems);
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log(bold(green('\n  TABLE & LIST RENDERING DEMONSTRATION\n')));
  console.log(dim('  Showcasing all available styles and features\n'));

  demoTableStyles();
  demoTableFeatures();
  demoListStyles();
  demoListFeatures();

  console.log(`\n${bold(green('  Demo complete!'))}\n`);
}

main();
