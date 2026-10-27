type Props = { value: number | null; operation: string };

/** Progress reflects completed work only. A pending server request stays at its last confirmed value. */
export default function TripSaveProgress({ value, operation }: Props) {
  const percent = value === null ? null : Math.max(0, Math.min(100, Math.round(value)));
  return <div className="trip-save-progress" role="status" aria-live="polite">
    <div><strong>{operation}</strong><span>{percent === null ? "Saving" : `${percent}%`}</span></div>
    <progress max={100} value={percent === null ? undefined : percent} aria-label="Saving progress" />
  </div>;
}
