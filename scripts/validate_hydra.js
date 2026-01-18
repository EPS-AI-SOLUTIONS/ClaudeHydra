#!/usr/bin/env node
/**
 * HYDRA 10.6.1 Validation Script
 * Validates HYDRA specification files and rules
 */

const fs = require('fs');
const path = require('path');

const HYDRA_DIR = path.join(__dirname, '..', '.claude', 'hydra');
const REQUIRED_FILES = [
  'HYDRA_CORE.md',
  'HYDRA_SECURITY.md',
  'HYDRA_AGENTS.md',
  'HYDRA_FILES.md',
  'HYDRA_TESTS.md',
  'rules.json',
  'tests.json'
];

const REQUIRED_RULE_FIELDS = ['id', 'level', 'scope', 'desc'];
const VALID_LEVELS = ['HARD', 'SOFT', 'CORE'];
const VALID_SCOPES = ['core', 'security', 'response', 'routing', 'parallel', 'agents'];

function log(type, msg) {
  const icons = { pass: '✅', fail: '❌', warn: '⚠️', info: 'ℹ️' };
  console.log(`${icons[type] || '•'} ${msg}`);
}

function validateFileStructure() {
  log('info', 'Checking file structure...');
  let valid = true;
  
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(HYDRA_DIR, file);
    if (fs.existsSync(filePath)) {
      log('pass', `Found: ${file}`);
    } else {
      log('fail', `Missing: ${file}`);
      valid = false;
    }
  }
  
  return valid;
}

function validateRules() {
  log('info', 'Validating rules.json...');
  const rulesPath = path.join(HYDRA_DIR, 'rules.json');
  
  try {
    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    
    if (!Array.isArray(rules)) {
      log('fail', 'rules.json must be an array');
      return false;
    }
    
    log('info', `Found ${rules.length} rules`);
    
    let valid = true;
    const ruleIds = new Set();
    
    for (const rule of rules) {
      // Check required fields
      for (const field of REQUIRED_RULE_FIELDS) {
        if (!rule[field]) {
          log('fail', `Rule missing field '${field}': ${JSON.stringify(rule)}`);
          valid = false;
        }
      }
      
      // Check for duplicates
      if (ruleIds.has(rule.id)) {
        log('fail', `Duplicate rule ID: ${rule.id}`);
        valid = false;
      }
      ruleIds.add(rule.id);
      
      // Validate level
      if (!VALID_LEVELS.includes(rule.level)) {
        log('warn', `Invalid level '${rule.level}' for rule ${rule.id}`);
      }
      
      // Validate scope
      if (!VALID_SCOPES.includes(rule.scope)) {
        log('warn', `Invalid scope '${rule.scope}' for rule ${rule.id}`);
      }
    }
    
    if (valid) {
      log('pass', 'All rules valid');
    }
    
    return valid;
  } catch (e) {
    log('fail', `Failed to parse rules.json: ${e.message}`);
    return false;
  }
}

function validateTests() {
  log('info', 'Validating tests.json...');
  const testsPath = path.join(HYDRA_DIR, 'tests.json');
  const rulesPath = path.join(HYDRA_DIR, 'rules.json');
  
  try {
    const tests = JSON.parse(fs.readFileSync(testsPath, 'utf8'));
    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    const ruleIds = new Set(rules.map(r => r.id));
    
    if (!Array.isArray(tests)) {
      log('fail', 'tests.json must be an array');
      return false;
    }
    
    log('info', `Found ${tests.length} tests`);
    
    let valid = true;
    
    for (const test of tests) {
      if (!test.test_id) {
        log('fail', 'Test missing test_id');
        valid = false;
        continue;
      }
      
      if (!test.validates || !Array.isArray(test.validates)) {
        log('fail', `Test ${test.test_id} missing 'validates' array`);
        valid = false;
        continue;
      }
      
      // Check that validated rules exist
      for (const ruleId of test.validates) {
        if (!ruleIds.has(ruleId)) {
          log('warn', `Test ${test.test_id} validates unknown rule: ${ruleId}`);
        }
      }
    }
    
    if (valid) {
      log('pass', 'All tests valid');
    }
    
    return valid;
  } catch (e) {
    log('fail', `Failed to parse tests.json: ${e.message}`);
    return false;
  }
}

function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  HYDRA 10.6.1 Validation               ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  const results = {
    structure: validateFileStructure(),
    rules: validateRules(),
    tests: validateTests()
  };
  
  console.log('\n────────────────────────────────────────');
  console.log('Summary:');
  
  let allPassed = true;
  for (const [check, passed] of Object.entries(results)) {
    if (passed) {
      log('pass', `${check}: PASSED`);
    } else {
      log('fail', `${check}: FAILED`);
      allPassed = false;
    }
  }
  
  console.log('────────────────────────────────────────\n');
  
  if (allPassed) {
    console.log('🎉 HYDRA 10.6.1 validation PASSED\n');
    process.exit(0);
  } else {
    console.log('💥 HYDRA 10.6.1 validation FAILED\n');
    process.exit(1);
  }
}

main();
