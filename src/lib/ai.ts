import Anthropic from "@anthropic-ai/sdk";

// Shared Anthropic client for all API routes (server-side only)
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Model tiers: fast for high-frequency/low-stakes tasks (meal analysis, OCR),
// quality for tasks where reasoning depth matters (skin analysis, health consult)
export const AI_MODELS = {
  fast: "claude-haiku-4-5-20251001",
  quality: "claude-sonnet-5",
} as const;

export type SupportedImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

/**
 * Strip markdown code fences from AI response.
 * Handles ```json / ```markdown / ```md / bare ``` fences.
 */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json|markdown|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

/** Extract the first text block from a Messages API response, or null. */
export function getResponseText(response: Anthropic.Message): string | null {
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  return textBlock.text;
}

/** Build a base64 image content block for the Messages API. */
export function buildImageBlock(
  base64: string,
  mimeType?: string
): Anthropic.ImageBlockParam {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: (mimeType || "image/jpeg") as SupportedImageMime,
      data: base64,
    },
  };
}
