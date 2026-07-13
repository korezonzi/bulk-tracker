"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { daysAgo } from "@/lib/date";
import { getSignedUrls } from "@/lib/photos";
import { MedicalDisclaimer } from "@/components/medical-disclaimer";
import { ScoreRing } from "@/components/score-ring";
import { SkinSeverityBars } from "@/components/skin-severity-bars";
import {
  SKIN_SCORE_LABELS,
  type SkinCheckin,
  type SkinProfile,
} from "@/lib/types";

type Period = "1m" | "3m" | "6m";

const PERIOD_DAYS: Record<Period, number> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
};

const TOOLTIP_STYLE = {
  backgroundColor: "#1C1C20",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: 12,
  fontSize: 12,
};

const SEVERITY_COLORS: Record<keyof typeof SKIN_SCORE_LABELS, string> = {
  acne: "#ef4444",
  pores: "#a855f7",
  redness: "#f97316",
  oiliness: "#eab308",
  texture: "#3B8FBF",
};

const HISTORY_LIMIT = 15;

export default function SkinDashboardPage() {
  const [profile, setProfile] = useState<SkinProfile | null>(null);
  const [checkins, setCheckins] = useState<SkinCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("3m");

  // Profile form
  const [editingProfile, setEditingProfile] = useState(false);
  const [selfDescription, setSelfDescription] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [profileRes, checkinsRes] = await Promise.all([
        supabase.from("skin_profile").select("*").limit(1).maybeSingle(),
        supabase
          .from("skin_checkins")
          .select("*")
          .gte("date", daysAgo(PERIOD_DAYS["6m"]))
          .order("date", { ascending: false }),
      ]);
      if (!active) return;
      setProfile(profileRes.data);
      setSelfDescription(profileRes.data?.self_description ?? "");
      setCheckins(checkinsRes.data ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleSaveProfile() {
    setSavingProfile(true);
    if (profile) {
      await supabase
        .from("skin_profile")
        .update({
          self_description: selfDescription.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
    } else {
      await supabase
        .from("skin_profile")
        .insert({ self_description: selfDescription.trim() || null });
    }
    const { data } = await supabase
      .from("skin_profile")
      .select("*")
      .limit(1)
      .maybeSingle();
    setProfile(data);
    setEditingProfile(false);
    setSavingProfile(false);
  }

  const latest = checkins[0] ?? null;

  // Chart data: chronological, filtered by period
  const chartData = checkins
    .filter((c) => c.date >= daysAgo(PERIOD_DAYS[period]))
    .slice()
    .reverse()
    .map((c) => ({
      date: c.date.slice(5), // MM-DD
      overall: c.score_overall,
      acne: c.score_acne,
      pores: c.score_pores,
      redness: c.score_redness,
      oiliness: c.score_oiliness,
      texture: c.score_texture,
    }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="py-6 md:py-10 space-y-5 md:space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          🧖 スキンケア
        </h1>
        <div className="flex gap-2">
          <Link
            href="/skin/spot"
            className="bg-card-hover text-foreground px-4 py-2 rounded-lg text-sm active:scale-[0.97]"
          >
            🔍 スポット相談
          </Link>
          <Link
            href="/skin/checkin"
            className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-semibold active:scale-[0.97]"
          >
            + チェックイン
          </Link>
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">肌プロフィール</h2>
          <button
            onClick={() => setEditingProfile((v) => !v)}
            className="text-xs text-muted hover:text-foreground"
          >
            {editingProfile ? "閉じる" : "編集"}
          </button>
        </div>
        {editingProfile || !profile ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={selfDescription}
              onChange={(e) => setSelfDescription(e.target.value)}
              placeholder="例: 脂性肌。ニキビと毛穴の開きが悩み。頬とあごに繰り返しできる"
              rows={3}
              className="w-full px-3 py-2 bg-background rounded-lg text-sm resize-none"
            />
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {savingProfile ? "保存中..." : "保存"}
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            {profile.ai_skin_type && (
              <p className="text-sm">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/12 text-accent mr-2">
                  AI判定
                </span>
                {profile.ai_skin_type}
              </p>
            )}
            <p className="text-xs text-muted">
              {profile.self_description || "自己申告の肌質が未入力です"}
            </p>
          </div>
        )}
      </div>

      {/* Latest check-in */}
      {latest ? (
        <div className="bg-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-medium">最新チェックイン</h2>
            <span className="text-xs text-muted">{latest.date}</span>
          </div>
          <div className="flex items-center gap-4">
            <ScoreRing score={latest.score_overall ?? 0} label="総合" />
            <div className="flex-1">
              <SkinSeverityBars
                scores={{
                  acne: latest.score_acne ?? 0,
                  pores: latest.score_pores ?? 0,
                  redness: latest.score_redness ?? 0,
                  oiliness: latest.score_oiliness ?? 0,
                  texture: latest.score_texture ?? 0,
                }}
              />
            </div>
          </div>
          {latest.ai_analysis?.summary && (
            <p className="text-sm mt-3 leading-relaxed text-foreground/90">
              {latest.ai_analysis.summary}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-xl p-8 text-center">
          <p className="text-4xl mb-3">🧖</p>
          <p className="font-medium">まだチェックインがありません</p>
          <p className="text-xs text-muted mt-1 mb-4">
            顔写真を撮ってAIに肌状態を分析してもらいましょう
          </p>
          <Link
            href="/skin/checkin"
            className="inline-block bg-accent text-white px-6 py-3 rounded-lg font-semibold text-sm active:scale-[0.97]"
          >
            最初のチェックインをする
          </Link>
        </div>
      )}

      {/* Trend charts */}
      {checkins.length >= 2 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">📈 推移</h2>
            <div className="flex gap-1">
              {(["1m", "3m", "6m"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    period === p ? "bg-accent text-white" : "bg-card text-muted"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Overall (0-100, higher = better) */}
            <div className="bg-card rounded-xl p-4">
              <h3 className="text-xs text-muted mb-3">総合コンディション（高いほど良い）</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#71717a" }} width={30} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line
                    type="monotone"
                    dataKey="overall"
                    stroke="#14B8A6"
                    strokeWidth={2}
                    dot={{ fill: "#14B8A6", r: 3 }}
                    name="総合"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Individual severities (0-10, lower = better) */}
            <div className="bg-card rounded-xl p-4">
              <h3 className="text-xs text-muted mb-3">項目別の深刻度（低いほど良い）</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: "#71717a" }} width={25} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {(
                    Object.keys(SKIN_SCORE_LABELS) as (keyof typeof SKIN_SCORE_LABELS)[]
                  ).map((key) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={SEVERITY_COLORS[key]}
                      strokeWidth={1.5}
                      dot={false}
                      name={SKIN_SCORE_LABELS[key]}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* History */}
      {checkins.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">🗓 過去のチェックイン</h2>
          {checkins.slice(0, HISTORY_LIMIT).map((c) => (
            <CheckinHistoryCard key={c.id} checkin={c} />
          ))}
        </section>
      )}

      <MedicalDisclaimer />
    </div>
  );
}

function CheckinHistoryCard({ checkin }: { checkin: SkinCheckin }) {
  const [expanded, setExpanded] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const photoPaths = [
    checkin.front_photo_path,
    checkin.left_photo_path,
    checkin.right_photo_path,
  ].filter((p): p is string => !!p);

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && photoPaths.length > 0 && Object.keys(photoUrls).length === 0) {
      setLoadingPhotos(true);
      const urls = await getSignedUrls(photoPaths);
      setPhotoUrls(urls);
      setLoadingPhotos(false);
    }
  }

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <button
        onClick={handleExpand}
        className="w-full flex items-center justify-between p-4 card-hover text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-num">{checkin.date}</span>
          {checkin.ai_analysis?.compared_to_last && (
            <span className="text-[10px] text-muted hidden md:inline">
              {checkin.ai_analysis.compared_to_last}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold font-num text-accent">
            {checkin.score_overall != null ? Math.round(checkin.score_overall) : "-"}
          </span>
          <span className="text-[10px] text-muted">/100</span>
          <span className="text-muted text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Photos */}
          {photoPaths.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {loadingPhotos ? (
                <div className="col-span-3 h-24 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                photoPaths.map((path) =>
                  photoUrls[path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={path}
                      src={photoUrls[path]}
                      alt="肌写真"
                      className="w-full h-24 object-cover rounded-lg"
                    />
                  ) : null
                )
              )}
            </div>
          )}

          <SkinSeverityBars
            scores={{
              acne: checkin.score_acne ?? 0,
              pores: checkin.score_pores ?? 0,
              redness: checkin.score_redness ?? 0,
              oiliness: checkin.score_oiliness ?? 0,
              texture: checkin.score_texture ?? 0,
            }}
          />

          {checkin.ai_analysis?.summary && (
            <p className="text-xs text-muted leading-relaxed">
              {checkin.ai_analysis.summary}
            </p>
          )}
          {checkin.self_note && (
            <p className="text-xs text-muted">メモ: {checkin.self_note}</p>
          )}
        </div>
      )}
    </div>
  );
}
