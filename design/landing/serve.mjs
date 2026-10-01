// Zero-dependency static server for the landing preview: node design/landing/serve.mjs
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT ?? 5000)
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' }

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '')
  const file = join(root, path === '' || path === '.' ? 'index.html' : path)
  if (!file.startsWith(root)) { res.writeHead(403).end(); return }
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
  }
}).listen(port, () => console.log(`Consentful landing → http://localhost:${port}`))
