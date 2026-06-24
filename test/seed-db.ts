import * as lancedb from '@lancedb/lancedb';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const dbPath = path.join(os.homedir(), '.yourca', 'mempalace', 'mempalace.lance');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

async function main() {
  try { fs.rmSync(dbPath, { recursive: true, force: true }); } catch {}

  const db = await lancedb.connect(dbPath);
  const vec = new Array(384).fill(0.01);
  await db.createTable('mempalace_drawers', [{
    id: '_schema_seed',
    vector: vec,
    content: 'seed',
    wing: 'internal', room: 'internal',
    sourceFile: '', chunkIndex: 0,
    addedBy: 'system', filedAt: new Date().toISOString(),
    hall: '', topic: '', type: '', agent: '', date: '',
  }]);
  console.log('DB seeded OK');
  db.close();
}

main().catch(e => console.error('Seed failed:', e));
