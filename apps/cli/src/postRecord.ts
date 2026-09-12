/**
 * Derivation runs automatically once a recording stops. It must never make a saved recording look
 * lost, and must never leave the process hanging on an unhandled rejection. Returns the exit code.
 */
export async function deriveAfterRecording(
  derive: () => Promise<void>,
  sessionDir: string,
  stderr: { write(s: string): void } = process.stderr,
): Promise<number> {
  try {
    await derive();
    return 0;
  } catch (e) {
    stderr.write(
      `\n⚠️  Recording saved to ${sessionDir}, but derivation failed: ${(e as Error).message}\n` +
        "   The recording is intact — run `bb derive` to retry.\n",
    );
    return 1;
  }
}
