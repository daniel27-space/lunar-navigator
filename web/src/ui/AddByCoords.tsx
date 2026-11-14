// Pin a point by typing its coordinates (decimal degrees). Does exactly what a click on the map does.
import { useId, useState } from 'react'
import { parseCoord, splitCoordPair } from '../lib/format'

export function AddByCoords({ onAdd }: { onAdd: (lat: number, lon: number) => void }) {
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  return (
    <form
      className="coords"
      noValidate
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault()
        // A pair typed or pasted into the first field ("-89.45, 222.8") counts as both.
        const pair = lon.trim() ? null : splitCoordPair(lat)
        const r = pair ? parseCoord(pair[0], pair[1]) : parseCoord(lat, lon)
        if (!r.ok) return setError(r.error)
        setError(null)
        setLat('')
        setLon('')
        onAdd(r.value.lat, r.value.lon)
      }}
    >
      <div className="coords-row">
        <label>
          <span>Latitude</span>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="−89.45"
            value={lat}
            aria-invalid={error?.startsWith('Latitude') || undefined}
            aria-describedby={`${id}-msg`}
            onChange={(e) => {
              setLat(e.target.value)
              setError(null)
            }}
            onPaste={(e) => {
              // A pasted pair fills both fields.
              const pair = splitCoordPair(e.clipboardData.getData('text'))
              if (!pair) return
              e.preventDefault()
              setLat(pair[0])
              setLon(pair[1])
              setError(null)
            }}
          />
        </label>
        <label>
          <span>Longitude</span>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="222.8"
            value={lon}
            aria-invalid={error?.startsWith('Longitude') || undefined}
            aria-describedby={`${id}-msg`}
            onChange={(e) => {
              setLon(e.target.value)
              setError(null)
            }}
          />
        </label>
        <button type="submit" className="btn">
          Add
        </button>
      </div>
      <p className="caption" id={`${id}-msg`} role={error ? 'alert' : undefined}>
        {error ? (
          <>
            <i className="dot danger" /> {error}
          </>
        ) : (
          'Decimal degrees. South and west are negative, or add S, N, E, W; longitude may also run 0 to 360.'
        )}
      </p>
    </form>
  )
}
