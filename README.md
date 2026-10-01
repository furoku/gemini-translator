# Gemini Translator

X.com（Twitter）と、利用者が明示的に許可したWebサイトの外国語テキストをGoogle Gemini APIで翻訳するChrome拡張です。

## 現在の状態

- Status: maintained source project
- Extension version: `26.0830.1`
- Default model: `gemini-3.5-flash-lite`
- Model / pricing review: 2026-08-30
- Distribution: GitHub source and Releases

## 主な機能

- 英語→日本語 / 日本語→英語
- 原文と翻訳の切り替え
- 日次の金額・文字数上限
- 用語集と除外ワード
- 利用者が登録したサイトごとの翻訳エリア・除外エリア
- 翻訳キャッシュと利用量表示

## モデル

Google公式の安定版から次を選べます。

- `gemini-3.5-flash-lite` — 既定。高スループットと翻訳向けの現行Flash-Lite
- `gemini-3.1-flash-lite`
- `gemini-2.5-flash-lite`

停止済みのGemini 2.0系、`gemini-3.1-flash-lite-preview`、旧Flash-Lite previewを保存している場合は、初回起動時に`gemini-3.5-flash-lite`へ移行します。料金は変更されるため、固定額をREADMEへ転記せず[Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)を正本とします。

## インストール

1. [Releases](https://github.com/furoku/gemini-translator/releases/latest)からZIPを取得するか、このリポジトリをcloneします
2. Chromeで`chrome://extensions`を開きます
3. デベロッパーモードを有効にします
4. 「パッケージ化されていない拡張機能を読み込む」から`extension/`を選びます
5. 設定画面でGoogle AI StudioのAPIキーを入力します

## プライバシーと権限

- APIキー、設定、利用量は`chrome.storage.local`へ保存し、Chrome同期は使用しません
- 翻訳対象テキストとAPIキーは、翻訳時にGoogle Gemini APIへ送信します
- 開発者が運営する中継サーバー、分析SDK、テレメトリーはありません
- X以外のサイト権限は、利用者がサイトを登録して許可した場合だけ要求します
- サイト名とCSSセレクタは保存前と表示前に検証し、設定画面でHTMLとして実行しません

詳細は[PRIVACY.md](PRIVACY.md)と[SECURITY.md](SECURITY.md)をご覧ください。

## 開発と確認

```bash
npm ci --prefix extension
node scripts/validate-manifest.mjs
npm test --prefix extension
node scripts/security-audit.mjs
npm audit --prefix extension --audit-level=high
```

CIでは次を確認します。

- manifestが参照するファイルの存在
- JavaScript構文
- 停止済みモデルのUI露出防止
- モデル移行
- 悪意あるサイト設定をHTMLとして解釈しないこと
- `node_modules`や不要ファイルがGit管理されていないこと
- high以上の依存脆弱性

## 対応範囲と制約

- X以外のサイト対応は実験的です
- DOM構造が変わると翻訳対象を取得できなくなる場合があります
- Gemini APIのモデル、料金、上限、データ取扱いはGoogleの最新条件に従います
- 翻訳結果には誤りが含まれる可能性があります

## ライセンス

ソースコードとこのリポジトリの自作ドキュメントは[MIT License](LICENSE)です。Google、Gemini、Chrome、X、Twitter、および各サイトの名称・商標・コンテンツは各権利者に帰属します。
