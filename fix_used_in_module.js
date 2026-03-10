const fs = require('fs');
const { execSync } = require('child_process');

const output = execSync('npx ts-prune').toString();
const lines = output.split('\n');

for (const line of lines) {
  if (line.includes('(used in module)')) {
    const match = line.match(/^(.*?):(\d+) - (.*?) \\(used in module\\)/);
    if (match) {
      const file = match[1].trim();
      const lineNum = parseInt(match[2], 10) - 1;
      const id = match[3].trim();
      
      const fullPath = process.cwd() + file;
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8').split('\n');
        content[lineNum] = content[lineNum].replace(/export\\s+/, '');
        fs.writeFileSync(fullPath, content.join('\n'));
        console.log(\Fixed \ in \\);
      }
    }
  }
}
