import { IconCpu } from "@tabler/icons-react";
import { cn } from "@watchtower/ui/lib/utils";
import type { SVGProps } from "react";

import {
  AnthropicLogo,
  AWSLogo,
  CohereLogo,
  DeepSeekLogo,
  GeminiLogo,
  GrokLogo,
  GroqLogo,
  MetaLogo,
  MicrosoftLogo,
  MistralLogo,
  OllamaLogo,
  OpenAILogo,
  OpenRouterLogo,
  PerplexityLogo,
  QwenLogo,
} from "./brand-logos";

type Logo = (props: SVGProps<SVGSVGElement>) => React.ReactElement;

// Keyed by both AI SDK provider ids and OpenRouter vendor slugs, so a logo
// resolves whether we have the raw `provider` or only a "vendor/model" id.
const LOGOS: Record<string, Logo> = {
  openai: OpenAILogo,
  azure: OpenAILogo,
  anthropic: AnthropicLogo,
  claude: AnthropicLogo,
  google: GeminiLogo,
  "google-vertex": GeminiLogo,
  "google-generative-ai": GeminiLogo,
  vertex: GeminiLogo,
  gemini: GeminiLogo,
  mistral: MistralLogo,
  mistralai: MistralLogo,
  xai: GrokLogo,
  "x-ai": GrokLogo,
  grok: GrokLogo,
  deepseek: DeepSeekLogo,
  cohere: CohereLogo,
  perplexity: PerplexityLogo,
  groq: GroqLogo,
  meta: MetaLogo,
  "meta-llama": MetaLogo,
  llama: MetaLogo,
  qwen: QwenLogo,
  alibaba: QwenLogo,
  openrouter: OpenRouterLogo,
  microsoft: MicrosoftLogo,
  phi: MicrosoftLogo,
  amazon: AWSLogo,
  aws: AWSLogo,
  bedrock: AWSLogo,
  ollama: OllamaLogo,
};

/** Resolve the brand logo for a (provider, modelId) pair, or null if unknown. */
export function resolveModelLogo(
  provider?: string | null,
  modelId?: string | null,
): Logo | null {
  // Prefer the vendor slug embedded in a "vendor/model" id, then the provider.
  const fromId = modelId?.includes("/")
    ? modelId.split("/")[0]?.toLowerCase()
    : undefined;
  const fromProvider = provider?.split(".")[0]?.toLowerCase();
  for (const key of [fromId, fromProvider]) {
    if (key && LOGOS[key]) return LOGOS[key]!;
  }
  return null;
}

/**
 * Renders the brand logo for a model/provider, falling back to a neutral chip
 * icon when the vendor isn't recognized.
 */
export function ModelLogo({
  provider,
  modelId,
  className,
}: {
  provider?: string | null;
  modelId?: string | null;
  className?: string;
}) {
  const Logo = resolveModelLogo(provider, modelId);
  if (!Logo) {
    return (
      <IconCpu
        className={cn("size-4 text-muted-foreground", className)}
        aria-hidden
      />
    );
  }
  return <Logo className={cn("size-4", className)} aria-hidden />;
}
