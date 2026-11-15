// Site finder controls: say what the mission needs, see how much ground is left and which
// limit removes the most, then pick from a ranked shortlist. (Patterns: goal presets and a
// live "passing area" readout from GIS suitability tools; map-and-shortlist from property
// search; docs/research/design-references.md.)
import { fmtArea, fmtDegrees, fmtDistance, fmtLat, fmtLon, fmtShare, fmtShareRange, fmtSlope } from '../lib/format'
import { PRESETS, type Candidate, type FinderCriteria, type FinderResult, type FinderWeights, type Prefer } from '../lib/finder'
import { IMPORTANCE, importanceOf, importanceText, type Importance } from './importance'
import { useStore } from '../store'
import { RangeSlider, Segmented, Slider } from './controls'

/** Preset names short enough for a 2 x 2 switch. */
const PRESET_LABEL: Record<string, string> = { solar: 'Solar lander', ice: 'Ice prospecting', base: 'Base near ice' }

const PREFER: readonly (readonly [Prefer, string])[] = [
  ['high', 'Prefer more'],
  ['low', 'Prefer less'],
  ['none', 'Either'],
]
const PSR: readonly (readonly [FinderCriteria['psr'], string])[] = [
  ['any', 'Anywhere'],
  ['outside', 'Stay out of it'],
  ['inside', 'Inside it'],
]

const IMPORTANCE_OPTIONS: readonly (readonly [Importance, string])[] = [
  ['low', 'Low'],
  ['normal', 'Normal'],
  ['high', 'High'],
]

interface Props {
  result: FinderResult | null
  onPick: (c: Candidate) => void
  onCompareTop: (cs: Candidate[]) => void
}

export function FinderPanel({ result, onPick, onCompareTop }: Props) {
  const c = useStore((s) => s.finder)
  const preset = useStore((s) => s.preset)
  const set = useStore((s) => s.setFinder)
  const applyPreset = useStore((s) => s.applyPreset)
  const planner = useStore((s) => s.mode === 'plan')
  const leave = useStore((s) => s.leaveFinder)
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
  const bites = tightest !== null && tightest[1] < 0.999
  const upd = (f: Partial<FinderCriteria>) => set(f)
  // How much each thing counts in the ranking. Only what is being ranked on is offered.
  const counted: [keyof FinderWeights, string][] = [
    ['slope', 'Flat ground'],
    ...(c.sunPrefer !== 'none' ? ([['sun', 'Sunlight']] as [keyof FinderWeights, string][]) : []),
    ...(c.earthPrefer !== 'none' ? ([['earth', 'Earth view']] as [keyof FinderWeights, string][]) : []),
    ...(c.maxPsrKm !== null && c.psr !== 'inside' ? ([['psr', 'Near shadow']] as [keyof FinderWeights, string][]) : []),
  ]
  const weighting = importanceText(c)
  const area = result ? (
    <>
      <b>{fmtArea(result.eligibleKm2)}</b> <span>{result.eligibleKm2 < 10 ? 'meets' : 'meet'} every limit</span>
    </>
  ) : (
    <span>Loading the NASA layers…</span>
  )

  return (
    <aside className="panel finder" aria-label="Site finder">
      <p className="peek-line hero">{area}</p>
      <header className="panel-head finder-head">
        <h2>What do you need from a site?</h2>
        <button type="button" className="btn ghost icon" aria-label="Close the site finder" onClick={leave}>
          ×
        </button>
      </header>
      <div className="panel-body">
        <div className="group">
          <Segmented
            className="grid2"
            label="Mission preset"
            options={[
              ...PRESETS.map((p) => [p.id, PRESET_LABEL[p.id] ?? p.label, p.label] as const),
              // Custom is offered where its limits can be set; it also stays if it is already in use.
              ...(planner || preset === 'custom' ? [['custom', 'Custom', 'Your own limits'] as const] : []),
            ]}
            value={preset}
            // Custom keeps the limits as they are and stops them being tied to a preset.
            onChange={(id) => (id === 'custom' ? set({}) : applyPreset(id))}
          />
          <p className="caption">{preset !== 'custom' ? blurb : planner ? 'Your own limits: set them below.' : 'Your own limits. Change them in the Mission planner mode (Guides and settings).'}</p>
        </div>

        {/* The limits themselves are the planner's: Explorer picks a goal and reads the shortlist. */}
        <div className="group pro-only">
          <Slider label="Slope at most" text={fmtDegrees(c.maxSlopeDeg)} min={2} max={25} step={1} value={c.maxSlopeDeg} onChange={(v) => upd({ maxSlopeDeg: v })} />

          <RangeSlider label="Time in sunlight" text={fmtShareRange(c.sunMin, c.sunMax)} lo={c.sunMin} hi={c.sunMax} onLo={(v) => upd({ sunMin: v })} onHi={(v) => upd({ sunMax: v })} />
          <Segmented label="Sunlight preference" options={PREFER} value={c.sunPrefer} onChange={(p) => upd({ sunPrefer: p })} />

          <RangeSlider label="Time with Earth in view" text={fmtShareRange(c.earthMin, c.earthMax)} lo={c.earthMin} hi={c.earthMax} onLo={(v) => upd({ earthMin: v })} onHi={(v) => upd({ earthMax: v })} />
          <Segmented label="Earth view preference" options={PREFER} value={c.earthPrefer} onChange={(p) => upd({ earthPrefer: p })} />

          <div className="field">
            <span className="field-head">
              <span>Permanent shadow (possible ice)</span>
            </span>
            <Segmented label="Permanent shadow" options={PSR} value={c.psr} onChange={(v) => upd({ psr: v, ...(v === 'inside' ? { maxPsrKm: null } : {}) })} />
          </div>
          {c.psr !== 'inside' && (
            <div className="field">
              <label className="check field-head">
                <input type="checkbox" checked={c.maxPsrKm !== null} onChange={(e) => upd({ maxPsrKm: e.target.checked ? 5 : null })} />
                <span>Close to permanent shadow</span>
                {c.maxPsrKm !== null && <b>within {fmtDistance(c.maxPsrKm * 1000)}</b>}
              </label>
              {c.maxPsrKm !== null && (
                <input
                  className="slider"
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={c.maxPsrKm}
                  aria-label="Distance to permanent shadow, at most (km)"
                  style={{ '--p': `${((c.maxPsrKm - 1) / 29) * 100}%` } as React.CSSProperties}
                  onChange={(e) => upd({ maxPsrKm: Number(e.target.value) })}
                />
              )}
            </div>
          )}
        </div>

        {preset === 'custom' && (
          <div className="group pro-only">
            <h3 className="section">What matters most</h3>
            <p className="caption">Changes the order of the shortlist, not which ground passes.</p>
            <div className="weights">
              {counted.map(([key, name]) => (
                <div key={key}>
                  <span>{name}</span>
                  <Segmented
                    label={`${name}: how much it counts`}
                    options={IMPORTANCE_OPTIONS}
                    value={importanceOf(c.weights?.[key])}
                    onChange={(v) => upd({ weights: { ...c.weights, [key]: IMPORTANCE[v] } })}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {!result && <p className="caption">Loading the NASA layers…</p>}
        {result && (
          <>
            <div className="group">
              <p className="hero">{area}</p>
              <div className="ramp">
                <span>just passes</span>
                <i className="fit-ramp" />
                <span>best fit</span>
              </div>
            </div>

            <div className="group alone pro-only">
              <h3 className="section" title="Share of the mapped ground that passes each limit when the other limits are ignored">
                Passes this limit alone
              </h3>
              <div className="bites">
                {limits.map(([name, share]) => {
                  const tight = bites && name === tightest[0]
                  return (
                    <div key={name}>
                      <span>{name}</span>
                      <i>
                        <u style={{ width: `${Math.max(share * 100, 1)}%` }} />
                      </i>
                      <b>{fmtShare(share)}</b>
                      <span className="tight">
                        {tight && (
                          <>
                            <i className="dot warn" /> tightest
                          </>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
              {bites && result.candidates.length === 0 && <p className="caption">{tightest[0]} removes the most ground: loosen it first.</p>}
            </div>

            <div className="group">
              <div className="section-row">
                <h3 className="section">Shortlist</h3>
                {result.candidates.length >= 2 && (
                  <button type="button" className="btn primary" onClick={() => onCompareTop(result.candidates.slice(0, 3))}>
                    Compare top {Math.min(3, result.candidates.length)}
                  </button>
                )}
              </div>
              {result.candidates.length === 0 && <p className="caption">Nothing on the map meets every limit.</p>}
              {result.candidates.length > 0 && <p className="basis">18.6-year average · 300 m cells</p>}
              <ol className="shortlist">
                {result.candidates.map((k) => (
                  <li key={k.rank}>
                    <button type="button" onClick={() => onPick(k)} title="Pin this spot and fly to it">
                      <b>{k.rank}</b>
                      <span className="where">
                        {fmtLat(k.lat)}, {fmtLon(k.lon)}
                        <i title="How well it fits, relative to the best spot">
                          <u style={{ width: `${Math.round((k.score / Math.max(result.candidates[0].score, 1e-6)) * 100)}%` }} />
                        </i>
                      </span>
                      <span className="facts">
                        slope {fmtSlope(k.slopeDeg)} · sun {fmtShare(k.sun)} · Earth {fmtShare(k.earth)}
                        {(c.maxPsrKm !== null || c.psr === 'inside') && ` · ${k.inPsr ? 'in shadow' : `shadow ${fmtDistance(k.psrKm * 1000)}`}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {result.candidates.length > 0 && (
                <p className="caption">
                  Ranked by how well the ground fits across about 900 m around each spot; the figures shown are for the centre cell only.
                  {weighting ? ` ${weighting}` : ''}
                </p>
              )}
              {result.candidates.length > 0 && (
                <p className="caption">
                  Pick a spot, then see when to land there. Shortlist figures are 18.6-year averages on 300 m cells; a pinned site shows its own
                  period on finer terrain, so its numbers can differ.
                </p>
              )}
            </div>

            <details className="disclosure">
              <summary>About these numbers</summary>
              <p className="caption">
                The search covers the ground within 160 km of the pole (south of about 84.7°S), where the terrain is mapped at 80 m.
                The bars show the share of that ground that passes each limit on its own. Each cell is about 300 m across and uses
                NASA's 18.6-year averages, so narrow ridge tops are blurred; its slope is the steepest 80 m slope inside it. Pin a
                spot for exact figures.
              </p>
            </details>
          </>
        )}
      </div>
    </aside>
  )
}
