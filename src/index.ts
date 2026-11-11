/**
 * `dsh-skill-packs` — mount whole skill repositories into the harness.
 *
 * This plugin owns a sibling provider in `ctx.skills`; it never replaces or
 * reconfigures `skill-filesystem`, and it never injects skill bodies itself.
 * Core's `/name` gesture, the `skill` tool and the client menu all read the
 * registry, so putting names there is the whole job (ADR 0005).
 *
 * It also serves its own configuration page: the pack-root settings are
 * invisible to the harness config editor (which owns the profile patch), so the
 * plugin exposes `GET /skill-packs/state` and `POST /skill-packs/save` for the
 * client half registered on the Plugins page. Options live in `config.json`
 * beside the enable table, which stays hand-editable and untouched by the UI.
 * @module dsh-skill-packs
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

import { type Config, resolveConfig } from './config'
import {
  DEFAULT_PLUGIN_CONFIG,
  OPTIONS_FILE,
  parsePluginConfig,
  type PluginConfig,
  readOptions,
  writeOptions,
} from './options'
import { createProvider } from './provider'
import { readEnableTable, SETTINGS_FILE } from './settings'
import { watchPackRoot } from './watch'

/** Cordis plugin name. */
export const name = 'skill-packs'
/** Service this plugin needs before it can register anything. */
export const inject = ['skills']

interface HttpRequest {
  readonly method?: string | undefined
  readonly socket?: { readonly remoteAddress?: string | undefined } | undefined
  on(event: 'data', listener: (chunk: Uint8Array | string) => void): unknown
  on(event: 'end', listener: () => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

interface HttpResponse {
  writeHead(status: number, headers?: Record<string, string>): unknown
  end(body?: string): unknown
}

interface WebServerLike {
  register(route: {
    readonly kind: 'exact'
    readonly path: string
    readonly handler: (request: HttpRequest, response: HttpResponse) => void
  }): () => void
}

/** What the configuration page reads and writes. */
interface StatePayload {
  readonly config: PluginConfig
  readonly packs: Record<string, boolean>
  readonly packRoot: string
  readonly settingsPath: string
  readonly configPath: string
}

/** Absolute paths of the two pack-root documents. */
interface PackPaths {
  readonly packRoot: string
  readonly settingsPath: string
  readonly configPath: string
}

/**
 * Register the pack provider, watch the pack root, and serve the settings page.
 * @param ctx - host context carrying the skill registry.
 * @param config - optional pack root override.
 */
export function apply(ctx: Context, config?: Config): void {
  const resolved = resolveConfig(config)
  const paths: PackPaths = {
    packRoot: resolved.packRoot,
    settingsPath: join(resolved.packRoot, SETTINGS_FILE),
    configPath: join(resolved.packRoot, OPTIONS_FILE),
  }
  const warn = (message: string): void => {
    ctx.logger.warn(`skill-packs: ${message}`)
  }

  const provider = createProvider({ config: resolved, warn })
  let invalidate: (() => void) | undefined
  ctx.skills.registerProvider((control) => {
    invalidate = control.invalidate
    return provider
  })

  ctx.effect(() => {
    const watcher = watchPackRoot(resolved.packRoot, () => {
      invalidate?.()
    })
    return () => {
      void watcher.close()
    }
  })

  // `webServer` is a service from the web bundle: it may not exist yet when this
  // profile-level plugin applies, so wait for it instead of probing `ctx.get`.
  // Probing returns undefined on a cold start and the routes would never exist.
  const pendingRoutes: Array<{
    readonly path: string
    readonly handler: (request: HttpRequest, response: HttpResponse) => void
  }> = []
  const route = (path: string, handler: (request: HttpRequest, response: HttpResponse) => void): void => {
    pendingRoutes.push({ path, handler })
  }
  const injectable = ctx as unknown as {
    inject(deps: readonly string[], callback: (scope: Context & { webServer: WebServerLike }) => void): void
  }

  route('/skill-packs/state', (request, response) => {
    if (!isLoopback(request)) return sendJson(response, 403, { error: 'loopback only' })
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'method not allowed' })
    void statePayload(paths)
      .then((payload) => sendJson(response, 200, payload))
      .catch((error: unknown) => sendJson(response, 500, { error: messageOf(error) }))
  })

  route('/skill-packs/save', (request, response) => {
    if (!isLoopback(request)) return sendJson(response, 403, { error: 'loopback only' })
    if (request.method !== 'POST') return sendJson(response, 405, { error: 'method not allowed' })
    void (async () => {
      const body = await readJsonBody(request)
      const parsed = parsePluginConfig(body.config, 'config')
      if (parsed.problems.length > 0) {
        sendJson(response, 400, { error: parsed.problems.join('; ') })
        return
      }
      await writeOptions(paths.configPath, parsed.config)
      invalidate?.()
      sendJson(response, 200, await statePayload(paths))
    })().catch((error: unknown) => sendJson(response, 400, { error: messageOf(error) }))
  })

  route('/skill-packs/reset', (request, response) => {
    if (!isLoopback(request)) return sendJson(response, 403, { error: 'loopback only' })
    if (request.method !== 'POST') return sendJson(response, 405, { error: 'method not allowed' })
    void (async () => {
      await writeOptions(paths.configPath, DEFAULT_PLUGIN_CONFIG)
      invalidate?.()
      sendJson(response, 200, await statePayload(paths))
    })().catch((error: unknown) => sendJson(response, 400, { error: messageOf(error) }))
  })

  injectable.inject(['webServer'], (web) => {
    for (const pending of pendingRoutes) {
      web.effect(() => web.webServer.register({
        kind: 'exact',
        path: pending.path,
        handler: pending.handler,
      }))
    }
    ctx.logger.info(`skill-packs: ${pendingRoutes.length} configuration routes registered`)
  })
}

async function statePayload(paths: PackPaths): Promise<StatePayload> {
  const settings = await readEnableTable(paths.settingsPath)
  const options = await readOptions(paths.configPath)
  const packs: Record<string, boolean> = {}
  for (const [key, value] of [...settings.table].sort(([left], [right]) => left.localeCompare(right))) {
    packs[key] = value
  }
  return {
    config: options.config,
    packs,
    packRoot: paths.packRoot,
    settingsPath: paths.settingsPath,
    configPath: paths.configPath,
  }
}

function isLoopback(request: HttpRequest): boolean {
  const address = request.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function sendJson(response: HttpResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

async function readJsonBody(request: HttpRequest): Promise<Record<string, unknown>> {
  const chunks: string[] = []
  await new Promise<void>((resolve, reject) => {
    request.on('data', (chunk) => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
    })
    request.on('end', () => {
      resolve()
    })
    request.on('error', (error) => {
      reject(error)
    })
  })
  const raw = chunks.join('')
  if (raw.length === 0) return {}
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('body must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type { Config } from './config'
