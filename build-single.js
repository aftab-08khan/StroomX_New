// Bundles the site into ONE self-contained HTML file (fonts, shapes, icons, GSAP and scripts inlined),
// so it opens by double-click with no server and no outside requests.
// Usage: node build-single.js [output path]
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = process.argv[2] || path.join(root, 'StroomX.html');
const mime = { '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.webp': 'image/webp', '.png': 'image/png' };
const dataUri = (file) => `data:${mime[path.extname(file)]};base64,${fs.readFileSync(file).toString('base64')}`;

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// CSS: inline every url(...) as a data URI, then inline the stylesheet itself
let css = fs.readFileSync(path.join(root, 'css/site.css'), 'utf8');
css = css.replace(/url\('([^')]+)'\)/g, (m, rel) => `url('${dataUri(path.join(root, 'css', rel))}')`);
html = html.replace('<link rel="stylesheet" href="css/site.css">', () => `<style>\n${css}</style>`);

// Images referenced from the HTML
html = html.replace(/src="(assets\/[^"]+)"/g, (m, rel) => `src="${dataUri(path.join(root, rel))}"`);

// Scripts
html = html.replace(/<script src="([^"]+)" defer><\/script>/g, (m, rel) =>
  `<script>\n${fs.readFileSync(path.join(root, rel), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);
html = html.replace('<!-- GSAP is served from this folder (vendor/gsap), not from a CDN -->', '<!-- GSAP 3.15 and the site script are inlined below; this file makes no outside requests -->');

fs.writeFileSync(out, html);
const left = (html.match(/(?:src|href)="(?!#|https?:|mailto:|tel:|data:)[^"]+"/g) || []);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB` + (left.length ? `, unresolved local refs: ${left.join(' ')}` : ', no local file references left'));
