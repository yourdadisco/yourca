import * as lancedb from '@lancedb/lancedb';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const BASE = path.join(os.homedir(), '.yourca', 'mempalace');
const DB_PATH = path.join(BASE, 'mempalace.lance');
const DIM = 384;

function localEmbed(text: string): number[] {
  const vec = new Array(DIM).fill(0);
  const tokens = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    let h = 0;
    for (let i = 0; i < t.length; i++) { h = ((h << 5) - h) + t.charCodeAt(i); h |= 0; }
    const idx = Math.abs(h) % DIM;
    vec[idx] += 1;
    for (let j = 1; j <= 3; j++) vec[(idx + j) % DIM] += 0.5 / j;
  }
  let mag = 0;
  for (let i = 0; i < DIM; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag);
  if (mag > 0) for (let i = 0; i < DIM; i++) vec[i] /= mag;
  return vec;
}

async function main() {
  try { fs.rmSync(BASE, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(BASE, { recursive: true });

  // Phase 1: Create table with data
  const db = await lancedb.connect(DB_PATH);
  console.log('Step 1: connect OK');

  const seedData = [{
    id: 'test_1', content: 'hello world',
    wing: 'test', room: 'test',
    sourceFile: '', chunkIndex: 0,
    addedBy: 'test', filedAt: new Date().toISOString(),
    vector: localEmbed('hello world'),
    hall: '', topic: '', type: '', agent: '', date: '',
  }];
  await db.createTable('mempalace_drawers', seedData as any);
  console.log('Step 2: createTable OK');

  // Phase 2: Query
  const table = await db.openTable('mempalace_drawers');
  console.log('Step 3: openTable OK');

  const results = await table.query().limit(5).toArray();
  console.log('Step 4: query OK, rows:', results.length);

  // Phase 3: Add more data
  const moreData = [{
    id: 'test_2', content: 'more data',
    wing: 'test', room: 'test',
    sourceFile: '', chunkIndex: 0,
    addedBy: 'test', filedAt: new Date().toISOString(),
    vector: localEmbed('more data'),
    hall: '', topic: '', type: '', agent: '', date: '',
  }];
  await table.add(moreData as any);
  console.log('Step 5: add OK');

  const results2 = await table.query().limit(5).toArray();
  console.log('Step 6: query after add OK, rows:', results2.length);

  // Phase 4: Vector search
  const qv = localEmbed('hello');
  const searchResults = await table.query().nearestTo(qv).limit(5).toArray();
  console.log('Step 7: vector search OK, results:', searchResults.length);
  for (const r of searchResults) {
    console.log('  -', r.content, '(dist:', r._distance, ')');
  }

  console.log('ALL PASS');
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
