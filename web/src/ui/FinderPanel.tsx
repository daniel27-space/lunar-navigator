// Site finder controls: say what the mission needs, see how much ground is left and which
// limit removes the most, then pick from a ranked shortlist. (Patterns: goal presets and a
// live "passing area" readout from GIS suitability tools; map-and-shortlist from property
// search; docs/research/design-references.md.)
import { PRESETS, type Candidate, type FinderCriteria, type FinderResult, type Prefer } from '../lib/finder'
import { useStore } from '../store'

const pct = (v: number) => `${Math.round(v * 100)}%`
const fmtLat = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? 'S' : 'N'}`
const fmtLon = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? 'W' : 'E'}`

function PreferSwitch({ value, onChange, more, less }: { value: Prefer; onChange: (p: Prefer) => void; more: string; less: string }) {
  const opts: [Prefer, string][] = [
    ['high', more],
    ['low', less],
    ['none', 'Either'],
  ]
  return (
    <div className="seg" role="group">
      {opts.map(([v, label]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Range({
  label,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string
  min: number
  max: number
  onMin: (v: number) => void
  onMax: (v: number) => void
}) {
  return (
    <div className="range2">
      <span>
        {label} between {pct(min)} and {pct(max)} of the time
      </span>
      <div>
        <input type="range" min={0} max={1} step={0.05} value={min} aria-label={`${label}, at least`} onChange={(e) => onMin(Math.min(Number(e.target.value), max))} />
        <input type="range" min={0} max={1} step={0.05} value={max} aria-label={`${label}, at most`} onChange={(e) => onMax(Math.max(Number(e.target.value), min))} />
      </div>
    </div>
  )
}

interface Props {
  result: FinderResult | null
  /** total mapped area in km2, for the share readout */
  onPick: (c: Candidate) => void
  onCompareTop: (cs: Candidate[]) => void
}

export function FinderPanel({ result, onPick, onCompareTop }: Props) {
  const c = useStore((s) => s.finder)
  const preset = useStore((s) => s.preset)
  const set = useStore((s) => s.setFinder)
  const applyPreset = useStore((s) => s.applyPreset)
  const blurb = PRESETS.find((p) => p.id === preset)?.blurb ?? 'Your own limits.'

  const limits: [string, number][] = result
    ? [
        ['Slope', result.passAlone.slope],
        ['Sunlight', result.passAlone.sun],
        ['Earth view', result.passAlone.earth],
        ['Shadow', result.passAlone.psr],
      ]
    : []
  const tightest = limits.length ? limits.reduce((a, b) => (b[1] < a[1] ? b : a)) : null
  const upd = (f: Partial<FinderCriteria>) => set(f)

  return (
    <aside className="finder">
      <h2>What do you need from a site?</h2>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.id} className={p.id === preset ? 'on' : ''} onClick={() => applyPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="muted small">{preset === 'custom' ? 'Custom: your own limits.' : blurb}</p>

      <label className="row">
        <span>Slope at most {c.maxSlopeDeg}°</span>
        <input type="range" min={2} max={25} step={1} value={c.maxSlopeDeg} onChange={(e) => upd({ maxSlopeDeg: Number(e.target.value) })} />
      </label>

      <Range label="In sunlight" min={c.sunMin} max={c.sunMax} onMin={(v) => upd({ sunMin: v })} onMax={(v) => upd({ sunMax: v })} />
      <PreferSwitch value={c.sunPrefer} onChange={(p) => upd({ sunPrefer: p })} more="More sun is better" less="Less is better" />

      <Range label="Earth in view" min={c.earthMin} max={c.earthMax} onMin={(v) => upd({ earthMin: v })} onMax={(v) => upd({ earthMax: v })} />
      <PreferSwitch value={c.earthPrefer} onChange={(p) => upd({ earthPrefer: p })} more="More Earth is better" less="Less is better" />

      <div className="row">
        <span>Permanent shadow (possible ice)</span>
        <div className="seg" role="group">
          {(
            [
              ['any', 'Anywhere'],
              ['outside', 'Stay out of it'],
              ['inside', 'Inside it'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={c.psr === v ? 'on' : ''} onClick={() => upd({ psr: v, ...(v === 'inside' ? { maxPsrKm: null } : {}) })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {c.psr !== 'inside' && (
        <label className="row check">
          <input type="checkbox" checked={c.maxPsrKm !== null} onChange={(e) => upd({ maxPsrKm: e.target.checked ? 5 : null })} />
          <span>Within {c.maxPsrKm ?? 5} km of permanent shadow</span>
          {c.maxPsrKm !== null && (
            <input type="range" min={1} max={30} step={1} value={c.maxPsrKm} onChange={(e) => upd({ maxPsrKm: Number(e.target.value) })} />
          )}
        </label>
      )}

      {!result && <p className="muted small">Loading the NASA layers…</p>}
      {result && (
        <>
          <div className="fit">
            <b>{result.eligibleKm2 < 10 ? result.eligibleKm2.toFixed(1) : Math.round(result.eligibleKm2).toLocaleString()} km²</b> meets every limit
          </div>
          <div className="bites">
            {limits.map(([name, share]) => (
              <div key={name} className={tightest && name === tightest[0] && share < 0.999 ? 'tight' : ''}>
                <span>{name}</span>
                <i>
                  <u style={{ width: `${Math.max(share * 100, 1)}%` }} />
                </i>
                <span>{share < 0.01 && share > 0 ? '<1%' : pct(share)}</span>
              </div>
            ))}
          </div>
          <p className="muted small">
            Share of the mapped ground that passes each limit on its own.
            {tightest && tightest[1] < 0.999 ? ` ${tightest[0]} removes the most${result.candidates.length === 0 ? ': loosen it first' : ''}.` : ''}
          </p>

          <div className="ramp">
            <span>just passes</span>
            <i style={{ background: 'linear-gradient(90deg,#0a4d57,#29b875,#fff26b)' }} />
            <span>best fit</span>
          </div>

          <h3>
            Shortlist
            {result.candidates.length >= 2 && <button onClick={() => onCompareTop(result.candidates.slice(0, 3))}>Compare top {Math.min(3, result.candidates.length)}</button>}
          </h3>
          {result.candidates.length === 0 && <p className="muted small">Nothing on the map meets every limit.</p>}
          <ol className="shortlist">
            {result.candidates.map((k) => (
              <li key={k.rank}>
                <button onClick={() => onPick(k)} title="Pin this spot and fly to it">
                  <b>{k.rank}</b>
                  <span className="where">
                    {fmtLat(k.lat)} {fmtLon(k.lon)}
                    <i>
                      <u style={{ width: `${Math.round((k.score / Math.max(result.candidates[0].score, 1e-6)) * 100)}%` }} />
                    </i>
                  </span>
                  <span className="chips">
                    <em>slope {k.slopeDeg.toFixed(1)}°</em>
                    <em>sun {pct(k.sun)}</em>
                    <em>Earth {pct(k.earth)}</em>
                    {(c.maxPsrKm !== null || c.psr === 'inside') && <em>{k.inPsr ? 'in shadow' : `shadow ${k.psrKm.toFixed(1)} km`}</em>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="muted small">
            Each cell is about 300 m across and uses NASA's 18.6-year averages, so narrow ridge tops are blurred. Inside about
            84.6°S the slope is the steepest 80 m slope in the cell; outside it is the cell average. Pin a spot for exact figures.
          </p>
        </>
      )}
    </aside>
  )
}
