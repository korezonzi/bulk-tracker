"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import {
  SKIN_PRODUCT_CATEGORY_LABELS,
  type SkinProduct,
  type SkinProductCategory,
} from "@/lib/types";

const CATEGORY_OPTIONS = Object.entries(SKIN_PRODUCT_CATEGORY_LABELS) as [
  SkinProductCategory,
  string,
][];

// Tap-to-toggle timing chips (stored as "朝・夜" style string)
const TIMING_OPTIONS = ["朝", "昼", "夜", "就寝前", "運動後"] as const;
const TIMING_SEPARATOR = "・";

interface EnrichedProduct {
  name: string | null;
  brand: string | null;
  category: SkinProductCategory | null;
  ingredients: string | null;
  usage_timing: string | null;
  confidence: "high" | "medium" | "low";
}

export default function SkinProductsPage() {
  const [products, setProducts] = useState<SkinProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // New product form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SkinProductCategory>("supplement");
  const [brand, setBrand] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [selectedTimings, setSelectedTimings] = useState<string[]>([]);
  const [startedOn, setStartedOn] = useState(getToday());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // AI quick-fill
  const [enriching, setEnriching] = useState(false);
  const [enrichNote, setEnrichNote] = useState<string | null>(null);
  const labelPhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("skin_products")
      .select("*")
      .order("created_at", { ascending: false });

    setProducts(data ?? []);
    setLoading(false);
  }

  function resetForm() {
    setName("");
    setCategory("supplement");
    setBrand("");
    setIngredients("");
    setSelectedTimings([]);
    setStartedOn(getToday());
    setNotes("");
    setEnrichNote(null);
  }

  function toggleTiming(timing: string) {
    setSelectedTimings((prev) =>
      prev.includes(timing)
        ? prev.filter((t) => t !== timing)
        : [...prev, timing]
    );
  }

  function applyEnrichment(data: EnrichedProduct) {
    if (data.name) setName(data.name);
    if (data.brand) setBrand(data.brand);
    if (data.category && data.category in SKIN_PRODUCT_CATEGORY_LABELS) {
      setCategory(data.category);
    }
    if (data.ingredients) setIngredients(data.ingredients);
    if (data.usage_timing) {
      setSelectedTimings(
        data.usage_timing
          .split(TIMING_SEPARATOR)
          .filter((t) => (TIMING_OPTIONS as readonly string[]).includes(t))
      );
    }
    setEnrichNote(
      data.confidence === "high"
        ? "✓ 自動入力しました。内容を確認して登録してください"
        : "✓ 自動入力しました（推定を含みます）。成分などを確認・修正してください"
    );
  }

  async function enrichFromText() {
    if (!name.trim()) return;
    setEnriching(true);
    setEnrichNote(null);
    try {
      const response = await fetch("/api/enrich-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: name.trim() }),
      });
      if (!response.ok) throw new Error("Enrichment failed");
      applyEnrichment(await response.json());
    } catch (e) {
      console.error("Enrich from text failed:", e);
      setEnrichNote("自動入力に失敗しました。手入力してください");
    } finally {
      setEnriching(false);
    }
  }

  async function enrichFromPhoto(file: File) {
    setEnriching(true);
    setEnrichNote(null);
    try {
      const { default: imageCompression } = await import(
        "browser-image-compression"
      );
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1200,
        initialQuality: 0.8,
        useWebWorker: true,
      });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(compressed);
      });

      const response = await fetch("/api/enrich-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl.split(",")[1],
          mimeType: "image/jpeg",
        }),
      });
      if (!response.ok) throw new Error("Enrichment failed");
      applyEnrichment(await response.json());
    } catch (e) {
      console.error("Enrich from photo failed:", e);
      setEnrichNote("ラベルの読み取りに失敗しました。手入力してください");
    } finally {
      setEnriching(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    const { error } = await supabase.from("skin_products").insert({
      name: name.trim(),
      category,
      brand: brand.trim() || null,
      ingredients: ingredients.trim() || null,
      usage_timing:
        selectedTimings.length > 0
          ? selectedTimings.join(TIMING_SEPARATOR)
          : null,
      started_on: startedOn || null,
      notes: notes.trim() || null,
    });

    if (!error) {
      setShowForm(false);
      resetForm();
      await load();
    }
    setSaving(false);
  }

  async function handleStopUsing(id: string) {
    await supabase
      .from("skin_products")
      .update({ ended_on: getToday() })
      .eq("id", id);
    await load();
  }

  async function handleResume(id: string) {
    await supabase
      .from("skin_products")
      .update({ ended_on: null })
      .eq("id", id);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("削除しますか？")) return;
    await supabase.from("skin_products").delete().eq("id", id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  const activeProducts = products.filter((p) => !p.ended_on);
  const endedProducts = products.filter((p) => p.ended_on);

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
          🧴 コスメ・サプリ
        </h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-semibold active:scale-[0.97]"
        >
          {showForm ? "閉じる" : "+ 追加"}
        </button>
      </div>

      <p className="text-xs text-muted -mt-2">
        使用中のアイテムは肌チェックインのAI分析で自動的に考慮されます
      </p>

      {/* Add form */}
      {showForm && (
        <div className="bg-card rounded-xl p-4 space-y-3">
          {/* AI quick-fill from label photo */}
          <input
            ref={labelPhotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) enrichFromPhoto(file);
              e.target.value = "";
            }}
            className="hidden"
          />
          <button
            onClick={() => labelPhotoRef.current?.click()}
            disabled={enriching}
            className="w-full py-3 bg-background border-2 border-dashed border-card-border rounded-xl text-sm text-muted hover:text-foreground disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {enriching ? (
              <>
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                AIが読み取り中...
              </>
            ) : (
              <>📷 ラベル写真を撮って自動入力</>
            )}
          </button>
          {enrichNote && (
            <p className="text-xs text-accent">{enrichNote}</p>
          )}

          <div>
            <label className="block text-xs text-muted mb-1">名前 *</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: DHC 亜鉛 30日分"
                className="flex-1 px-3 py-2 bg-background rounded-lg text-sm"
              />
              <button
                onClick={enrichFromText}
                disabled={!name.trim() || enriching}
                className="px-3 py-2 bg-accent text-white rounded-lg text-xs disabled:opacity-50 shrink-0"
              >
                {enriching ? "..." : "AI補完"}
              </button>
            </div>
            <p className="text-[10px] text-muted mt-1">
              名前だけ入れてAI補完を押すと、成分・カテゴリを自動入力します
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">カテゴリ</label>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as SkinProductCategory)
                }
                className="w-full px-3 py-2 bg-background rounded-lg text-sm"
              >
                {CATEGORY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">ブランド</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="例: ロート製薬"
                className="w-full px-3 py-2 bg-background rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">
              主要成分（AI分析の精度が上がります）
            </label>
            <input
              type="text"
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              placeholder="例: ビタミンC誘導体, グリチルリチン酸"
              className="w-full px-3 py-2 bg-background rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">
              使うタイミング（タップで選択）
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {TIMING_OPTIONS.map((timing) => (
                <button
                  key={timing}
                  onClick={() => toggleTiming(timing)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    selectedTimings.includes(timing)
                      ? "bg-accent/12 text-accent font-medium"
                      : "bg-background text-muted"
                  }`}
                >
                  {timing}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">使用開始日</label>
            <input
              type="date"
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
              className="w-full px-3 py-2 bg-background rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">メモ</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例: ヒリつきが出たら中止"
              className="w-full px-3 py-2 bg-background rounded-lg text-sm"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="w-full bg-accent text-white px-4 py-3 rounded-lg font-semibold text-base disabled:opacity-50 active:scale-[0.97]"
          >
            {saving ? "保存中..." : "登録する"}
          </button>
        </div>
      )}

      {/* In use */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          使用中 <span className="text-sm text-muted">({activeProducts.length})</span>
        </h2>
        {activeProducts.length === 0 ? (
          <div className="bg-card rounded-xl p-6 text-center text-sm text-muted">
            使用中のコスメ・サプリを登録すると、肌診断の精度が上がります
          </div>
        ) : (
          activeProducts.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onStop={() => handleStopUsing(p.id)}
              onDelete={() => handleDelete(p.id)}
            />
          ))
        )}
      </section>

      {/* Ended */}
      {endedProducts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            使用終了 <span className="text-sm text-muted">({endedProducts.length})</span>
          </h2>
          {endedProducts.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onResume={() => handleResume(p.id)}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function ProductCard({
  product,
  onStop,
  onResume,
  onDelete,
}: {
  product: SkinProduct;
  onStop?: () => void;
  onResume?: () => void;
  onDelete: () => void;
}) {
  const isEnded = !!product.ended_on;

  return (
    <div className={`bg-card rounded-xl p-4 ${isEnded ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/12 text-accent">
              {SKIN_PRODUCT_CATEGORY_LABELS[product.category]}
            </span>
            {product.usage_timing && (
              <span className="text-[10px] text-muted">{product.usage_timing}</span>
            )}
          </div>
          <p className="text-base font-medium mt-1">{product.name}</p>
          {product.brand && (
            <p className="text-xs text-muted">{product.brand}</p>
          )}
          {product.ingredients && (
            <p className="text-xs text-muted mt-1">成分: {product.ingredients}</p>
          )}
          <p className="text-[10px] text-muted mt-1">
            {product.started_on && `${product.started_on} 開始`}
            {product.ended_on && ` 〜 ${product.ended_on} 終了`}
          </p>
          {product.notes && (
            <p className="text-xs text-muted mt-1">{product.notes}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {onStop && (
            <button
              onClick={onStop}
              className="text-xs px-2.5 py-1.5 bg-card-hover rounded-lg text-muted hover:text-foreground"
            >
              使用終了
            </button>
          )}
          {onResume && (
            <button
              onClick={onResume}
              className="text-xs px-2.5 py-1.5 bg-card-hover rounded-lg text-muted hover:text-foreground"
            >
              再開
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-xs px-2.5 py-1.5 text-muted hover:text-error"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
