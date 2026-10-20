// Épico 11: how much of a card the engine does by itself — a discreet badge in the preview and the deck editor.

import type { Coverage } from '@gathering-hall/engine'
import { COVERAGE_LABELS } from './coverage'

const HINTS: Record<Coverage, string> = {
  automated: 'O jogo faz tudo o que a carta diz.',
  partial: 'O jogo faz uma parte; o resto é com os jogadores.',
  manual: 'Os jogadores aplicam o efeito à mão.',
}

export function CoverageBadge({ coverage }: { coverage: Coverage | undefined }) {
  if (!coverage) return null
  return <span className={`coverage-badge ${coverage}`} title={HINTS[coverage]}>{COVERAGE_LABELS[coverage]}</span>
}
