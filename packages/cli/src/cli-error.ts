/** An error whose message is meant for the operator; exit code 2 means "bad usage or config". */
export class CliError extends Error {
  readonly exitCode: number

  constructor(message: string, exitCode = 1) {
    super(message)
    this.name = "CliError"
    this.exitCode = exitCode
  }
}

export function usageError(message: string): CliError {
  return new CliError(`${message} (see: ttt --help)`, 2)
}
