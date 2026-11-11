import { readFileSync } from 'node:fs'
const body = readFileSync('.tmp/expected.md', 'utf8')
const names = [
'mattpocock-skills-ask-matt','mattpocock-skills-diagnosing-bugs','mattpocock-skills-grill-with-docs','mattpocock-skills-triage','mattpocock-skills-improve-codebase-architecture','mattpocock-skills-setup-matt-pocock-skills','mattpocock-skills-tdd','mattpocock-skills-to-spec','mattpocock-skills-to-tickets','mattpocock-skills-wayfinder','mattpocock-skills-implement','mattpocock-skills-implement-spec','mattpocock-skills-prototype','mattpocock-skills-research','mattpocock-skills-domain-modeling','mattpocock-skills-codebase-design','mattpocock-skills-code-review','mattpocock-skills-pr','mattpocock-skills-retro','mattpocock-skills-wizard','mattpocock-skills-grill-me','mattpocock-skills-grilling','mattpocock-skills-handoff','mattpocock-skills-teach','mattpocock-skills-to-questionnaire','mattpocock-skills-wait-what','mattpocock-skills-writing-for-agents']
const refs = [...body.matchAll(/(?<![:/])\/([a-z0-9][a-z0-9-]*)/g)].map(m => m[1])
const namespaced = refs.filter(r => r.startsWith('mattpocock-skills-'))
const bare = refs.filter(r => !r.startsWith('mattpocock-skills-'))
const unknown = [...new Set(namespaced)].filter(n => !names.includes(n))
const canonicalMissing = names.filter(n => !body.includes('/' + n))
console.log(JSON.stringify({
  slashRefs: refs.length,
  namespacedRefs: namespaced.length,
  bareRefs: [...new Set(bare)],
  unknownNamespaced: unknown,
  skillsNeverMentionedBySlash: canonicalMissing,
  doublePrefix: /mattpocock-skills-mattpocock-skills/.test(body),
  notePrepended: body.startsWith('> **Pack namespace.**'),
}, null, 2))
