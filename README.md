# Gemini Translator

X.com（Twitter）で外国語テキストを自動翻訳するChrome拡張機能。

## 機能

- Gemini APIを使用したリアルタイム翻訳
- 英語→日本語 / 日本語→英語の切り替え
- 原文⇄翻訳のワンクリック切り替え
- 日次コスト上限設定
- 用語集（グロッサリー）対応
- サイト別の翻訳ルール設定

## インストール

### リリースからダウンロード（推奨）

1. [Releases](https://github.com/furoku/gemini-translator/releases/latest) から最新のzipをダウンロード
2. 解凍して `extension/` フォルダを取り出す
3. Chromeで `chrome://extensions` を開く
4. 右上の「デベロッパーモード」を有効化
5. 「パッケージ化されていない拡張機能を読み込む」をクリック
6. `extension/` フォルダを選択

### ソースからインストール

```bash
git clone https://github.com/furoku/gemini-translator.git
```

その後、上記の手順3〜6を実行。

## APIキーの取得

1. [Google AI Studio](https://aistudio.google.com/apikey) にアクセス
2. 「APIキーを作成」をクリック
3. 生成されたキーをコピー
4. 拡張機能の設定画面でキーを入力

## 使い方

1. X.com / Twitter を開く
2. 拡張機能アイコンをクリックして設定を確認
3. 自動翻訳がオンなら、外国語ツイートが自動で翻訳される
4. 翻訳テキストをクリックすると原文に戻せる

## 設定項目

| 項目 | 説明 |
|------|------|
| モデル | 使用するGeminiモデル（デフォルト: gemini-2.0-flash-lite） |
| 翻訳方向 | 英語→日本語 または 日本語→英語 |
| 自動翻訳 | ON/OFF |
| 日次上限 | コストまたは文字数の上限 |
| 除外キーワード | 翻訳しないアカウントやキーワード |
| 用語集 | 固有名詞などの翻訳ルール |

※ 対象サイトを増やす場合は、設定のホワイトリストに追加して権限を許可してください。

## コントリビューション / セキュリティ

- コントリビューション: `CONTRIBUTING.md`
- 行動規範: `CODE_OF_CONDUCT.md`
- セキュリティ報告: `SECURITY.md`
- プライバシーポリシー: `PRIVACY.md`

## ライセンス

MIT License
