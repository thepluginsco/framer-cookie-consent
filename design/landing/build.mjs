// Builds the standalone landing page (index.html) from the design-canvas
// artboards, so the canvas and the localhost preview never drift. The canvas
// caps an artboard at 8000px, so the page is split in two artboards
// (Main = hero → platforms, Landing-2 = features → footer); this stitches them.
//   node design/landing/build.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (f) => readFileSync(join(here, f), 'utf8')
const parts = ['Main.dc.html', 'Landing-2.dc.html'].map(read)

// Canvas asset ids → local files in img/.
const blobs = JSON.parse(read('img/blobs.json'))

const helmet = parts[0].match(/<helmet>([\s\S]*?)<\/helmet>/)[1]
const pageInner = (src) =>
  src.match(/<\/helmet>([\s\S]*?)<\/x-dc>/)[1].trim()
    .replace(/^<div class="page" style="[^"]*">/, '').replace(/<\/div>$/, '')
let body = `<div class="page">${parts.map(pageInner).join('\n')}</div>`

// Rules only the second artboard carries (image styles for its sections).
const helmet2 = parts[1].match(/\/\* ── 3D mascot art \+ iris texture ── \*\/([\s\S]*?)@media \(prefers-reduced-motion/)[1]

const unblob = (s) => s.replace(/\/_blob\/([0-9a-f]{32})/g, (m, id) => {
  if (!blobs[id]) throw new Error('unknown canvas asset ' + id)
  return blobs[id]
})

body = unblob(body)
  .replace(/ onClick="\{\{[^}]+\}\}"/g, '')
  .replace(/<div class="\{\{billCls\}\}">/, '<div>')
  .replace(/ \{\{billCls\}\}/g, '')
  .replace(/<section class="pricing"/, '<section class="pricing bill-m"')
  .replace(/ \{\{f0\}\}/, ' open')
  .replace(/ \{\{f\d\}\}/g, '')

if (/\{\{/.test(body)) throw new Error('unconverted template hole left in body')

const extraCss = readFileSync(join(here, 'responsive.css'), 'utf8')
const js = readFileSync(join(here, 'interactions.js'), 'utf8')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Consentful — Cookie consent that actually blocks the cookies</title>
<meta name="description" content="Consentful blocks trackers until visitors consent, sends Google Consent Mode v2 signals, and installs natively on Framer, Webflow, WordPress, Shopify, Wix and any HTML site.">
<meta name="theme-color" content="#4b23d3">
<meta property="og:image" content="img/mascot-hero.webp">
${unblob(helmet.trim())}
<style>
${unblob(helmet2.trim())}
${extraCss.trim()}
</style>
</head>
<body>
${body.trim()}
<script>
${js.trim()}
</script>
</body>
</html>
`
writeFileSync(join(here, 'index.html'), html)
console.log('wrote design/landing/index.html', (html.length / 1024).toFixed(1) + ' KB')
