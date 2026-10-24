import type { MyTripProps } from './contracts'

// 담당: My Trip·지도(F). 임시 골격.
export function MyTrip({ trip, onExplore }: MyTripProps) {
  return (
    <section className="sec">
      {trip.map((e) => <p key={e.entry_id}>Day {e.day} · {e.title}</p>)}
      <button type="button" className="btn btn--ghost" onClick={onExplore}>Explore</button>
    </section>
  )
}
