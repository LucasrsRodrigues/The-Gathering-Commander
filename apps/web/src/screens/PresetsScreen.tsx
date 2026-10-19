import { useState } from 'react'
import {
  decodePreset, encodePreset, OFFICIAL_PRESET_ID, officialPreset, resolvePreset,
  type DeckRules, type Enforcement, type Preset, type ResolvedPreset,
} from '@gathering-hall/formats'
import { toPreset } from '../presets/toPreset'
import { AppFooter } from '../app/AppNav'
import type { PresetRepository } from '../presets/repository'
import { Dialog } from '../ui/Dialog'
import { toast } from '../ui/stores'

type Ruleset = ResolvedPreset['ruleset']
const NUMBERS: { key: keyof Ruleset; label: string; min: number; max: number }[] = [
  { key: 'startingLife', label: 'Vida inicial', min: 1, max: 999 },
  { key: 'commanderDamageLimit', label: 'Dano de comandante para perder', min: 1, max: 999 },
  { key: 'poisonLimit', label: 'Veneno para perder', min: 1, max: 99 },
  { key: 'commanderTaxIncrement', label: 'Taxa de comandante por conjuração', min: 0, max: 20 },
  { key: 'startingHandSize', label: 'Cartas na mão inicial', min: 0, max: 15 },
  { key: 'freeMulligans', label: 'Mulligans grátis', min: 0, max: 7 },
]
// Upper bound for the dated banlist field (no future banlists).
const TODAY = new Date().toISOString().slice(0, 10)

const LEVELS: { key: Exclude<keyof DeckRules, 'banlist' | 'deckSize'>; label: string }[] = [
  { key: 'sizeLevel', label: 'Exigir o tamanho exato' },
  { key: 'singleton', label: 'Uma cópia de cada carta' },
  { key: 'colorIdentity', label: 'Identidade de cor' },
  { key: 'commanderEligibility', label: 'Quem pode ser comandante' },
  { key: 'pairing', label: 'Dois comandantes (Partner etc.)' },
]
const LEVEL_LABELS: Record<Enforcement, string> = { block: 'Bloqueia', warn: 'Só avisa', off: 'Desligada' }

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 200).map((l) => l.slice(0, 200))

export function PresetsScreen({ presets }: { presets: PresetRepository }) {
  const [list, setList] = useState(() => presets.list())
  const [editing, setEditing] = useState<Preset | null>(null)
  const [sharing, setSharing] = useState<Preset | null>(null)
  const [importing, setImporting] = useState(false)
  const refresh = () => setList(presets.list())

  function create(from: Preset) {
    const p: Preset = { ...from, id: crypto.randomUUID(), name: from.id === OFFICIAL_PRESET_ID ? 'Minhas regras' : `${from.name} (cópia)`.slice(0, 60) }
    presets.save(p)
    refresh()
    setEditing(p)
  }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Regras da casa</h1>
          <p className="muted">Partem do Commander oficial e guardam só o que o seu grupo muda. Cada regra de deck pode bloquear, só avisar ou ficar desligada.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setImporting(true)}>Importar</button>
          <button className="btn primary" onClick={() => create(officialPreset())}>Novo conjunto de regras</button>
        </div>
      </header>

      <ul className="deck-grid">
        {list.map((p) => {
          const official = p.id === OFFICIAL_PRESET_ID
          const changes = Object.keys(p.ruleset ?? {}).length + Object.keys(p.deckRules ?? {}).length
          return (
            <li key={p.id} className="deck-tile">
              <div className="deck-open static">
                <strong>{p.name}</strong>
                <span className="muted">{official ? 'Regras oficiais, sempre atualizadas' : `${changes} mudança(s) em relação ao oficial`}</span>
              </div>
              <div className="deck-actions">
                {!official && <button className="btn ghost" onClick={() => setEditing(p)}>Editar</button>}
                <button className="btn ghost" onClick={() => create(p)}>Duplicar</button>
                {!official && <button className="btn ghost" onClick={() => setSharing(p)}>Compartilhar</button>}
                {!official && (
                  <button className="btn ghost danger" onClick={() => {
                    presets.remove(p.id)
                    refresh()
                    toast(`"${p.name}" excluído.`, { label: 'Desfazer', run: () => { presets.save(p); refresh() } })
                  }}>Excluir</button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {editing && <PresetEditor preset={editing} onClose={() => setEditing(null)} onSave={(p) => { presets.save(p); refresh(); setEditing(null); toast('Regras salvas.') }} />}
      {sharing && (
        <Dialog title={`Compartilhar "${sharing.name}"`} onClose={() => setSharing(null)}>
          <p className="muted small">Copie e mande no grupo. Quem receber usa "Importar".</p>
          <textarea className="export" rows={6} readOnly value={encodePreset(sharing)} onFocus={(e) => e.currentTarget.select()} />
          <div className="row end">
            <button className="btn primary" onClick={() => navigator.clipboard.writeText(encodePreset(sharing)).then(() => toast('Copiado.'), () => toast('Selecione e copie o texto.'))}>Copiar</button>
          </div>
        </Dialog>
      )}
      {importing && <ImportPreset onClose={() => setImporting(false)} onImport={(p) => { presets.save({ ...p, id: crypto.randomUUID() }); refresh(); setImporting(false); toast(`"${p.name}" importado.`) }} />}
      <AppFooter />
    </main>
  )
}

function PresetEditor({ preset, onClose, onSave }: { preset: Preset; onClose: () => void; onSave: (p: Preset) => void }) {
  const [name, setName] = useState(preset.name)
  const [values, setValues] = useState<ResolvedPreset>(() => resolvePreset(preset))
  const [bans, setBans] = useState(values.deckRules.banlist.extraBans.join('\n'))
  const [unbans, setUnbans] = useState(values.deckRules.banlist.unbans.join('\n'))
  const setRule = (patch: Partial<Ruleset>) => setValues((v) => ({ ...v, ruleset: { ...v.ruleset, ...patch } }))
  const setDeck = (patch: Partial<DeckRules>) => setValues((v) => ({ ...v, deckRules: { ...v.deckRules, ...patch } }))
  const setBanlist = (patch: Partial<DeckRules['banlist']>) => setDeck({ banlist: { ...values.deckRules.banlist, ...patch } })

  function save() {
    const final: ResolvedPreset = { ...values, deckRules: { ...values.deckRules, banlist: { ...values.deckRules.banlist, extraBans: lines(bans), unbans: lines(unbans) } } }
    onSave(toPreset({ ...preset, name: name.trim().slice(0, 60) || 'Minhas regras' }, final))
  }

  return (
    <Dialog title="Editar regras" onClose={onClose} wide>
      <div className="form-grid">
        <label className="field span-2">Nome<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
        <fieldset className="span-2">
          <legend>Partida</legend>
          <div className="form-grid">
            {NUMBERS.map(({ key, label, min, max }) => (
              <label key={key} className="field">{label}
                <input type="number" min={min} max={max} value={values.ruleset[key] as number}
                  onChange={(e) => setRule({ [key]: Math.max(min, Math.min(max, Math.round(Number(e.target.value)) || min)) })} />
              </label>
            ))}
            <label className="check"><input type="checkbox" checked={values.ruleset.priorityMode === 'strict'}
              onChange={(e) => setRule({ priorityMode: e.target.checked ? 'strict' : 'relaxed' })} /> Prioridade estrita (todos precisam passar)</label>
            <label className="check"><input type="checkbox" checked={values.ruleset.restrictToController}
              onChange={(e) => setRule({ restrictToController: e.target.checked })} /> Só o controlador mexe nas próprias permanentes</label>
            <label className="check"><input type="checkbox" checked={values.ruleset.autoLoss}
              onChange={(e) => setRule({ autoLoss: e.target.checked })} /> Derrota automática (vida, veneno, dano de comandante)</label>
          </div>
        </fieldset>
        <fieldset className="span-2">
          <legend>Regras de turno</legend>
          <div className="form-grid">
            <label className="field">Hora de jogar (terrenos e mágicas)
              <select value={values.ruleset.timingRules} onChange={(e) => setRule({ timingRules: e.target.value as Enforcement })}>
                {(Object.keys(LEVEL_LABELS) as Enforcement[]).map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
              </select>
            </label>
            <label className="field">Custo de mana
              <select value={values.ruleset.manaRules} onChange={(e) => setRule({ manaRules: e.target.value as Enforcement })}>
                {(Object.keys(LEVEL_LABELS) as Enforcement[]).map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
              </select>
            </label>
            <label className="field">Terrenos por turno
              <input type="number" min={1} max={5} value={values.ruleset.landsPerTurn}
                onChange={(e) => setRule({ landsPerTurn: Math.max(1, Math.min(5, Math.round(Number(e.target.value)) || 1)) })} />
            </label>
            <p className="muted small span-2">
              "Bloqueia" segue as regras oficiais e oferece "Fazer mesmo assim" para efeitos de cartas. "Só avisa" deixa e
              registra no log. "Desligada" volta à mesa livre.
            </p>
          </div>
        </fieldset>
        <fieldset className="span-2">
          <legend>Construção de deck</legend>
          <div className="form-grid">
            <label className="field">Tamanho do deck
              <input type="number" min={40} max={250} value={values.deckRules.deckSize}
                onChange={(e) => setDeck({ deckSize: Math.max(40, Math.min(250, Math.round(Number(e.target.value)) || 100)) })} />
            </label>
            {LEVELS.map(({ key, label }) => (
              <label key={key} className="field">{label}
                <select value={values.deckRules[key]} onChange={(e) => setDeck({ [key]: e.target.value as Enforcement })}>
                  {(Object.keys(LEVEL_LABELS) as Enforcement[]).map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="span-2">
          <legend>Banidas</legend>
          <div className="form-grid">
            <label className="field">Lista base
              <select value={values.deckRules.banlist.source} onChange={(e) => setBanlist({ source: e.target.value as DeckRules['banlist']['source'] })}>
                <option value="official">Oficial + mudanças do grupo</option>
                <option value="custom">Só a lista do grupo</option>
                <option value="none">Nenhuma carta banida</option>
              </select>
            </label>
            <label className="field">Cartas banidas
              <select value={values.deckRules.banlist.level} onChange={(e) => setBanlist({ level: e.target.value as Enforcement })}>
                {(Object.keys(LEVEL_LABELS) as Enforcement[]).map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
              </select>
            </label>
            <label className="field">Banir também (uma por linha)
              <textarea rows={4} value={bans} maxLength={8000} onChange={(e) => setBans(e.target.value)} placeholder="Sol Ring" />
            </label>
            {values.deckRules.banlist.source === 'official' && (
              <label className="field">Banlist oficial de uma data (opcional)
                <input type="date" value={values.deckRules.banlist.asOf ?? ''} max={TODAY}
                  onChange={(e) => setBanlist({ asOf: e.target.value || undefined })} />
                <span className="muted small">Vazio = banlist de hoje. Útil para jogar com as regras de uma época.</span>
              </label>
            )}
            {values.deckRules.banlist.source === 'official' && (
              <label className="field">Liberar do banimento oficial (uma por linha)
                <textarea rows={4} value={unbans} maxLength={8000} onChange={(e) => setUnbans(e.target.value)} />
              </label>
            )}
          </div>
        </fieldset>
      </div>
      <div className="row end">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={save}>Salvar</button>
      </div>
    </Dialog>
  )
}

function ImportPreset({ onClose, onImport }: { onClose: () => void; onImport: (p: Preset) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog title="Importar regras" onClose={onClose}>
      <label className="field">Cole o texto recebido
        <textarea rows={6} value={text} maxLength={10000} spellCheck={false} onChange={(e) => setText(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end">
        <button className="btn primary" disabled={!text.trim()} onClick={() => {
          const result = decodePreset(text.trim())
          if (result.ok) onImport(result.preset)
          else setError(result.error)
        }}>Importar</button>
      </div>
    </Dialog>
  )
}
