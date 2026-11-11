import { readFileSync, writeFileSync } from 'node:fs'
import zlib from 'node:zlib'
const [p, dest] = process.argv.slice(2)
const buf = readFileSync(p)
const out = zlib.zstdDecompressSync(buf)
writeFileSync(dest, out)
const text = out.toString('utf8')
console.log('bytes', out.length, 'lines', text.split('\n').length)
