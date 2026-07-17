import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  anthropic,
  AI_MODELS,
  stripCodeFences,
  getResponseText,
  buildImageBlock,
} from "@/lib/ai";
import { HEALTH_BUCKET } from "@/lib/photos";
import type { ConsultAiResponse, ConsultCase, ConsultEntry } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_IMAGES = 3;

const SYSTEM_PROMPT = `あなたは皮膚症状や体の不調について一般的な医学情報を整理するアシスタントです。
診断は行いません。写真と症状の説明から「考えられる可能性」を複数、確度付きで整理し、
セルフケアの選択肢と受診の目安を必ず提示します。

# ルール
- 可能性は必ず複数挙げ、それぞれに確度（高/中/低）と根拠を付ける。断定表現は使わない
- 市販薬で対応可能な場合は具体的な成分名を挙げる（例: テルビナフィン、ラミシールなどの抗真菌薬）
- 確定診断に検査が必要な場合（例: 白癬のKOH直接鏡検）は、受診推奨の理由として明示する
- red_flags には「これが出たらすぐ受診すべきサイン」を症状に即して具体的に書く
- see_doctor は必須。長期間続いている症状は、緊急性が低くても確定診断のため受診を推奨する
- 経過データ（過去の記録・前回写真）がある場合は、変化の有無を progress_note で必ず評価する
- デリケートな部位の相談にも、恥ずかしさに配慮しつつ淡々と情報を整理する

# 出力
以下のJSONのみを出力。説明文・マークダウン不要。日本語で書く。
{
  "possibilities": [
    { "name": "考えられる状態名", "likelihood": "高" | "中" | "低", "rationale": "写真・症状からの根拠" }
  ],
  "self_care": ["具体的なセルフケア（成分名・期間を含む）", "..."],
  "red_flags": ["すぐ受診すべきサイン", "..."],
  "see_doctor": {
    "recommended": true | false,
    "urgency": "routine" | "soon" | "urgent",
    "department": "受診すべき診療科",
    "reason": "受診を勧める（勧めない）理由"
  },
  "progress_note": "前回からの変化の評価（経過データがない場合は null）",
  "case_summary": "このケースの現状を表す1-2文（一覧カード表示用）"
}`;

interface ConsultImageInput {
  base64: string;
  mimeType?: string;
}

interface ConsultRequestBody {
  caseId?: string;
  title?: string;
  bodyArea?: string;
  startedOn?: string;
  userNote: string;
  images?: ConsultImageInput[];
}

function formatEntryHistory(entries: ConsultEntry[]): string {
  if (entries.length === 0) return "（過去の記録なし）";
  return entries
    .map((e) => {
      const ai = e.ai_response;
      const parts = [`- ${e.date}:`];
      if (e.user_note) parts.push(`  本人メモ: ${e.user_note}`);
      if (ai?.possibilities?.length) {
        parts.push(
          `  当時のAI整理: ${ai.possibilities.map((p) => `${p.name}(${p.likelihood})`).join(", ")}`
        );
      }
      if (ai?.progress_note) parts.push(`  経過メモ: ${ai.progress_note}`);
      return parts.join("\n");
    })
    .join("\n");
}

/** Download the most recent photo from past entries for visual comparison. */
async function fetchPreviousPhoto(
  entries: ConsultEntry[]
): Promise<{ date: string; base64: string } | null> {
  const entryWithPhoto = entries.find(
    (e) => e.photo_paths && e.photo_paths.length > 0
  );
  if (!entryWithPhoto) return null;

  const path = entryWithPhoto.photo_paths![entryWithPhoto.photo_paths!.length - 1];
  const { data, error } = await supabase.storage
    .from(HEALTH_BUCKET)
    .download(path);
  if (error || !data) {
    console.error("Previous photo download failed:", error);
    return null;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return { date: entryWithPhoto.date, base64: buffer.toString("base64") };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ConsultRequestBody;
    const { caseId, title, bodyArea, startedOn, userNote, images = [] } = body;

    if (!userNote && images.length === 0) {
      return NextResponse.json(
        { error: "No note or images provided" },
        { status: 400 }
      );
    }
    if (images.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `Too many images (max ${MAX_IMAGES})` },
        { status: 400 }
      );
    }

    // Load case context for follow-up entries
    let caseInfo: ConsultCase | null = null;
    let pastEntries: ConsultEntry[] = [];
    let previousPhoto: { date: string; base64: string } | null = null;

    if (caseId) {
      const [caseRes, entriesRes] = await Promise.all([
        supabase.from("consult_cases").select("*").eq("id", caseId).maybeSingle(),
        supabase
          .from("consult_entries")
          .select("*")
          .eq("case_id", caseId)
          .order("date", { ascending: false })
          .limit(10),
      ]);
      caseInfo = caseRes.data;
      pastEntries = entriesRes.data ?? [];
      previousPhoto = await fetchPreviousPhoto(pastEntries);
    }

    const contextText = `# 相談内容

## ケース情報
- タイトル: ${caseInfo?.title ?? title ?? "（新規相談）"}
- 部位: ${caseInfo?.body_area ?? bodyArea ?? "（未指定）"}
- 症状の開始時期: ${caseInfo?.started_on ?? startedOn ?? "（不明）"}

## 過去の経過記録（新しい順）
${formatEntryHistory(pastEntries)}

## 今回の本人メモ
${userNote || "（写真のみ）"}

上記と写真をもとに、可能性の整理・セルフケア・受診目安を提示してください。`;

    const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

    if (previousPhoto) {
      content.push({
        type: "text" as const,
        text: `【前回（${previousPhoto.date}）の写真 — 経過比較用】`,
      });
      content.push(buildImageBlock(previousPhoto.base64, "image/jpeg"));
    }
    images.forEach((image, i) => {
      content.push({
        type: "text" as const,
        text: `【今回の写真 ${i + 1}/${images.length}】`,
      });
      content.push(buildImageBlock(image.base64, image.mimeType));
    });
    content.push({ type: "text" as const, text: contextText });

    const response = await anthropic.messages.create({
      model: AI_MODELS.quality,
      // Japanese JSON output is token-heavy; 2048 risks mid-JSON truncation
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const responseText = getResponseText(response);
    if (!responseText) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Truncated output cannot be valid JSON — fail with a clear message instead of a parse error
    if (response.stop_reason === "max_tokens") {
      console.error("Consult truncated at max_tokens");
      return NextResponse.json(
        { error: "AI response was truncated. Please try again." },
        { status: 500 }
      );
    }

    const parsed: ConsultAiResponse = JSON.parse(stripCodeFences(responseText));
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Consult error:", error);
    return NextResponse.json(
      { error: "Failed to process consult" },
      { status: 500 }
    );
  }
}
