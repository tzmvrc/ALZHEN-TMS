import type { ReactNode } from "react";

/** Presentation only. The existing flow supplies every editor and mutation callback. */
export default function StoreEditor({ number, name, summary, onEdit, editing, disabled, formDisabled, actions, deliveryStore, address, details, products, children }: { number: number; name: string; summary: ReactNode; onEdit?: () => void; editing?: boolean; disabled?: boolean; formDisabled?: boolean; actions?: ReactNode; deliveryStore?: ReactNode; address?: ReactNode; details?: ReactNode; products: ReactNode; children?: ReactNode }) {
  return <section className="store-editor">
    <header className="store-editor-header"><span className="store-number-badge">{number}</span><h3 title={name}>{name || "Select a destination store"}</h3><span className="store-editor-stats">{summary}</span><div className="store-editor-actions">{onEdit && <button type="button" disabled={disabled} aria-expanded={Boolean(editing)} onClick={onEdit}>{editing ? "Close store details" : "Edit store details"}</button>}{actions}</div></header>
    {(deliveryStore || address || details || children) && <fieldset disabled={formDisabled} className="store-editor-fields"><div className="store-address-grid"><div className="delivery-store-block">{deliveryStore}</div>{address}</div>{details}{children}</fieldset>}
    {products}
  </section>;
}
