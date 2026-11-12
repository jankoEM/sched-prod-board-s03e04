// Copies app/ to dist/ and stamps the git sha of HEAD into index.html (R6). Refuses a dirty tree,
// so the sha always names the code that is in dist/.
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
if (git('status', '--porcelain', '--', 'app') && !process.argv.includes('--dirty')) {
  console.error('app/ has uncommitted changes; commit first so the sha names this build');
  process.exit(1);
}
const sha = git('rev-parse', 'HEAD');
const out = process.env.OUT_DIR || 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('app', out, { recursive: true });
const html = readFileSync(`${out}/index.html`, 'utf8').replaceAll('__BUILD_SHA__', sha);
writeFileSync(`${out}/index.html`, html);
writeFileSync(`${out}/.nojekyll`, '');
console.log(`BUILD_SHA=${sha} -> ${out}/`);
