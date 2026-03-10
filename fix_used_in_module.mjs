import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const output = execSync('npx ts-prune').toString();
const lines = output.split('\n');

for (const line of lines) {
  if (line.includes('(used in module)')) {
    const match = line.match(/^(.*?):(\d+) - (.*?) \(used in module\)/);
    if (match) {
      const file = match[1].trim();
      const lineNum = parseInt(match[2], 10) - 1;
      const id = match[3].trim();
      
      const fullPath = process.cwd() + file;
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8').split('\n');
        content[lineNum] = content[lineNum].replace(/export\s+/, '');
        fs.writeFileSync(fullPath, content.join('\n'));
        console.log(`Fixed ${id} in ${file}`);
      }
    }
  } else if (line.trim()) {
    const match = line.match(/^(.*?):(\d+) - (.*)/);
    if (match) {
      const file = match[1].trim();
      const lineNum = parseInt(match[2], 10) - 1;
      const id = match[3].trim();
      
      // For index.ts barrel files, let's remove the export line
      if (file.endsWith('index.ts') || file.endsWith('index.tsx')) {
        const fullPath = process.cwd() + file;
        if (fs.existsSync(fullPath)) {
           const content = fs.readFileSync(fullPath, 'utf8').split('\n');
           if (content[lineNum] && content[lineNum].includes(id)) {
               // we can just comment it out or remove it. But wait, `export { id } from` might span multiple lines.
               // Let's just do a basic string replacement if it's on that line.
               console.log(`Manual fix needed for ${id} in ${file}:${lineNum + 1}`);
           }
        }
      }
    }
  }
}
