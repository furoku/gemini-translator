# gemini-translator ハーネス コンテキスト

## 対象リポジトリ
`/home/exedev/.openclaw/workspace/furoku/gemini-translator`

## アクティブIssue
- **#2** Popup UIのシンプル化とUX改善
- **#3** Gemini 3.1 Flash Lite 対応

## ファイルマップ（主要）
```
extension/
├── popup.html       ← メインUI
├── popup.js         ← UIロジック
├── options.html     ← 詳細設定ページ
├── options.js       ← 詳細設定ロジック
├── content-ui.js    ← ページ内パネルUI
├── content-core.js  ← 翻訳コアロジック
├── background.js    ← バックグラウンド処理
└── manifest.json    ← 拡張マニフェスト
```

## 現状のモデルリスト（popup.html）
- `gemini-2.5-flash-lite` (2.5 Lite)
- `gemini-2.5-flash` (2.5 Flash)
- `gemini-3.0-flash` (3.0 Flash)

## popup.js の PRICING テーブル
```js
'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
'gemini-2.0-flash-lite': { input: 0.075, output: 0.30 },
'gemini-2.0-flash': { input: 0.10, output: 0.40 },
'gemini-2.5-flash': { input: 0.30, output: 2.50 },
'gemini-3-flash-preview': { input: 0.30, output: 2.50 },
```

## content-ui.js のモデルリスト
- gemini-2.0-flash-lite, gemini-2.0-flash
- gemini-2.5-flash-lite, gemini-2.5-flash
- gemini-3-flash-preview

## Issue #2 要件（UI シンプル化）
1. `help-card`（「初めてのサイト追加」説明文）を**デフォルト非表示**に変更
2. メインの翻訳ON/OFFスイッチを**より目立つ**デザインに
3. APIキー入力欄を`<details>`タグで折り畳む（デフォルト閉じ）
4. ボタン「登録して許可」→「**保存**」に変更（※ `gx-request-permission` の textContent）

## Issue #3 要件（Gemini 3.1 Flash Lite 追加）
- モデル名: `gemini-3.1-flash-lite`（推定API識別子、要確認）
- 追加先ファイル: popup.html, popup.js (PRICING), options.html, content-ui.js, content-core.js, background.js
- 価格は調査次第（暫定: input=0.10, output=0.40）

## ループ状態
- [x] Issue #2 実装（2026-03-04 完了）
- [ ] Issue #3 実装
- [ ] 両Issue のPR作成
- [ ] レビュー・マージ

## 改善ログ

### 2026-03-04 Issue #2 実装完了（えいちゃん）

**実施した変更:**
1. **help-card非表示化** — `.help-card { display: none; }` をCSSに追加。ただし `updateRegistryStatus()` 内で `help.style.display = ''` でJS側から表示制御されているため、未登録サイトでは引き続きJS側が表示させる動作が残る。意図的な挙動かは要確認。
2. **トグルスイッチ拡大** — `.switch` を 44×24px → 60×32px に変更。slider:beforeも 18×18px → 24×24px、translateX(20px) → translateX(28px) に調整。
3. **APIキー欄を`<details>`で折り畳み** — `<details>` + `<summary>🔑 API設定</summary>` でラップ。デフォルト閉じ。既存の `details` グローバルCSSスタイルがボーダーを追加するため、インラインで `border: none; background: transparent;` を上書きしている。
4. **popup.jsの「登録して許可」→「保存」** — 2箇所の指示だったが実際は3箇所あったため全3箇所を変更。
5. **popup.htmlの「登録して許可」→「保存」** — `gx-request-permission` ボタンのデフォルトテキストを変更。

**注意点:**
- `gx-request-permission` ボタンのテキストはJS側の `updatePermissionStatus()` でも動的に書き換えられる（登録済み時は「許可済み」など）。デフォルト初期値を「保存」にしても正常動作するはず。
- `details` 要素のグローバルCSSスタイル（border-top付き）がAPIキーの `<details>` にも適用されるため、見た目が微妙かもしれない。スタイル調整が必要な場合はクラス名を付けて分岐させると良い。
