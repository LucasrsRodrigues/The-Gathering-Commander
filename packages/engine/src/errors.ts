import type { ErrorCode, GameError } from './types'

// Thrown inside handlers and turned into a Result by reduce(); never escapes the engine.
export class RuleViolation extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }

  toGameError(): GameError {
    return { code: this.code, message: this.message }
  }
}

export function fail(code: ErrorCode, message: string): never {
  throw new RuleViolation(code, message)
}
