/**
 * SWARM Protocol E2E Tests
 * Weryfikacja protokołu 6-krokowego
 */

import { swarmLogger, SwarmStep } from '../utils/swarmLogger';

// ============================================================================
// TEST TYPES
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

interface TestSuite {
  name: string;
  results: TestResult[];
  totalPassed: number;
  totalFailed: number;
  duration: number;
}

// ============================================================================
// SWARM PROTOCOL TESTS
// ============================================================================

/**
 * Test SWARM Logger session lifecycle
 */
async function testSessionLifecycle(): Promise<TestResult> {
  const start = Date.now();
  const testName = 'Session Lifecycle';

  try {
    // Start session
    const sessionId = swarmLogger.startSession('Test query');
    if (!sessionId || !sessionId.startsWith('swarm_')) {
      throw new Error('Invalid session ID format');
    }

    // Verify session exists
    const session = swarmLogger.getCurrentSession();
    if (!session || session.id !== sessionId) {
      throw new Error('Session not found after creation');
    }

    // End session
    const endedSession = swarmLogger.endSession(true, 'Test complete');
    if (!endedSession || !endedSession.completed) {
      throw new Error('Session not properly ended');
    }

    // Verify no active session
    const currentSession = swarmLogger.getCurrentSession();
    if (currentSession !== null) {
      throw new Error('Session still active after ending');
    }

    return {
      name: testName,
      passed: true,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test SWARM step tracking
 */
async function testStepTracking(): Promise<TestResult> {
  const start = Date.now();
  const testName = 'Step Tracking';

  try {
    const steps: SwarmStep[] = ['ROUTE', 'SPECULATE', 'PLAN', 'EXECUTE', 'SYNTHESIZE', 'REPORT'];

    swarmLogger.startSession('Test step tracking');

    // Execute all steps
    for (const step of steps) {
      swarmLogger.stepStart(step, ['test-agent']);

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 10));

      swarmLogger.stepComplete(step, `Completed ${step}`);
    }

    const session = swarmLogger.endSession(true);

    if (!session) {
      throw new Error('No session returned');
    }

    // Verify all steps were tracked
    const completedSteps = session.steps.filter(s => s.status === 'completed');
    if (completedSteps.length !== steps.length) {
      throw new Error(`Expected ${steps.length} completed steps, got ${completedSteps.length}`);
    }

    // Verify step order
    for (let i = 0; i < steps.length; i++) {
      const stepEntries = session.steps.filter(s => s.step === steps[i]);
      if (stepEntries.length < 2) { // started + completed
        throw new Error(`Step ${steps[i]} not properly tracked`);
      }
    }

    return {
      name: testName,
      passed: true,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test error handling in steps
 */
async function testErrorHandling(): Promise<TestResult> {
  const start = Date.now();
  const testName = 'Error Handling';

  try {
    swarmLogger.startSession('Test error handling');

    swarmLogger.stepStart('ROUTE');
    swarmLogger.stepComplete('ROUTE');

    swarmLogger.stepStart('SPECULATE');
    swarmLogger.stepError('SPECULATE', 'Test error');

    const session = swarmLogger.endSession(false, 'Failed with error');

    if (!session) {
      throw new Error('No session returned');
    }

    // Verify error was recorded
    const errorStep = session.steps.find(s => s.status === 'error');
    if (!errorStep || errorStep.step !== 'SPECULATE') {
      throw new Error('Error step not properly recorded');
    }

    if (errorStep.error !== 'Test error') {
      throw new Error('Error message not preserved');
    }

    return {
      name: testName,
      passed: true,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test step skipping
 */
async function testStepSkipping(): Promise<TestResult> {
  const start = Date.now();
  const testName = 'Step Skipping';

  try {
    swarmLogger.startSession('Test step skipping');

    swarmLogger.stepStart('ROUTE');
    swarmLogger.stepComplete('ROUTE');

    swarmLogger.stepSkip('SPECULATE', 'Not needed for simple query');

    swarmLogger.stepStart('PLAN');
    swarmLogger.stepComplete('PLAN');

    const session = swarmLogger.endSession(true);

    if (!session) {
      throw new Error('No session returned');
    }

    // Verify skip was recorded
    const skippedStep = session.steps.find(s => s.status === 'skipped');
    if (!skippedStep || skippedStep.step !== 'SPECULATE') {
      throw new Error('Skipped step not properly recorded');
    }

    return {
      name: testName,
      passed: true,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test session report generation
 */
async function testReportGeneration(): Promise<TestResult> {
  const start = Date.now();
  const testName = 'Report Generation';

  try {
    swarmLogger.startSession('Test report');

    swarmLogger.stepStart('ROUTE');
    swarmLogger.stepComplete('ROUTE');

    const session = swarmLogger.endSession(true);

    if (!session) {
      throw new Error('No session returned');
    }

    const report = swarmLogger.getSessionReport(session);

    // Verify report format
    if (!report.includes('SWARM PROTOCOL REPORT')) {
      throw new Error('Report missing header');
    }

    if (!report.includes('SUCCESS')) {
      throw new Error('Report missing status');
    }

    if (!report.includes('ROUTE')) {
      throw new Error('Report missing steps');
    }

    return {
      name: testName,
      passed: true,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// TEST RUNNER
// ============================================================================

/**
 * Run all SWARM Protocol tests
 */
export async function runSwarmTests(): Promise<TestSuite> {
  const suiteStart = Date.now();
  const results: TestResult[] = [];

  console.log('🐺 Running SWARM Protocol Tests...\n');

  // Run tests sequentially to avoid state conflicts
  const tests = [
    testSessionLifecycle,
    testStepTracking,
    testErrorHandling,
    testStepSkipping,
    testReportGeneration,
  ];

  for (const test of tests) {
    const result = await test();
    results.push(result);

    const icon = result.passed ? '✓' : '✗';
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon} ${result.name}: ${status} (${result.duration}ms)`);

    if (result.error) {
      console.log(`    Error: ${result.error}`);
    }
  }

  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = results.filter(r => !r.passed).length;
  const duration = Date.now() - suiteStart;

  console.log('\n' + '─'.repeat(50));
  console.log(`Total: ${totalPassed} passed, ${totalFailed} failed (${duration}ms)`);
  console.log('─'.repeat(50));

  return {
    name: 'SWARM Protocol Tests',
    results,
    totalPassed,
    totalFailed,
    duration,
  };
}

/**
 * Print test report as ASCII table
 */
export function printTestReport(suite: TestSuite): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║  🐺 SWARM PROTOCOL TEST REPORT                               ║',
    '╠══════════════════════════════════════════════════════════════╣',
  ];

  for (const result of suite.results) {
    const icon = result.passed ? '✓' : '✗';
    const name = result.name.padEnd(25);
    const status = (result.passed ? 'PASS' : 'FAIL').padEnd(6);
    const time = `${result.duration}ms`.padStart(8);
    lines.push(`║  ${icon} ${name} ${status} ${time}              ║`);
  }

  lines.push('╠══════════════════════════════════════════════════════════════╣');
  lines.push(`║  Total: ${suite.totalPassed} passed, ${suite.totalFailed} failed    Duration: ${suite.duration}ms       ║`);
  lines.push('╚══════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

// Export for use in browser console or Node.js
export default { runSwarmTests, printTestReport };
