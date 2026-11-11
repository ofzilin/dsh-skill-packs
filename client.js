window.__ModuleLoader__.load({
  id: "dsh-skill-packs",
  factory: (require) => {
    const React = require("react")
    const { useCallback, useEffect, useState } = React
    const h = React.createElement

    const MODES = [
      ['both', 'Rewrite references, then add a namespace rule if a bare name remains (default)'],
      ['rewrite', 'Rewrite references only (slash gestures and quoted Skill-tool names)'],
      ['note', 'Leave bodies untouched; add the namespace rule when a bare name appears'],
      ['off', 'Leave bodies untouched'],
    ]

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

    function modeOptions(inheritLabel) {
      const options = inheritLabel === undefined
        ? MODES
        : [['', inheritLabel]].concat(MODES)
      return options.map(([value, text]) => h('option', { key: value || 'inherit', value }, text))
    }

    function Page(props) {
      if (props.view === 'summary') return null

      const [state, setState] = useState({ loading: true, packRoot: '', settingsPath: '' })
      const [mode, setMode] = useState('both')
      const [overrides, setOverrides] = useState({})
      const [status, setStatus] = useState('')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)

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
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          applyState(data)
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
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          applyState(data)
          setStatus('Saved. The next skill load uses the new setting.')
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          setBusy(false)
        }
      }, [applyState, mode, overrides])

      const reset = useCallback(async () => {
        setBusy(true)
        setStatus('')
        setError('')
        try {
          const res = await fetch('/skill-packs/reset', { method: 'POST', credentials: 'same-origin' })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          applyState(data)
          setStatus('Reset to defaults.')
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          setBusy(false)
        }
      }, [applyState])

      const enabledPacks = Object.keys(state.packs || {}).filter((pack) => state.packs[pack] === true).sort()

      return h('div', { style: styles.page },
        h('h3', { style: styles.title }, 'Skill pack references'),
        h('p', { style: styles.hint },
          'Settings file: ', h('code', { style: styles.code }, state.settingsPath || ''),
        ),
        state.loading
          ? h('p', null, 'Loading…')
          : h('div', null,
              h('label', { style: styles.label, htmlFor: 'skill-packs-mode' }, 'Default for every pack'),
              h('select', {
                id: 'skill-packs-mode',
                value: mode,
                onChange: (e) => setMode(e.target.value),
                style: styles.select,
              }, modeOptions(undefined)),
              enabledPacks.length === 0
                ? h('p', { style: styles.hint }, 'No pack is enabled in this settings file.')
                : h('div', null,
                    h('span', { style: styles.label }, 'Per-pack override'),
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
                      }, modeOptions('Inherit default')),
                    )),
                  ),
            ),
        h('div', { style: styles.row },
          h('button', { onClick: save, disabled: busy, style: styles.button }, busy ? 'Saving…' : 'Save'),
          h('button', { onClick: reset, disabled: busy, style: styles.button2 }, 'Reset to default'),
          h('button', { onClick: load, disabled: busy, style: styles.button2 }, 'Reload'),
        ),
        error ? h('p', { style: styles.error }, error) : null,
        status ? h('p', { style: styles.ok }, status) : null,
      )
    }

    const inject = ['slots']

    function apply(ctx) {
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: 'dsh-skill-packs',
      }, Page))
    }

    const module = { exports: {} }
    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  }
})
