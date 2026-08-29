# bulk-tracker

リーンバルク（増量しながら体脂肪を増やしすぎない）を続けるための PWA。食事の写真を撮ると PFC を推定し、体組成と筋トレの記録に紐づけて週次で振り返る。

Next.js 16 / React 19 / TypeScript / Supabase。画像解析と週次レビューは Claude API を叩いている。

## なぜ作ったか

既存の記録アプリはどれも入力が続かなかった。理由ははっきりしていて、毎食ごとに食品を検索して選んでグラム数を入れる作業が、増量期の1日4〜5食に耐えない。

なので入力を「写真を撮る」だけにした。推定値は完璧ではないが、記録が続かないアプリの正確な数字より、続くアプリの推定値のほうが役に立つ。

## 3つのモジュール

| モジュール | 中身 |
|---|---|
| fitness | 食事（PFC）・体組成・筋トレのログと進捗グラフ |
| skin | 肌状態のチェックインと使用中プロダクトの管理 |
| consult | 記録を文脈として渡して相談できるケース管理 |

モバイルは上部のピル、デスクトップはサイドバーで切り替える。

## AI を使っているところ

`src/app/api/` の11本のルートハンドラが Claude API を叩く。

- `analyze-meal` — 食事写真、またはテキスト説明から PFC とカロリーを推定
- `analyze-body` / `analyze-physique` — 体組成の数値と体型写真の変化を読む
- `analyze-skin` / `skin-spot` / `skin-advice` — 肌の状態を評価してケアを提案
- `consult` — 蓄積した記録を文脈に含めて相談に答える
- `weekly-review` — 週次サマリーの生成。`cron/weekly-review` から定期実行

出力は構造化 JSON に固定していて、システムプロンプトでスキーマを指定したうえで、返ってきた文字列のコードフェンスを剥がしてパースする（`src/lib/ai.ts`）。信頼度を `high` / `medium` / `low` で返させて、低いときは UI 側で確認を促す。

## 実装で気をつけたところ

画像は `browser-image-compression` で端末側で圧縮してから送る。フル解像度の写真をそのまま送ると、アップロードの待ち時間と API のトークン消費が両方効いてくる。

iOS の PWA はステータスバー直下のタップが吸われるので、モジュール切り替えのピルには `env(safe-area-inset-top)` に追加のクリアランスを足している。

肌と体組成に関する出力には `medical-disclaimer` を必ず添える。推定であって診断ではない。

## セットアップ

```bash
npm install
cp .env.example .env.local
npm run dev
```

必要な環境変数は `ANTHROPIC_API_KEY` と Supabase の接続情報。

## スタック

```
Next.js 16.2 (App Router)   React 19.2   TypeScript 5   Tailwind CSS 4
Supabase                    永続化
@anthropic-ai/sdk           画像・テキスト解析
Serwist                     Service Worker / PWA
Recharts                    進捗グラフ
```

## 注意

個人用に作ったものを公開している。記録している数値は自分の体のもので、リポジトリには含まれていない。栄養と肌の判断はすべて推定で、医療的な助言ではない。
