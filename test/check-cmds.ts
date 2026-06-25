import { findCommand } from '../src/commands/index.js';
const cmds = ['memory', 'role', 'goal', 'coordinator'];
for (const name of cmds) {
  const cmd = findCommand(name);
  console.log(`${name}: ${cmd ? '✅ ' + cmd.description : '❌ NOT FOUND'}`);
}
