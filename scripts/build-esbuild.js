const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  try {
    fs.rmSync(p, { recursive: true, force: true });
    return;
  } catch (e) {
    // fallback
  }
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(p)) rmrf(path.join(p, name));
    fs.rmdirSync(p);
  } else {
    fs.unlinkSync(p);
  }
}

function mkdirp(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest, opts = {}) {
  if (!fs.existsSync(src)) return;
  mkdirp(dest);
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      if (opts.exclude?.includes(entry)) continue;
      copyDir(srcPath, destPath, opts);
    } else {
      if (opts.excludeFiles?.includes(entry)) continue;
      copyFile(srcPath, destPath);
    }
  }
}

function stripLiveReload(html) {
  return html.replace(
    /<script[^>]*src=["'](?:\/livereload|\.\/livereload|livereload)\.js["'][^>]*>\s*<\/script>\s*/i,
    ''
  );
}

async function build() {
  console.log('esbuild: starting');
  rmrf(dist);
  mkdirp(dist);

  // Bundle JS into dist/app.js
  await esbuild.build({
    entryPoints: [path.join(root, 'app.js')],
    bundle: true,
    minify: true,
    sourcemap: false,
    format: 'esm',
    target: ['es2020'],
    outdir: dist,
    entryNames: '[name]',
    splitting: false,
    logLevel: 'info',
  });

  // Copy and sanitize index.html (remove live-reload script)
  const indexSrc = path.join(root, 'index.html');
  if (fs.existsSync(indexSrc)) {
    const html = fs.readFileSync(indexSrc, 'utf8');
    const cleaned = stripLiveReload(html);
    fs.writeFileSync(path.join(dist, 'index.html'), cleaned, 'utf8');
  }

  // Copy static assets
  const assets = ['styles.css', 'tokens.css', 'utilities.css', 'README.md'];
  for (const a of assets) {
    const src = path.join(root, a);
    if (fs.existsSync(src)) copyFile(src, path.join(dist, a));
  }

  // Copy samples (if present)
  const samples = path.join(root, 'samples');
  if (fs.existsSync(samples)) copyDir(samples, path.join(dist, 'samples'));

  console.log('esbuild: build complete — dist/ is ready');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
