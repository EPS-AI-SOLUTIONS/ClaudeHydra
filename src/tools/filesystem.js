import fs from 'fs';
import path from 'path';
import Logger from '../logger.js';
import { ValidationError } from '../errors/AppError.js';

// Utility to block path traversal
function resolveSafePath(relativePath) {
  const rootDir = process.cwd();
  const resolvedPath = path.resolve(rootDir, relativePath);
  
  if (!resolvedPath.startsWith(rootDir)) {
    throw new ValidationError(`Access denied: Path '${relativePath}' is outside the project root.`);
  }
  return resolvedPath;
}

const listDirectoryTool = {
  name: 'list_directory',
  description: 'List contents of a directory',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to directory' }
    },
    required: ['path']
  },
  execute: async ({ path: dirPath }) => {
    Logger.info(`Listing directory: ${dirPath}`);
    const safePath = resolveSafePath(dirPath);
    
    if (!fs.existsSync(safePath)) {
      throw new ValidationError(`Directory not found: ${dirPath}`);
    }

    const items = fs.readdirSync(safePath, { withFileTypes: true });
    return items.map(item => ({
      name: item.name,
      type: item.isDirectory() ? 'DIR' : 'FILE'
    }));
  }
};

const readFileTool = {
  name: 'read_file',
  description: 'Read file content',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to file' }
    },
    required: ['path']
  },
  execute: async ({ path: filePath }) => {
    Logger.info(`Reading file: ${filePath}`);
    const safePath = resolveSafePath(filePath);
    
    if (!fs.existsSync(safePath)) {
      throw new ValidationError(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(safePath, 'utf8');
    if (content.length > 100000) {
      return content.substring(0, 100000) + '\n...[TRUNCATED]';
    }
    return content;
  }
};

const writeFileTool = {
  name: 'write_file',
  description: 'Write content to a file',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' }
    },
    required: ['path', 'content']
  },
  execute: async ({ path: filePath, content }) => {
    Logger.info(`Writing file: ${filePath}`);
    const safePath = resolveSafePath(filePath);
    const dir = path.dirname(safePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(safePath, content, 'utf8');
    return { success: true, path: filePath };
  }
};

export default [listDirectoryTool, readFileTool, writeFileTool];