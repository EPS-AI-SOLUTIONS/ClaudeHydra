/**
 * @fileoverview Error-specific fix suggestions and diagnostic helpers
 * Provides intelligent suggestions based on error type, code, and context.
 * @module logger/fix-suggestions
 */

import { ErrorCode } from '../errors/AppError.js';

// ============================================================================
// Suggestion Database
// ============================================================================

/**
 * Fix suggestions mapped by error code
 * @type {Object.<string, Object>}
 */
const SUGGESTIONS_BY_CODE = {
  // Authentication errors
  [ErrorCode.AUTHENTICATION_ERROR]: {
    title: 'Authentication Failed',
    suggestions: [
      'Verify your API key is correct and not expired',
      'Check if your API key has the necessary permissions',
      'Regenerate your API key from the provider dashboard',
      'Ensure the API key environment variable is properly set'
    ],
    links: [
      'https://ai.google.dev/docs/setup - Google AI Setup Guide'
    ]
  },

  [ErrorCode.INVALID_API_KEY]: {
    title: 'Invalid API Key',
    suggestions: [
      'Double-check the API key format (should start with correct prefix)',
      'Verify you\'re using the key for the correct service',
      'Check if there are any extra spaces or characters',
      'Try copying the API key again from the provider dashboard'
    ]
  },

  [ErrorCode.TOKEN_EXPIRED]: {
    title: 'Token Expired',
    suggestions: [
      'Refresh your authentication token',
      'Re-authenticate with the service',
      'Check if your session has timed out',
      'Generate a new access token'
    ]
  },

  // Authorization errors
  [ErrorCode.AUTHORIZATION_ERROR]: {
    title: 'Access Denied',
    suggestions: [
      'Verify you have the required permissions',
      'Check if the resource requires elevated access',
      'Contact your administrator for access',
      'Review the API\'s permission requirements'
    ]
  },

  // Rate limiting
  [ErrorCode.RATE_LIMIT_EXCEEDED]: {
    title: 'Rate Limit Exceeded',
    suggestions: [
      'Wait before making more requests (check retry-after header)',
      'Implement exponential backoff in your requests',
      'Consider upgrading your API plan for higher limits',
      'Batch multiple operations into fewer requests'
    ]
  },

  [ErrorCode.QUOTA_EXCEEDED]: {
    title: 'Quota Exceeded',
    suggestions: [
      'Check your current quota usage in the provider dashboard',
      'Wait for the quota reset period',
      'Request a quota increase from the provider',
      'Optimize your usage to stay within limits'
    ]
  },

  // Network errors
  [ErrorCode.NETWORK_ERROR]: {
    title: 'Network Error',
    suggestions: [
      'Check your internet connection',
      'Verify the service endpoint is correct',
      'Try using a VPN if the service might be blocked',
      'Check if a proxy is required for your network'
    ]
  },

  [ErrorCode.TIMEOUT_ERROR]: {
    title: 'Request Timeout',
    suggestions: [
      'Increase the timeout duration for slower operations',
      'Check if the service is experiencing high load',
      'Try breaking large requests into smaller chunks',
      'Verify network stability and latency'
    ]
  },

  [ErrorCode.CONNECTION_REFUSED]: {
    title: 'Connection Refused',
    suggestions: [
      'Verify the service URL and port are correct',
      'Check if the service is running and accessible',
      'Ensure no firewall is blocking the connection',
      'Try pinging the server to verify connectivity'
    ]
  },

  // Configuration errors
  [ErrorCode.CONFIG_ERROR]: {
    title: 'Configuration Error',
    suggestions: [
      'Check your configuration file for syntax errors',
      'Verify all required configuration values are set',
      'Compare with the example configuration',
      'Run the configuration validator if available'
    ]
  },

  [ErrorCode.MISSING_CONFIG]: {
    title: 'Missing Configuration',
    suggestions: [
      'Create the required configuration file',
      'Set the missing environment variables',
      'Run the setup wizard to generate configuration',
      'Check the documentation for required settings'
    ]
  },

  [ErrorCode.INVALID_CONFIG]: {
    title: 'Invalid Configuration',
    suggestions: [
      'Validate the configuration value format',
      'Check for typos in configuration keys',
      'Ensure values match expected types (string, number, boolean)',
      'Review the configuration schema documentation'
    ]
  },

  // File system errors
  [ErrorCode.FILE_NOT_FOUND]: {
    title: 'File Not Found',
    suggestions: [
      'Verify the file path is correct (check for typos)',
      'Ensure the file exists at the specified location',
      'Check if the path is relative vs absolute',
      'Verify you have read permissions for the directory'
    ]
  },

  [ErrorCode.FILE_READ_ERROR]: {
    title: 'File Read Error',
    suggestions: [
      'Check file permissions (run chmod if needed)',
      'Verify the file is not corrupted',
      'Ensure the file is not locked by another process',
      'Check available disk space'
    ]
  },

  [ErrorCode.FILE_WRITE_ERROR]: {
    title: 'File Write Error',
    suggestions: [
      'Check write permissions for the directory',
      'Ensure there is sufficient disk space',
      'Verify the file is not read-only',
      'Check if the file is locked by another process'
    ]
  },

  [ErrorCode.PERMISSION_DENIED]: {
    title: 'Permission Denied',
    suggestions: [
      'Check file/directory permissions (ls -la)',
      'Try running with elevated privileges if appropriate',
      'Verify ownership of the file/directory',
      'Check if SELinux or AppArmor is blocking access'
    ]
  },

  // Validation errors
  [ErrorCode.VALIDATION_ERROR]: {
    title: 'Validation Error',
    suggestions: [
      'Review the input data format and types',
      'Check for required fields that may be missing',
      'Verify string lengths and numeric ranges',
      'Look at the specific validation error messages'
    ]
  },

  [ErrorCode.SCHEMA_VALIDATION_FAILED]: {
    title: 'Schema Validation Failed',
    suggestions: [
      'Compare your input against the expected schema',
      'Check for extra or misspelled field names',
      'Ensure all required fields are present',
      'Verify data types match the schema definition'
    ]
  },

  [ErrorCode.INVALID_INPUT]: {
    title: 'Invalid Input',
    suggestions: [
      'Check the input format requirements',
      'Verify special characters are properly escaped',
      'Ensure input doesn\'t exceed size limits',
      'Review the API documentation for input specs'
    ]
  },

  // API errors
  [ErrorCode.API_ERROR]: {
    title: 'API Error',
    suggestions: [
      'Check the API response for detailed error message',
      'Verify you\'re using the correct API version',
      'Review the API documentation for the endpoint',
      'Check the API status page for outages'
    ]
  },

  [ErrorCode.SERVICE_UNAVAILABLE]: {
    title: 'Service Unavailable',
    suggestions: [
      'Wait and retry after a short delay',
      'Check the service status page',
      'Try an alternative endpoint if available',
      'Implement retry logic with exponential backoff'
    ]
  },

  // Tool errors
  [ErrorCode.TOOL_NOT_FOUND]: {
    title: 'Tool Not Found',
    suggestions: [
      'Check the tool name for typos',
      'Verify the tool is registered in the tool registry',
      'Ensure the tool module is properly loaded',
      'List available tools to see what\'s registered'
    ]
  },

  [ErrorCode.TOOL_EXECUTION_FAILED]: {
    title: 'Tool Execution Failed',
    suggestions: [
      'Check the tool input parameters',
      'Review the tool\'s error message for details',
      'Verify external dependencies are available',
      'Check logs for more detailed error information'
    ]
  },

  // Swarm errors
  [ErrorCode.SWARM_ERROR]: {
    title: 'Swarm Coordination Error',
    suggestions: [
      'Check individual agent status and logs',
      'Verify communication between agents',
      'Review the swarm configuration',
      'Check for resource constraints (memory, connections)'
    ]
  },

  [ErrorCode.AGENT_ERROR]: {
    title: 'Agent Error',
    suggestions: [
      'Review the agent\'s configuration',
      'Check if the agent\'s dependencies are available',
      'Verify the agent has necessary permissions',
      'Look at the agent\'s specific error details'
    ]
  }
};

/**
 * Suggestions based on error message patterns
 * @type {Array.<{pattern: RegExp, suggestions: string[]}>}
 */
const PATTERN_SUGGESTIONS = [
  {
    pattern: /ECONNREFUSED/i,
    suggestions: [
      'The server is not accepting connections',
      'Check if the server process is running',
      'Verify the port number is correct'
    ]
  },
  {
    pattern: /ENOTFOUND|getaddrinfo/i,
    suggestions: [
      'The hostname could not be resolved',
      'Check your DNS settings',
      'Verify the hostname is spelled correctly'
    ]
  },
  {
    pattern: /ETIMEDOUT/i,
    suggestions: [
      'The connection attempt timed out',
      'Check network connectivity',
      'The server might be overloaded or unreachable'
    ]
  },
  {
    pattern: /ENOENT/i,
    suggestions: [
      'The file or directory does not exist',
      'Check if the path is correct',
      'Verify the working directory'
    ]
  },
  {
    pattern: /EACCES|EPERM/i,
    suggestions: [
      'Permission denied for this operation',
      'Check file/directory permissions',
      'You may need elevated privileges'
    ]
  },
  {
    pattern: /ENOMEM|out of memory/i,
    suggestions: [
      'The system is running low on memory',
      'Close other applications to free memory',
      'Consider processing data in smaller batches'
    ]
  },
  {
    pattern: /EMFILE|too many open files/i,
    suggestions: [
      'Too many file descriptors are open',
      'Increase the ulimit for open files',
      'Close file handles when done'
    ]
  },
  {
    pattern: /JSON.*parse|Unexpected token/i,
    suggestions: [
      'The JSON data is malformed',
      'Check for trailing commas or missing brackets',
      'Validate the JSON using a linter'
    ]
  },
  {
    pattern: /undefined is not a function|is not a function/i,
    suggestions: [
      'Calling a function that doesn\'t exist',
      'Check if the module is properly imported',
      'Verify the object has the expected method'
    ]
  },
  {
    pattern: /Cannot read propert|undefined|null/i,
    suggestions: [
      'Accessing a property on undefined/null',
      'Add null checks before accessing properties',
      'Verify the data structure is as expected'
    ]
  },
  {
    pattern: /Module not found|Cannot find module/i,
    suggestions: [
      'The required module is not installed',
      'Run npm install to install dependencies',
      'Check the import path is correct'
    ]
  },
  {
    pattern: /CORS|Access-Control-Allow/i,
    suggestions: [
      'Cross-Origin Request blocked by browser',
      'Configure CORS on the server',
      'Use a proxy for development'
    ]
  },
  {
    pattern: /SSL|certificate|TLS/i,
    suggestions: [
      'SSL/TLS certificate issue',
      'Check if the certificate is valid and not expired',
      'Verify the certificate chain is complete'
    ]
  }
];

// ============================================================================
// Suggestion Generator
// ============================================================================

/**
 * Options for generating suggestions
 * @typedef {Object} SuggestionOptions
 * @property {boolean} [includeLinks=true] - Include documentation links
 * @property {number} [maxSuggestions=5] - Maximum suggestions to return
 * @property {boolean} [includeGeneric=true] - Include generic suggestions if no specific ones found
 */

/**
 * Result from suggestion generation
 * @typedef {Object} SuggestionResult
 * @property {string} title - Suggestion section title
 * @property {string[]} suggestions - Array of suggestions
 * @property {string[]} links - Related documentation links
 * @property {string} source - Source of suggestions (code, pattern, generic)
 */

/**
 * Generates fix suggestions for an error
 * @param {Error|Object} error - Error object or error-like object
 * @param {SuggestionOptions} [options={}] - Generation options
 * @returns {SuggestionResult} Suggestions result
 */
export function generateSuggestions(error, options = {}) {
  const {
    includeLinks = true,
    maxSuggestions = 5,
    includeGeneric = true
  } = options;

  // Try to get error code
  const errorCode = error.code || (error.context && error.context.code);
  const errorMessage = error.message || String(error);

  let result = {
    title: 'Possible Solutions',
    suggestions: [],
    links: [],
    source: 'generic'
  };

  // 1. Try code-based suggestions first
  if (errorCode && SUGGESTIONS_BY_CODE[errorCode]) {
    const codeSuggestions = SUGGESTIONS_BY_CODE[errorCode];
    result = {
      title: codeSuggestions.title || 'Possible Solutions',
      suggestions: [...codeSuggestions.suggestions],
      links: includeLinks ? (codeSuggestions.links || []) : [],
      source: 'code'
    };
  }

  // 2. Try pattern-based suggestions
  const patternSuggestions = getPatternSuggestions(errorMessage);
  if (patternSuggestions.length > 0) {
    if (result.source === 'generic') {
      result.suggestions = patternSuggestions;
      result.source = 'pattern';
    } else {
      // Merge with code suggestions (avoid duplicates)
      for (const suggestion of patternSuggestions) {
        if (!result.suggestions.includes(suggestion)) {
          result.suggestions.push(suggestion);
        }
      }
    }
  }

  // 3. Add generic suggestions if needed
  if (result.suggestions.length === 0 && includeGeneric) {
    result.suggestions = getGenericSuggestions(error);
    result.source = 'generic';
  }

  // Limit suggestions
  result.suggestions = result.suggestions.slice(0, maxSuggestions);

  return result;
}

/**
 * Gets suggestions based on error message patterns
 * @param {string} message - Error message
 * @returns {string[]} Matching suggestions
 */
function getPatternSuggestions(message) {
  const suggestions = [];

  for (const { pattern, suggestions: patternSuggs } of PATTERN_SUGGESTIONS) {
    if (pattern.test(message)) {
      suggestions.push(...patternSuggs);
    }
  }

  return suggestions;
}

/**
 * Gets generic suggestions for any error
 * @param {Error|Object} error - Error object
 * @returns {string[]} Generic suggestions
 */
function getGenericSuggestions(error) {
  const suggestions = [
    'Check the error message for specific details',
    'Review the stack trace to identify the error location',
    'Search for the error message online for solutions',
    'Check the application logs for more context'
  ];

  // Add context-specific generic suggestions
  if (error.statusCode) {
    if (error.statusCode >= 400 && error.statusCode < 500) {
      suggestions.unshift('This is a client-side error - check your request parameters');
    } else if (error.statusCode >= 500) {
      suggestions.unshift('This is a server-side error - the service might be having issues');
    }
  }

  return suggestions;
}

// ============================================================================
// Diagnostic Helpers
// ============================================================================

/**
 * Error diagnostic information
 * @typedef {Object} DiagnosticInfo
 * @property {string} errorType - Type of error
 * @property {string} severity - Error severity
 * @property {boolean} isRecoverable - Whether the error is recoverable
 * @property {string[]} affectedSystems - Systems affected by this error
 * @property {Object} metrics - Error metrics for monitoring
 */

/**
 * Generates diagnostic information for an error
 * @param {Error|Object} error - Error object
 * @returns {DiagnosticInfo} Diagnostic information
 */
export function generateDiagnostics(error) {
  const errorCode = error.code || 'UNKNOWN';
  const statusCode = error.statusCode || 500;

  // Determine error type
  let errorType = 'Unknown';
  let isRecoverable = true;
  let affectedSystems = [];

  if (statusCode >= 400 && statusCode < 500) {
    errorType = 'Client Error';
    isRecoverable = true;
    affectedSystems = ['Request Validation'];
  } else if (statusCode >= 500) {
    errorType = 'Server Error';
    isRecoverable = statusCode !== 500;
    affectedSystems = ['Backend Service'];
  }

  // Categorize by error code
  if (errorCode.includes('AUTH')) {
    errorType = 'Authentication/Authorization';
    affectedSystems.push('Security');
  } else if (errorCode.includes('NETWORK') || errorCode.includes('CONNECTION')) {
    errorType = 'Network';
    affectedSystems.push('Connectivity');
  } else if (errorCode.includes('FILE') || errorCode.includes('PERMISSION')) {
    errorType = 'File System';
    affectedSystems.push('Storage');
  } else if (errorCode.includes('CONFIG')) {
    errorType = 'Configuration';
    affectedSystems.push('Setup');
    isRecoverable = false;
  } else if (errorCode.includes('RATE') || errorCode.includes('QUOTA')) {
    errorType = 'Rate Limiting';
    affectedSystems.push('API');
    isRecoverable = true;
  } else if (errorCode.includes('TOOL')) {
    errorType = 'Tool Execution';
    affectedSystems.push('Tools');
  } else if (errorCode.includes('SWARM') || errorCode.includes('AGENT')) {
    errorType = 'Swarm/Agent';
    affectedSystems.push('Multi-Agent System');
  }

  return {
    errorType,
    severity: error.severity || 'medium',
    isRecoverable,
    affectedSystems: [...new Set(affectedSystems)],
    metrics: {
      code: errorCode,
      statusCode,
      timestamp: error.timestamp || new Date().toISOString(),
      isOperational: error.isOperational !== false
    }
  };
}

/**
 * Creates a troubleshooting guide for an error
 * @param {Error|Object} error - Error object
 * @returns {string[]} Step-by-step troubleshooting guide
 */
export function getTroubleshootingSteps(error) {
  const steps = [];
  const diagnostics = generateDiagnostics(error);
  const suggestions = generateSuggestions(error);

  // Step 1: Understand the error
  steps.push(`1. Error Type: ${diagnostics.errorType}`);
  
  // Step 2: Check affected systems
  if (diagnostics.affectedSystems.length > 0) {
    steps.push(`2. Affected Systems: ${diagnostics.affectedSystems.join(', ')}`);
  }

  // Step 3: Recovery status
  steps.push(`3. Is Recoverable: ${diagnostics.isRecoverable ? 'Yes' : 'No'}`);

  // Step 4-N: Suggestions
  suggestions.suggestions.forEach((suggestion, index) => {
    steps.push(`${index + 4}. ${suggestion}`);
  });

  return steps;
}

// ============================================================================
// Quick Suggestion Functions
// ============================================================================

/**
 * Gets suggestions for a specific error code
 * @param {string} code - Error code
 * @returns {string[]} Suggestions array
 */
export function getSuggestionsForCode(code) {
  const entry = SUGGESTIONS_BY_CODE[code];
  return entry ? entry.suggestions : [];
}

/**
 * Gets the title for an error code
 * @param {string} code - Error code
 * @returns {string} Title or default
 */
export function getTitleForCode(code) {
  const entry = SUGGESTIONS_BY_CODE[code];
  return entry ? entry.title : 'Error';
}

/**
 * Gets documentation links for an error code
 * @param {string} code - Error code
 * @returns {string[]} Links array
 */
export function getLinksForCode(code) {
  const entry = SUGGESTIONS_BY_CODE[code];
  return entry ? (entry.links || []) : [];
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  generateSuggestions,
  generateDiagnostics,
  getTroubleshootingSteps,
  getSuggestionsForCode,
  getTitleForCode,
  getLinksForCode,
  SUGGESTIONS_BY_CODE,
  PATTERN_SUGGESTIONS
};
