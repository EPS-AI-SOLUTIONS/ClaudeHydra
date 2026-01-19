import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const memoryDir = join(repoRoot, '.serena', 'memories');

const formatDate = (date) => date.toISOString().slice(0, 10);
const formatStamp = (date) => date.toISOString().replace(/[:.]/g, '-');

const normalizeText = (value) => {
  if (!value) return '';
  return `${value}`.replace(/\r\n/g, '\n').trim();
};

const getTitle = (title, prompt) => {
  const base = normalizeText(title) || normalizeText(prompt).split('\n')[0];
  if (!base) return 'Swarm Task';
  return base.length > 80 ? `${base.slice(0, 80)}...` : base;
};

const ensureLogHeader = async (logPath, dateLabel) => {
  try {
    await readFile(logPath, 'utf8');
    return false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const header = [
    `# Task Log - ${dateLabel}`,
    `**Date**: ${dateLabel}`,
    '**Type**: Multi-task Day',
    ''
  ].join('\n');
  await writeFile(logPath, `${header}\n`, 'utf8');
  return true;
};

const maybeRebaseLog = async (logPath) => {
  if (Math.random() > 0.1) return false;
  const content = await readFile(logPath, 'utf8').catch(() => null);
  if (!content) return false;
  const compacted = content.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  if (compacted !== content) {
    await writeFile(logPath, compacted, 'utf8');
  }
  return true;
};

export const writeSwarmMemory = async ({
  title,
  prompt,
  steps,
  agents,
  summary,
  finalAnswer
}) => {
  await mkdir(memoryDir, { recursive: true });
  const now = new Date();
  const dateLabel = formatDate(now);
  const stamp = formatStamp(now);
  const safeTitle = getTitle(title, prompt);
  const archiveFile = `swarm-archive-${stamp}.md`;
  const archivePath = join(memoryDir, archiveFile);
  const logPath = join(memoryDir, `task-log-${dateLabel}.md`);

  const agentBlocks = (agents || [])
    .map((agent) =>
      [
        `### ${agent.name}`,
        `**Model**: ${agent.model}`,
        '',
        normalizeText(agent.response)
      ].join('\n')
    )
    .join('\n\n');

  const archiveContent = [
    `# Swarm Archive - ${stamp}`,
    `**Date**: ${dateLabel}`,
    `**Title**: ${safeTitle}`,
    '',
    '## Prompt',
    normalizeText(prompt),
    '',
    '## Speculate',
    normalizeText(steps?.speculation),
    '',
    '## Plan',
    normalizeText(steps?.plan),
    '',
    '## Execute',
    agentBlocks || 'No agent output.',
    '',
    '## Synthesize',
    normalizeText(finalAnswer),
    '',
    '## Log',
    normalizeText(summary)
  ].join('\n');

  await writeFile(archivePath, `${archiveContent}\n`, 'utf8');

  await ensureLogHeader(logPath, dateLabel);
  const logEntry = [
    `## Task: ${safeTitle}`,
    '**Status**: Completed',
    '**Agent**: AgentSwarm',
    '',
    '### Outcome',
    `- ${normalizeText(summary) || 'Summary unavailable.'}`,
    '',
    '### Notes',
    `- Archive: ${archiveFile}`,
    `- Agents: ${(agents || []).map((agent) => agent.name).join(', ') || 'None'}`,
    ''
  ].join('\n');

  await appendFile(logPath, `${logEntry}\n`, 'utf8');
  const rebased = await maybeRebaseLog(logPath);

  return {
    archivePath,
    logPath,
    rebased
  };
};
