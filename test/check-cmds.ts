import { findCommand } from '../src/commands/index.js';
for (const name of ['goal', 'memory', 'role', 'coordinator']) {
  const cmd = findCommand(name);
  console.log(`${name}: ${cmd ? cmd.name : 'NOT FOUND'}`);
}
