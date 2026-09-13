import "server-only";

/**
 * The single Claude credential every sandbox runs with. Either an Anthropic API key (sk-ant-api…)
 * or a Claude Code long-lived token from `claude setup-token` (sk-ant-oat…). Set PLATFORM_CLAUDE_CREDENTIAL.
 */
export function getPlatformCredential(): string {
  const c = process.env.PLATFORM_CLAUDE_CREDENTIAL?.trim();
  if (!c) throw new Error("PLATFORM_CLAUDE_CREDENTIAL is not set");
  return c;
}
