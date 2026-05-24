import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const IMAGE_SYSTEM_PROMPT = `You are a nutrition analysis assistant. Analyze the food photo and estimate the nutritional content.

Return ONLY a JSON object with this exact structure, no other text:
{
  "description": "Brief description of the food in Japanese",
  "calories": <number>,
  "protein": <number in grams>,
  "fat": <number in grams>,
  "carbs": <number in grams>,
  "confidence": "high" | "medium" | "low"
}

Guidelines:
- Estimate portion sizes carefully based on visual cues
- For Japanese food, use standard serving sizes
- Include all visible items (rice, side dishes, drinks, etc.)
- Round to nearest integer
- If you cannot identify the food, set confidence to "low" and make your best guess`;

const TEXT_SYSTEM_PROMPT = `You are a nutrition analysis assistant. Analyze the described food items and estimate the total nutritional content.

The user will provide a text description of one or more food items they ate (e.g. "牛丼大盛り、味噌汁、サラダ").
Estimate the TOTAL combined nutritional content of all items.

Return ONLY a JSON object with this exact structure, no other text:
{
  "description": "Brief summary of all food items in Japanese",
  "calories": <number>,
  "protein": <number in grams>,
  "fat": <number in grams>,
  "carbs": <number in grams>,
  "confidence": "high" | "medium" | "low"
}

Guidelines:
- For Japanese food, use standard serving sizes
- Sum up nutritional values of ALL listed items
- Round to nearest integer
- If a menu item is ambiguous, use a common interpretation
- Set confidence based on how specific the description is`;

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType, text } = await request.json();

    if (!imageBase64 && !text) {
      return NextResponse.json(
        { error: "No image or text provided" },
        { status: 400 }
      );
    }

    // Build messages based on input type (image or text)
    const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] =
      text
        ? [
            {
              type: "text" as const,
              text: `以下の食事内容の栄養価を分析してください:\n${text}`,
            },
          ]
        : [
            {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: (mimeType || "image/jpeg") as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: imageBase64,
              },
            },
            {
              type: "text" as const,
              text: "Analyze this food photo and estimate the nutritional content (calories, protein, fat, carbs).",
            },
          ];

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      system: text ? TEXT_SYSTEM_PROMPT : IMAGE_SYSTEM_PROMPT,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Strip markdown code fences if present
    const raw = textBlock.text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Meal analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze meal" },
      { status: 500 }
    );
  }
}
