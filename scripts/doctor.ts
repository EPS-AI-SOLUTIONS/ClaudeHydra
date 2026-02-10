import { execSync } from 'node:child_process';
import http from 'node:http';

const COLORS = {
  Green: '\x1b[32m',
  Red: '\x1b[31m',
  Yellow: '\x1b[33m',
  Reset: '\x1b[0m',
};

function checkCmd(cmd) {
  try {
    const output = execSync(`${cmd} --version`, { stdio: 'pipe' }).toString().trim();
    return { ok: true, msg: output };
  } catch (_e) {
    return { ok: false, msg: 'Not found' };
  }
}

async function checkOllama() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:11434/api/tags', (res) => {
      if (res.statusCode === 200) resolve({ ok: true, msg: 'Online (HTTP 200)' });
      else resolve({ ok: false, msg: `Error HTTP ${res.statusCode}` });
    });
    req.on('error', () => resolve({ ok: false, msg: 'Connection refused' }));
  });
}

async function runDoctor() {
  console.log('🩺  HYDRA SYSTEM DIAGNOSIS\n');

  const checks = [
    { name: 'Node.js', cmd: 'node' },
    { name: 'NPM', cmd: 'npm' },
    { name: 'Git', cmd: 'git' },
    { name: 'Rust (Cargo)', cmd: 'cargo' },
    { name: 'Docker', cmd: 'docker' },
  ];

  for (const check of checks) {
    const res = checkCmd(check.cmd);
    const color = res.ok ? COLORS.Green : COLORS.Yellow;
    const mark = res.ok ? '✔' : '⚠';
    console.log(`${color}${mark} ${check.name.padEnd(12)}: ${res.msg}${COLORS.Reset}`);
  }

  const ollamaRes = await checkOllama();
  const oColor = ollamaRes.ok ? COLORS.Green : COLORS.Red;
  console.log(`${oColor}${ollamaRes.ok ? '✔' : '✘'} Ollama      : ${ollamaRes.msg}${COLORS.Reset}`);

  console.log('\nDiagnosis complete.');
}

runDoctor();
