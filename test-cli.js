#!/usr/bin/env node
/**
 * HYDRA CLI Test Script
 * Tests all MCP server implementations
 */

const { spawn } = require('child_process');
const path = require('path');

const CLIS = [
  { name: 'CodexCLI', path: 'CodexCLI/src/server.js' },
  { name: 'GrokCLI', path: 'GrokCLI/src/server.js' },
  { name: 'GeminiCLI', path: 'GeminiCLI/src/server.js' },
];

async function testCLI(cli) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${cli.name}`);
    console.log('='.repeat(60));

    const serverPath = path.join(__dirname, cli.path);
    const proc = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.dirname(serverPath),
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Send MCP initialize request
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'HYDRA-Test', version: '1.0.0' }
      }
    }) + '\n';

    proc.stdin.write(initRequest);

    // Send tools/list request
    setTimeout(() => {
      const toolsRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      }) + '\n';
      proc.stdin.write(toolsRequest);
    }, 500);

    // Kill after timeout and report
    setTimeout(() => {
      proc.kill();

      console.log('\n--- Server Output ---');
      if (errorOutput) console.log(errorOutput.slice(0, 500));

      console.log('\n--- MCP Response ---');
      const lines = output.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        try {
          const json = JSON.parse(line);
          if (json.result?.tools) {
            console.log(`✅ Found ${json.result.tools.length} tools:`);
            json.result.tools.slice(0, 5).forEach(t =>
              console.log(`   - ${t.name}: ${t.description?.slice(0, 50)}...`)
            );
            if (json.result.tools.length > 5) {
              console.log(`   ... and ${json.result.tools.length - 5} more`);
            }
          } else if (json.result?.serverInfo) {
            console.log(`✅ Server: ${json.result.serverInfo.name} v${json.result.serverInfo.version}`);
          }
        } catch (e) {
          // Not JSON, skip
        }
      });

      resolve({
        name: cli.name,
        success: output.includes('tools') || errorOutput.includes('running'),
        toolCount: (output.match(/"name":/g) || []).length / 2
      });
    }, 3000);
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  HYDRA CLI Test Suite                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const results = [];
  for (const cli of CLIS) {
    try {
      const result = await testCLI(cli);
      results.push(result);
    } catch (e) {
      results.push({ name: cli.name, success: false, error: e.message });
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${r.name}: ${r.success ? 'PASSED' : 'FAILED'}`);
  });
}

main().catch(console.error);
