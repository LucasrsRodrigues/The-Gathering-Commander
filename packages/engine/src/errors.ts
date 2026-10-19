import type { ErrorCode, GameError, RuleFinding } from './types'

// Thrown inside handlers and turned into a Result by reduce(); never escapes the engine.
export class RuleViolation extends Error {
  readonly code: ErrorCode
  readonly findings: RuleFinding[] | undefined
  constructor(code: ErrorCode, message: string, findings?: RuleFinding[]) {
    super(message)
    this.code = code
    this.findings = findings
  }

  toGameError(): GameError {
    return { code: this.code, message: this.message, ...(this.findings ? { findings: this.findings } : {}) }
  }
}

export function fail(code: ErrorCode, message: string): never {
  throw new RuleViolation(code, message)
}
