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
    // Fallback to manual recursion for older Node versions
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

function build() {
  console.log('Building dist/');
  rmrf(dist);
  mkdirp(dist);

  const topFiles = ['index.html', 'README.md', 'app.js'];
  for (const f of topFiles) {
    const src = path.join(root, f);
    const dst = path.join(dist, f);
    if (!fs.existsSync(src)) continue;
    if (f === 'index.html') {
      const html = fs.readFileSync(src, 'utf8');
      const cleaned = stripLiveReload(html);
      fs.writeFileSync(dst, cleaned, 'utf8');
    } else {
      copyFile(src, dst);
    }
  }

  const srcDir = path.join(root, 'src');
  if (fs.existsSync(srcDir)) copyDir(srcDir, path.join(dist, 'src'), { exclude: ['__tests__'] });

  const stylesDir = path.join(root, 'styles');
  if (fs.existsSync(stylesDir)) copyDir(stylesDir, path.join(dist, 'styles'));

  const samples = path.join(root, 'samples');
  if (fs.existsSync(samples)) copyDir(samples, path.join(dist, 'samples'));

  console.log('Build complete — dist/ is ready');
}

build();
