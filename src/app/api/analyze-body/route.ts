import { NextRequest, NextResponse } from "next/server";
import {
  anthropic,
  AI_MODELS,
  stripCodeFences,
  getResponseText,
  buildImageBlock,
} from "@/lib/ai";

const SYSTEM_PROMPT = `You are analyzing a Fitdays body composition app screenshot. Extract the numerical values from the image.

Return ONLY a JSON object with this exact structure, no other text:
{
  "weight": <number in kg>,
  "body_fat_pct": <number>,
  "muscle_mass": <number in kg or null if not visible>,
  "lean_mass": <number in kg or null if not visible>,
  "bmr": <number in kcal or null if not visible>
}

Guidelines:
- Read numbers exactly as shown in the screenshot
- The app displays values in Japanese (体重, 体脂肪率, 筋肉量, 除脂肪体重, 基礎代謝率)
- If a value is not visible or unclear, set it to null
- Weight is always in kg, BMR in kcal`;

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: AI_MODELS.fast,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            buildImageBlock(imageBase64, mimeType),
            {
              type: "text",
              text: "Extract the body composition data from this Fitdays screenshot.",
            },
          ],
        },
      ],
      system: SYSTEM_PROMPT,
    });

    const responseText = getResponseText(response);
    if (!responseText) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    const parsed = JSON.parse(stripCodeFences(responseText));
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Body analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze screenshot" },
      { status: 500 }
    );
  }
}
