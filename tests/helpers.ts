import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Create an isolated temporary directory for one test. */
export async function makeTempRoot(prefix = 'skill-packs-'): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix))
}

/** Write a tree of relative paths to contents, creating parent directories. */
export async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
  }
}

/** Build one SKILL.md source with the given frontmatter fields. */
export function skillMarkdown(fields: Record<string, string | boolean>, body = '# Body\n'): string {
  const lines = ['---']
  for (const [key, value] of Object.entries(fields)) {
    lines.push(`${key}: ${typeof value === 'string' ? JSON.stringify(value) : String(value)}`)
  }
  lines.push('---', '', body)
  return lines.join('\n')
}
