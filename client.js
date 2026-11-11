window.__ModuleLoader__.load({
  id: "dsh-skill-packs",
  factory: (require) => {
    const React = require("react")
    const { useCallback, useEffect, useState } = React
    const h = React.createElement

    const MODE_KEYS = ['both', 'rewrite', 'note', 'off']

    const DICTS = {
      en: {
        title: 'Skill pack references',
        settingsFile: 'Settings file',
        defaultLabel: 'Default for every pack',
        perPack: 'Per-pack override',
        inherit: 'Inherit default',
        save: 'Save',
        saving: 'Saving…',
        reset: 'Reset to default',
        reload: 'Reload',
        saved: 'Saved. The next skill load uses the new setting.',
        resetDone: 'Reset to defaults.',
        loading: 'Loading…',
        noPacks: 'No pack is enabled in this settings file.',
        'mode.both': 'Rewrite references, then add a namespace rule if a bare name remains (default)',
        'mode.rewrite': 'Rewrite references only (slash gestures and quoted Skill-tool names)',
        'mode.note': 'Leave bodies untouched; add the namespace rule when a bare name appears',
        'mode.off': 'Leave bodies untouched',
      },
      zh: {
        title: 'Skill Pack 引用处理',
        settingsFile: '配置文件',
        defaultLabel: '所有 pack 的默认行为',
        perPack: '按 pack 覆盖',
        inherit: '继承默认',
        save: '保存',
        saving: '保存中…',
        reset: '恢复默认',
        reload: '重新加载',
        saved: '已保存。下一次加载 skill 时生效。',
        resetDone: '已恢复默认。',
        loading: '加载中…',
        noPacks: '这个 settings 文件里没有启用任何 pack。',
        'mode.both': '先改写引用；若仍残留裸名，再在正文前加一段 namespace 规则（默认）',
        'mode.rewrite': '只改写引用（斜杠手势、以及同行提到 skill 的引号名）',
        'mode.note': '不改正文，只在出现裸名时加 namespace 规则',
        'mode.off': '完全不改正文',
      },
    }

    const styles = {
      page: { padding: '4px 0', maxWidth: '720px' },
      title: { margin: '0 0 6px', fontSize: '14px', fontWeight: 600 },
      hint: { margin: '2px 0 10px', fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #666)' },
      code: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' },
      label: { display: 'block', margin: '14px 0 4px', fontSize: '12px', fontWeight: 600 },
      select: {
        width: '100%',
        boxSizing: 'border-box',
        fontSize: '12px',
        padding: '5px 8px',
        border: '1px solid var(--dsw-alias-border-l2, #ccc)',
        borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-1, #fff)',
        color: 'inherit',
      },
      packRow: { display: 'flex', alignItems: 'center', gap: '10px', margin: '6px 0' },
      packName: { flex: '0 0 220px', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis' },
      packSelect: { flex: '1 1 auto' },
      row: { display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' },
      button: { padding: '5px 12px', borderRadius: '6px', border: '1px solid #333', background: '#222', color: '#fff', cursor: 'pointer' },
      button2: { padding: '5px 12px', borderRadius: '6px', border: '1px solid #bbb', background: '#fff', color: '#222', cursor: 'pointer' },
      error: { color: '#b00020', fontSize: '12px' },
      ok: { color: '#0a7a33', fontSize: '12px' },
    }

    function modeOptions(t, inheritLabel) {
      const entries = inheritLabel === undefined
        ? MODE_KEYS.map((key) => [key, t(`mode.${key}`)])
        : [['', inheritLabel]].concat(MODE_KEYS.map((key) => [key, t(`mode.${key}`)]))
      return entries.map(([value, text]) => h('option', { key: value || 'inherit', value }, text))
    }

    function Page(props) {
      if (props.view === 'summary') return null

      const [state, setState] = useState({ loading: true, packRoot: '', settingsPath: '' })
      const [mode, setMode] = useState('both')
      const [overrides, setOverrides] = useState({})
      const [status, setStatus] = useState('')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [, setRevision] = useState(0)

      // Re-render on a locale switch in the host shell.
      useEffect(() => props.locale.subscribe(() => setRevision((value) => value + 1)), [props.locale])

      const t = props.t

      const applyState = useCallback((data) => {
        setState({ ...data, loading: false })
        setMode(data.config && data.config.references ? data.config.references.mode : 'both')
        const next = {}
        const packs = data.config && data.config.packs ? data.config.packs : {}
        for (const [pack, value] of Object.entries(packs)) {
          if (value && typeof value.mode === 'string') next[pack] = value.mode
        }
        setOverrides(next)
      }, [])

      const load = useCallback(async () => {
        setError('')
        try {
          const res = await fetch('/skill-packs/state', { credentials: 'same-origin' })
          const text = await res.text()
          if (!res.ok) throw new Error(text || `HTTP ${res.status}`)
          applyState(JSON.parse(text))
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setState((prev) => ({ ...prev, loading: false }))
        }
      }, [applyState])

      useEffect(() => { load() }, [load])

      const save = useCallback(async () => {
        setBusy(true)
        setStatus('')
        setError('')
        try {
          const packs = {}
          for (const [pack, value] of Object.entries(overrides)) {
            if (typeof value === 'string' && value !== '') packs[pack] = { mode: value }
          }
          const config = {
            references: { mode },
            ...(Object.keys(packs).length === 0 ? {} : { packs }),
          }
          const res = await fetch('/skill-packs/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ config }),
          })
          const text = await res.text()
          let data = {}
          try { data = text ? JSON.parse(text) : {} } catch { data = {} }
          if (!res.ok) throw new Error(data.error || text || `HTTP ${res.status}`)
          applyState(data)
          setStatus(t('saved'))
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          setBusy(false)
        }
      }, [applyState, mode, overrides, t])

      const reset = useCallback(async () => {
        setBusy(true)
        setStatus('')
        setError('')
        try {
          const res = await fetch('/skill-packs/reset', { method: 'POST', credentials: 'same-origin' })
          const text = await res.text()
          let data = {}
          try { data = text ? JSON.parse(text) : {} } catch { data = {} }
          if (!res.ok) throw new Error(data.error || text || `HTTP ${res.status}`)
          applyState(data)
          setStatus(t('resetDone'))
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          setBusy(false)
        }
      }, [applyState, t])

      const enabledPacks = Object.keys(state.packs || {}).filter((pack) => state.packs[pack] === true).sort()

      return h('div', { style: styles.page },
        h('h3', { style: styles.title }, t('title')),
        h('p', { style: styles.hint },
          t('settingsFile'), ': ', h('code', { style: styles.code }, state.settingsPath || ''),
        ),
        state.loading
          ? h('p', null, t('loading'))
          : h('div', null,
              h('label', { style: styles.label, htmlFor: 'skill-packs-mode' }, t('defaultLabel')),
              h('select', {
                id: 'skill-packs-mode',
                value: mode,
                onChange: (e) => setMode(e.target.value),
                style: styles.select,
              }, modeOptions(t, undefined)),
              enabledPacks.length === 0
                ? h('p', { style: styles.hint }, t('noPacks'))
                : h('div', null,
                    h('span', { style: styles.label }, t('perPack')),
                    enabledPacks.map((pack) => h('div', { key: pack, style: styles.packRow },
                      h('span', { style: styles.packName, title: pack }, pack),
                      h('select', {
                        value: overrides[pack] || '',
                        onChange: (e) => {
                          const next = { ...overrides }
                          if (e.target.value === '') delete next[pack]
                          else next[pack] = e.target.value
                          setOverrides(next)
                        },
                        style: { ...styles.select, ...styles.packSelect },
                      }, modeOptions(t, t('inherit'))),
                    )),
                  ),
            ),
        h('div', { style: styles.row },
          h('button', { onClick: save, disabled: busy, style: styles.button }, busy ? t('saving') : t('save')),
          h('button', { onClick: reset, disabled: busy, style: styles.button2 }, t('reset')),
          h('button', { onClick: load, disabled: busy, style: styles.button2 }, t('reload')),
        ),
        error ? h('p', { style: styles.error }, error) : null,
        status ? h('p', { style: styles.ok }, status) : null,
      )
    }

    const inject = ['slots', 'locale']

    function apply(ctx) {
      for (const [locale, dict] of Object.entries(DICTS)) {
        ctx.effect(() => ctx.locale.register('skill-packs', locale, dict))
      }
      const t = ctx.locale.bind('skill-packs')
      const locale = ctx.locale
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: 'dsh-skill-packs',
      }, (props) => h(Page, { ...props, t, locale })))
    }

    const module = { exports: {} }
    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  }
})
