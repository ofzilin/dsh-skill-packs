import { readFileSync, writeFileSync } from 'node:fs'
const lines = readFileSync('.tmp/session.jsonl', 'utf8').split('\n').filter(Boolean)
function walk(value, hits) {
  if (typeof value === 'string') {
    if (value.includes('<skill_content name=')) hits.push(value)
  } else if (Array.isArray(value)) value.forEach(v => walk(v, hits))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => walk(v, hits))
}
const hits = []
for (const line of lines) { try { walk(JSON.parse(line), hits) } catch {} }
console.log('strings with block:', hits.length)
const block = hits.at(-1)
const m = block.match(/<skill_content name="([^"]+)">([\s\S]*?)<\/skill_content>/)
if (!m) { console.log(block.slice(0, 300)); process.exit(2) }
const inner = m[2].match(/<skill_instructions>([\s\S]*?)<\/skill_instructions>/)[1]
writeFileSync('.tmp/injected.md', inner.replace(/^\n/, ''))
console.log('name:', m[1], 'chars:', inner.length, 'lines:', inner.split('\n').length)
