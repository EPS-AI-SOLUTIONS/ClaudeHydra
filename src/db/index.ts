import fs from 'fs';
import path from 'path';

export class JsonDbAdapter {
  constructor(filename = 'db.json') {
    this.dbPath = path.join(process.cwd(), '.hydra-data', filename);
    this.data = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const fileContent = fs.readFileSync(this.dbPath, 'utf8');
        this.data = JSON.parse(fileContent);
      } else {
        this.save(); // Create empty DB
      }
    } catch (error) {
      console.error('Database load error:', error);
      this.data = {};
    }
  }

  save() {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Database save error:', error);
    }
  }

  get(collection) {
    return this.data[collection] || [];
  }

  set(collection, items) {
    this.data[collection] = items;
    this.save();
  }

  push(collection, item) {
    if (!this.data[collection]) this.data[collection] = [];
    this.data[collection].push(item);
    this.save();
  }

  find(collection, predicate) {
    const list = this.get(collection);
    return list.find(predicate);
  }
}