// "Texto": the whole deck as text, edited and saved at once (épico 10, req. 13–15).

import { useState } from 'react'
import { Dialog } from '../../ui/Dialog'
import { BULK_LIMITS } from '../bulkText'

export interface BulkSaveResult {
  missing: string[]
  errors: string[]
}

export function BulkTextDialog({ initial, onSave, onClose }: {
  initial: string
  onSave: (text: string) => Promise<BulkSaveResult>
  onClose: () => void
}) {
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BulkSaveResult | null>(null)
  const [failed, setFailed] = useState(false)

  async function save() {
    setBusy(true)
    setFailed(false)
    try {
      const r = await onSave(text)
      if (!r.missing.length && !r.errors.length) return onClose()
      setResult(r)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Editar como texto" onClose={onClose} wide>
      <p className="muted small">
        Uma carta por linha, como <code>1 Sol Ring (C21) 263 #Ramp</code>. Seções: <code>Commander</code>, <code>Deck</code> e{' '}
        <code>Talvez</code>. Categorias com <code>#</code> (com espaço: <code>#"Ramp pesado"</code>). Aceita as exportações do
        Moxfield e do Archidekt. Salvar substitui o deck e entra no histórico como uma mudança só.
      </p>
      <textarea className="export bulk-text" rows={20} value={text} maxLength={BULK_LIMITS.chars} spellCheck={false}
        aria-label="Deck em texto" onChange={(e) => setText(e.target.value)} />
      {failed && <p className="error" role="alert">Sem conexão com o catálogo; nada foi salvo. Tente de novo.</p>}
      {result && (
        <div className="bulk-result" role="status">
          <p>Salvo. {result.missing.length ? `${result.missing.length} nome(s) não encontrados ficaram de fora:` : ''}</p>
          {result.missing.length > 0 && <ul>{result.missing.slice(0, 30).map((n) => <li key={n}>{n}</li>)}</ul>}
          {result.errors.length > 0 && <ul className="muted small">{result.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
      <div className="row end">
        <button className="btn ghost" onClick={onClose}>{result ? 'Fechar' : 'Cancelar'}</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </Dialog>
  )
}
