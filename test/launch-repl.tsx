/**
 * Launch YourCA Ink REPL — run with: npx tsx test/launch-repl.tsx
 */
import { startInkREPL } from '../src/ui/repl-screen.js';

startInkREPL().catch(err => {
  console.error('REPL error:', err);
  process.exit(1);
});
