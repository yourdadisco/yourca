import * as lancedb from '@lancedb/lancedb';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const dir = path.join(os.homedir(), '.yourca', 'mempalace');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const dbPath = path.join(dir, 'lancedb_test');

async function main() {
  try { fs.rmSync(dbPath, { recursive: true, force: true }); } catch {}

  const db = await lancedb.connect(dbPath);
  console.log('connect OK');

  const data = [{
    id: 'test_1',
    vector: new Array(384).fill(0.01),
    content: 'hello world',
    wing: 'test',
    room: 'test',
  }];
  await db.createTable('test_table', data);
  console.log('createTable OK');

  const table = await db.openTable('test_table');
  const results = await table.query().limit(5).toArray();
  console.log(`query OK: ${results.length} rows`);
  console.log(results[0]?.content);

  await db.dropTable('test_table');
  console.log('dropTable OK');

  db.close();
  console.log('ALL PASS');
}

main().catch(err => { console.error(err.message); process.exit(1); });
