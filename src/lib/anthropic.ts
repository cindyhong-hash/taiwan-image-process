// Claude 呼叫改走 OpenRouter（Anthropic / OpenAI 直連帳號都沒額度，OpenRouter 有）。
// 對外仍保留 `anthropic.messages.create(...)` 的介面與「Anthropic 風格」回傳，呼叫點不用改。

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// 內部模型 id → OpenRouter 模型 id
function mapModel(m: string): string {
  if (m.includes("/")) return m; // 已是 OpenRouter 形式（如 anthropic/claude-...）
  const explicit: Record<string, string> = {
    "claude-opus-4-5": "anthropic/claude-opus-4.5",
    "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
  };
  if (explicit[m]) return explicit[m];
  // 通用：claude-<name>-<maj>-<min> → anthropic/claude-<name>-<maj>.<min>
  const g = m.replace(/^(claude-[a-z]+)-(\d+)-(\d+).*$/, "anthropic/$1-$2.$3");
  if (g.startsWith("anthropic/")) return g;
  return m.startsWith("claude-") ? `anthropic/${m}` : m;
}

// Anthropic content block（string 或 陣列）→ OpenAI chat content
type ImageSource =
  | { type: "base64"; media_type: string; data: string }
  | { type: "url"; url: string };
type AnthroBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSource };
type AnthroContent = string | AnthroBlock[];

function toOpenAIContent(content: unknown): unknown {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");
  return (content as AnthroBlock[]).map((block) => {
    if (block?.type === "text") return { type: "text", text: block.text };
    if (block?.type === "image") {
      const src = block.source;
      const url =
        src.type === "base64" ? `data:${src.media_type};base64,${src.data}` : src.url;
      return { type: "image_url", image_url: { url } };
    }
    return { type: "text", text: "" };
  });
}

export type MessageCreateParams = {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: string | Array<{ type: "text"; text: string }>;
  messages: Array<{ role: "user" | "assistant"; content: AnthroContent }>;
};

// Anthropic 風格回傳（呼叫點讀 res.content[0].text）
export type MessageResponse = {
  content: Array<{ type: "text"; text: string }>;
  stop_reason: string | null;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

async function createMessage(params: MessageCreateParams): Promise<MessageResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set in environment");

  const oaMessages: Array<{ role: string; content: unknown }> = [];
  if (params.system) {
    const sysText =
      typeof params.system === "string"
        ? params.system
        : params.system.map((s) => s.text).join("\n");
    oaMessages.push({ role: "system", content: sysText });
  }
  for (const m of params.messages) {
    oaMessages.push({ role: m.role, content: toOpenAIContent(m.content) });
  }

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "X-Title": "marketing-tool",
    },
    body: JSON.stringify({
      model: mapModel(params.model),
      max_tokens: params.max_tokens,
      ...(params.temperature != null ? { temperature: params.temperature } : {}),
      messages: oaMessages,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? `OpenRouter error ${res.status}`;
    throw new Error(`${res.status} ${JSON.stringify(data?.error ?? msg)}`);
  }

  const raw = data?.choices?.[0]?.message?.content;
  const text =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw.map((p: { text?: string }) => p?.text ?? "").join("")
        : "";

  return {
    content: [{ type: "text", text }],
    stop_reason: data?.choices?.[0]?.finish_reason ?? null,
    model: data?.model,
    usage: {
      input_tokens: data?.usage?.prompt_tokens,
      output_tokens: data?.usage?.completion_tokens,
    },
  };
}

// 與舊介面相容：anthropic.messages.create(...) / getAnthropic().messages.create(...)
export const anthropic = { messages: { create: createMessage } };
export function getAnthropic() {
  return anthropic;
}
