export interface TestTask {
  id: string;
  name: string;
  prompt: string;
  type: 'research' | 'implementation' | 'knowledge';
}

export const TASKS: TestTask[] = [
  {
    id: 'file-search',
    name: '文件搜索',
    prompt: '在项目中找到所有包含 "export" 关键字的 TypeScript 文件，列出文件路径和行号',
    type: 'research',
  },
  {
    id: 'code-mod',
    name: '代码修改',
    prompt: '给 src/tool/permissions.ts 添加一个 isReadOnly 方法的测试用例并运行',
    type: 'implementation',
  },
  {
    id: 'multi-step',
    name: '多步调研',
    prompt: '分析这个项目的工具系统（Tool）的架构方案，列出所有工具和它们的职责，给出改进建议',
    type: 'research',
  },
  {
    id: 'bug-fix',
    name: 'Bug 修复',
    prompt: '找到 test/self-test.ts 中可能存在的 off-by-one 错误并修复它',
    type: 'implementation',
  },
  {
    id: 'qa',
    name: '知识问答',
    prompt: '解释这个项目的 compact 系统是如何分层工作的，每一层分别做什么',
    type: 'knowledge',
  },
];
