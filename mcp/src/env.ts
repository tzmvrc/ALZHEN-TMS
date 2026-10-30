import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Resolve from this package, not the shell's working directory. The root
// `npm run mcp` command and `npm --prefix mcp start` load the same settings.
config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
