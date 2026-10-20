// The deck as a plain list (Moxfield, Archidekt, Arena). Only text: no printable images (no proxies).

import { Dialog } from '../../ui/Dialog'
import { toast } from '../../ui/stores'

export function ExportDialog({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <Dialog title="Exportar lista" onClose={onClose}>
      <p className="muted small">Texto no formato aceito por Moxfield, Archidekt e Arena. Só a lista: nada de imagens para impressão.</p>
      <textarea className="export" rows={14} readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
      <div className="row end">
        <button className="btn primary" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Lista copiada.'), () => toast('Não deu para copiar; selecione o texto.'))}>
          Copiar
        </button>
      </div>
    </Dialog>
  )
}
