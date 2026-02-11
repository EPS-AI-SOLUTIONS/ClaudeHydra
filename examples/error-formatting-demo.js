/**
 * @fileoverview Demo of the enhanced error formatting system
 * Run with: node examples/error-formatting-demo.js
 */

import {
  APIError,
  AppError,
  AuthenticationError,
  ErrorCode,
  FileNotFoundError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from '../src/errors/AppError.js';

import { ErrorFormatter, formatError } from '../src/errors/error-formatter.js';
import { generateSuggestions, getTroubleshootingSteps } from '../src/logger/fix-suggestions.js';
import {
  formatError as formatErrorBox,
  formatHint,
  formatInfo as formatInfoBox,
  formatInline,
  formatSuccess as formatSuccessBox,
  formatWarning as formatWarningBox,
  MessageFormatter,
} from '../src/logger/message-formatter.js';

// ============================================================================
// Demo: Message Box Formatting
// ============================================================================

console.log(`\n${'='.repeat(80)}`);
console.log(' MESSAGE BOX FORMATTING DEMO');
console.log(`${'='.repeat(80)}\n`);

// Error box
console.log(
  formatErrorBox('Connection Failed', 'Unable to establish connection to the database server.', {
    details: {
      Host: 'localhost:5432',
      Database: 'production',
      Timeout: '30s',
    },
    suggestions: [
      'Check if the database server is running',
      'Verify connection credentials',
      'Check firewall settings',
    ],
  }),
);

console.log();

// Warning box
console.log(
  formatWarningBox(
    'Deprecation Notice',
    'The `oldMethod()` function is deprecated and will be removed in v3.0.',
    {
      details: {
        'Current version': '2.5.0',
        'Removal version': '3.0.0',
      },
      suggestions: ['Use `newMethod()` instead', 'Update your code before upgrading'],
    },
  ),
);

console.log();

// Success box
console.log(
  formatSuccessBox('Deployment Complete', 'Application successfully deployed to production.', {
    details: {
      Environment: 'production',
      Version: '1.2.3',
      'Deployed at': new Date().toISOString(),
    },
  }),
);

console.log();

// Info box
console.log(
  formatInfoBox('System Status', ['All services are operational.', 'No scheduled maintenance.'], {
    details: {
      API: 'Online',
      Database: 'Online',
      Cache: 'Online',
    },
  }),
);

console.log();

// Hint box
console.log(
  formatHint('Pro Tip', 'Use environment variables for sensitive configuration values.', {
    suggestions: ['Store API keys in .env file', 'Add .env to .gitignore'],
  }),
);

// ============================================================================
// Demo: Inline Messages
// ============================================================================

console.log(`\n${'='.repeat(80)}`);
console.log(' INLINE MESSAGE DEMO');
console.log(`${'='.repeat(80)}\n`);

console.log(formatInline('error', 'Failed to load configuration'));
console.log(formatInline('warning', 'Using deprecated API endpoint'));
console.log(formatInline('success', 'Build completed successfully'));
console.log(formatInline('info', 'Processing 1,234 records'));
console.log(formatInline('debug', 'Cache hit ratio: 94.5%'));

// ============================================================================
// Demo: AppError Formatting
// ============================================================================

console.log(`\n${'='.repeat(80)}`);
console.log(' APP ERROR FORMATTING DEMO');
console.log(`${'='.repeat(80)}\n`);

// Create various errors
const authError = new AuthenticationError('Invalid API key provided', {
  context: { service: 'OpenAI', keyPrefix: 'sk-...' },
});

console.log('--- Authentication Error ---\n');
console.log(formatError(authError));

console.log('\n--- Rate Limit Error ---\n');
const rateLimitError = new RateLimitError('API rate limit exceeded', {
  retryAfter: 60,
  limit: 100,
  remaining: 0,
});
console.log(formatError(rateLimitError));

console.log('\n--- File Not Found Error ---\n');
const fileError = new FileNotFoundError('Configuration file not found', {
  path: '/etc/myapp/config.json',
});
console.log(formatError(fileError));

console.log('\n--- Validation Error with Multiple Errors ---\n');
const validationError = new ValidationError('Input validation failed', {
  errors: [
    { path: 'email', message: 'Invalid email format' },
    { path: 'age', message: 'Must be a positive number' },
    { path: 'username', message: 'Already taken' },
  ],
});
console.log(formatError(validationError));

// ============================================================================
// Demo: Error with Cause Chain
// ============================================================================

console.log(`\n${'='.repeat(80)}`);
console.log(' ERROR CAUSE CHAIN DEMO');
console.log(`${'='.repeat(80)}\n`);

const originalError = new Error('ECONNREFUSED: Connection refused');
const networkError = new NetworkError('Failed to connect to external service', {
  host: 'api.example.com',
  port: 443,
  cause: originalError,
});
const apiError = new APIError('External API request failed', {
  service: 'Payment Gateway',
  endpoint: '/v1/charge',
  cause: networkError,
});

console.log(formatError(apiError, { showStack: false }));

// ============================================================================
// Demo: Stack Trace Formatting
// ============================================================================

console.log(`\n${'='.repeat(80)}`);
console.log(' STACK TRACE FORMATTING DEMO');
console.log(`${'='.repeat(80)}\n`);

function deepFunction() {
  throw new AppError('Something went wrong deep in the call stack', {
    code: ErrorCode.INTERNAL_ERROR,
  });
}

function middleFunction() {
  deepFunction();
}

function outerFunction() {
  middleFunction();
}

try {
  outerFunction();
} catch (error) {
  console.log(formatError(error, { showStack: true, showSuggestions: true }));
}

// ============================================================================
// Demo: Troubleshooting Steps
// ============================================================================

console.log(`\n${'='.repeat(80)}`);
console.log(' TROUBLESHOOTING STEPS DEMO');
console.log(`${'='.repeat(80)}\n`);

const timeoutError = new TimeoutError('Request timed out', {
  timeoutMs: 30000,
  operation: 'API call',
});

const steps = getTroubleshootingSteps(timeoutError);
console.log('Troubleshooting Steps for Timeout Error:\n');
steps.forEach((step) => console.log(`  ${step}`));

// ============================================================================
// Demo: Diagnostic Information
// ============================================================================

console.log(`\n${'='.repeat(80)}`);
console.log(' DIAGNOSTIC INFORMATION DEMO');
console.log(`${'='.repeat(80)}\n`);

const _formatter = new MessageFormatter({ maxWidth: 80 });

const errors = [
  new AuthenticationError('Auth failed'),
  new NetworkError('Connection lost'),
  new ValidationError('Invalid input'),
  new TimeoutError('Operation timed out'),
];

errors.forEach((error) => {
  const suggestions = generateSuggestions(error);
  console.log(`Error: ${error.name}`);
  console.log(`  Title: ${suggestions.title}`);
  console.log(`  Source: ${suggestions.source}`);
  console.log(`  Suggestions: ${suggestions.suggestions.length}`);
  console.log();
});

// ============================================================================
// Demo: Complete Error Report
// ============================================================================

console.log(`\n${'='.repeat(80)}`);
console.log(' COMPLETE ERROR REPORT DEMO');
console.log(`${'='.repeat(80)}\n`);

const complexError = new APIError('Payment processing failed', {
  service: 'Stripe',
  endpoint: '/v1/charges',
  responseStatus: 402,
  context: {
    customerId: 'cus_123456',
    amount: 9999,
    currency: 'USD',
  },
});

// Full diagnostic output
const errorFormatter = new ErrorFormatter({
  useColors: true,
  showSuggestions: true,
  showStack: true,
  showDetails: true,
});

errorFormatter.printDiagnostic(complexError);

console.log(`\n${'='.repeat(80)}`);
console.log(' DEMO COMPLETE');
console.log(`${'='.repeat(80)}\n`);
