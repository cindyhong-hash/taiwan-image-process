import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in environment");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// Keep backward-compatible export
export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    return (getAnthropic() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
