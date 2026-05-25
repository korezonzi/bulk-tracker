---
name: fitness-ui
description: Bulk Tracker PWAのUIデザインシステム。配色・タイポグラフィ・スペーシング・カード設計の実装ルール。UI変更時に必ず参照。
---

# Bulk Tracker UI Design System

Strong/Hevy/MacroFactorなどのプロフェッショナルフィットネスアプリを参考にした設計ルール。

## 「AI臭い」を避けるための鉄則

1. **グラデーション禁止** — カード背景は均一色。`linear-gradient`や`card-gradient`は使わない
2. **グラスモーフィズム禁止** — `backdrop-filter: blur`は使わない
3. **シャドウは控えめ** — `0 2px 8px rgba(0,0,0,0.3)` が最大
4. **彩度を落とす** — ビビッドな色は避け、くすんだトーンに
5. **余白を広く取る** — 詰め込まず呼吸させる
6. **ボーダーは最小限** — 背景色の差だけで区切る
7. **フォントサイズに階層** — 全部同じサイズに見えるのはNG

## カラーパレット

```css
/* Surfaces */
--bg-primary:     #121212;    /* メイン背景 */
--bg-secondary:   #1A1A2E;    /* カード背景 */
--bg-tertiary:    #242438;    /* ホバー、入力フィールド */
--bg-elevated:    #2D2D44;    /* モーダル、ドロップダウン */

/* Accent */
--accent:         #6366f1;    /* Indigo — プライマリアクション */
--accent-hover:   #5558e6;
--success:        #10B981;    /* 達成、進捗 */
--warning:        #F59E0B;    /* 注意 */
--error:          #EF4444;    /* エラー */
--cta:            #F97316;    /* CTAボタン（オレンジ） */

/* PFC */
--protein:        #F97316;    /* オレンジ */
--fat:            #FACC15;    /* イエロー */
--carbs:          #34D399;    /* エメラルド */

/* Text */
--text-primary:   #FFFFFF;
--text-secondary: #E5E7EB;
--text-tertiary:  #9CA3AF;
--text-muted:     #6B7280;
```

## Tailwind CSSへのマッピング

```
bg-background     → #121212
bg-card            → #1A1A2E  (均一色、グラデーションなし)
bg-card-hover      → #242438
border-card-border → rgba(255,255,255,0.06)
text-foreground    → #FFFFFF
text-muted         → #9CA3AF
```

## タイポグラフィ

| 用途 | Tailwind | 備考 |
|------|---------|------|
| ページタイトル | `text-2xl md:text-3xl font-bold tracking-tight` | letter-spacing: -0.02em |
| セクション見出し | `text-lg font-semibold` | |
| カード見出し | `text-base font-medium` | |
| 本文 | `text-sm` | line-height: 1.6 |
| ラベル | `text-xs text-muted` | |
| キャプション | `text-[10px] text-muted` | |
| 数値 | `font-num` (font-mono + tabular-nums) | 数字の整列用 |

## スペーシング（8pxグリッド）

| トークン | 値 | 用途 |
|---------|-----|------|
| `gap-1` | 4px | 極小間隔（アイコンとテキスト） |
| `gap-2` | 8px | 関連要素間 |
| `p-4` / `gap-4` | 16px | カード内padding、セクション間 |
| `gap-6` | 24px | セクション分離 |
| `gap-8` | 32px | ページレベル分離 |
| `py-6 md:py-10` | 24px / 40px | ページ上下padding |

## カード設計

```tsx
// 標準カード（ボーダーなし、背景色で区切る）
<div className="bg-card rounded-xl p-4">

// インタラクティブカード
<div className="bg-card rounded-xl p-4 hover:bg-card-hover transition-colors active:scale-[0.98]">

// 強調カード（ボーダーあり）
<div className="bg-card rounded-xl p-4 border border-card-border">
```

- **角丸**: `rounded-xl` (12px) が標準。`rounded-2xl` は大きいカードのみ
- **シャドウ**: 基本使わない。モーダルのみ `shadow-lg`
- **ボーダー**: 最小限。背景色の差で十分

## ボタン設計

```tsx
// Primary CTA
<button className="bg-cta text-white px-4 py-3 rounded-lg font-semibold text-base hover:brightness-110 active:scale-[0.97]">

// Secondary
<button className="bg-bg-tertiary text-secondary px-4 py-2 rounded-lg text-sm hover:bg-bg-elevated">

// Ghost
<button className="text-muted hover:text-foreground px-3 py-2 text-sm">
```

## プログレスバー

```tsx
<div className="h-2 bg-bg-tertiary rounded-full">
  <div className="h-full bg-success rounded-full" style={{ width: `${pct}%` }} />
</div>
```
- グラデーションなし、単色
- 高さ: 8px (h-2)
- 角丸: `rounded-full`

## 禁止パターン

- `card-gradient` クラス — 均一背景に置換
- `card-glass` クラス — 均一背景に置換
- `backdrop-filter` — 削除
- `linear-gradient` (カード背景) — 削除
- `drop-shadow` / `filter` on SVG — 控えめに
- `shadow-accent/25` のようなカラーシャドウ — 使わない
- 12px の余白 — 8px か 16px に
