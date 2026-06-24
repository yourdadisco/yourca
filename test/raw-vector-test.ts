import { VectorStorage } from '@mempalace/core';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const dir = path.join(os.homedir(), '.yourca', 'mempalace');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const dbPath = path.join(dir, 'test.lance');

async function main() {
  // Clean start
  try { fs.rmSync(dbPath, { recursive: true, force: true }); } catch {}

  const s = new VectorStorage(dbPath, 'test_table');
  await s.init();
  console.log('init() OK');

  try {
    await s.upsertDrawers([{
      id: 'test_1',
      content: 'hello world',
      wing: 'test',
      room: 'test',
      sourceFile: '',
      chunkIndex: 0,
      addedBy: 'test',
      filedAt: new Date().toISOString(),
      hall: '',
      type: '',
      agent: '',
      date: '',
    }]);
    console.log('upsertDrawers() OK');

    const results = await s.search('hello', 5);
    console.log(`search() OK: ${results.length} results`);
    for (const r of results) {
      console.log(`  [${r.similarity}] ${r.content}`);
    }
  } catch (err: any) {
    console.error('FAILED:', err.message);
    console.error(err.stack?.split('\n').slice(0, 5).join('\n'));
  }
}

main().catch(err => console.error(err));
