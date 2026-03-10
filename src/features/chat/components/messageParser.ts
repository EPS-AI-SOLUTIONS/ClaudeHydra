interface ContentSegment {
  type: 'text' | 'tool';
  name?: string;
  content: string;
}

export function splitToolOutput(content: string): ContentSegment[] {
  const toolPattern = /\n---\n\*\*(?:🔧 )?Tool:\*\* `([^`]+)`\n```\n([\s\S]*?)\n```\n---\n/g;
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  toolPattern.lastIndex = 0;

  while ((match = toolPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'tool', name: match[1] || '', content: match[2] || '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }
  return segments;
}

export function stripParallelHeader(content: string): string {
  return content.replace(/(?:⚡ )?Parallel execution: \d+ tools\n?/g, '');
}
