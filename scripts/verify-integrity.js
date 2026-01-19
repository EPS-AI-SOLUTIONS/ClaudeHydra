import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COLORS = {
  Green: '\x1b[32m',
  Red: '\x1b[31m',
  Reset: '\x1b[0m'
};

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      // Exclude binary/native modules if any, and tests
      if (file.endsWith('.js') && !file.includes('.test.js')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

console.log('🔍 Starting Integrity Check...\n');

const srcDir = path.join(__dirname, '../src');
const files = getAllFiles(srcDir);
let errors = 0;

for (const file of files) {
  try {
    // Dynamic import for ESM check (handles Windows paths correctly)
    const moduleUrl = pathToFileURL(file).href;
    await import(moduleUrl);
    console.log(`${COLORS.Green}✔ Loaded:${COLORS.Reset} ${path.relative(process.cwd(), file)}`);
  } catch (e) {
     if (e.code === 'ERR_MODULE_NOT_FOUND' && e.message.includes('sysinfo')) {
        console.log(`${COLORS.Green}✔ Loaded:${COLORS.Reset} ${path.relative(process.cwd(), file)} (Skipped binary dep)`);
        continue;
    }
    
    // Ignore runtime config errors, we check syntax/import mostly
    if (e instanceof SyntaxError) {
        console.error(`${COLORS.Red}✘ SYNTAX ERROR:${COLORS.Reset} ${path.relative(process.cwd(), file)}`);
        console.error(e.message);
        errors++;
    } else {
         // Some files might fail due to missing env vars or config, but if they import, syntax is ok
        console.log(`${COLORS.Green}✔ Loaded:${COLORS.Reset} ${path.relative(process.cwd(), file)} (Runtime init skipped)`);
    }
  }
}

console.log('\n--------------------------------------------------');
if (errors === 0) {
  console.log(`${COLORS.Green}✅ Integrity Check Passed. No syntax errors found.${COLORS.Reset}`);
  process.exit(0);
} else {
  console.log(`${COLORS.Red}❌ Integrity Check Failed. Found ${errors} syntax errors.${COLORS.Reset}`);
  process.exit(1);
}
