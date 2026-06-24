import { chunkText } from '@mempalace/core';

const testContent = '用户偏好使用 TypeScript，喜欢显式类型标注，当前项目使用 React 18';
const chunks = chunkText(testContent);
console.log('chunkText result:', JSON.stringify(chunks));
console.log('chunks length:', chunks.length);
for (const c of chunks) {
  console.log(`  [${c.chunkIndex}] len=${c.content.length}: "${c.content.slice(0, 50)}"`);
}
