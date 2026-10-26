import { type LogServer, type LogServerOptions, startLogServer } from './server.js';

export interface RunDependencies {
  exit?: (code: number) => never;
  writeError?: (line: string) => void;
}

/**
 * Starts the log server for a CLI-like process: a startup failure is reported on
 * stderr and the process exits with code 1 (ARCHITECTURE.md sections 3 and 11).
 */
export async function startLogServerOrExit(
  options: LogServerOptions,
  dependencies: RunDependencies = {},
): Promise<LogServer> {
  const exit = dependencies.exit ?? ((code: number): never => process.exit(code));
  const writeError =
    dependencies.writeError ?? ((line: string) => process.stderr.write(`${line}\n`));

  try {
    return await startLogServer(options);
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    return exit(1);
  }
}
