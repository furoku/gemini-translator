# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Gemini Translatorは、X.com（Twitter）などのウェブサイトで外国語テキストを自動翻訳するChrome拡張機能。Gemini APIを使用し、ツイートやページコンテンツをリアルタイムで翻訳する。

## 開発コマンド

```bash
# Chrome拡張機能として読み込む
# 1. chrome://extensions を開く
# 2. 「デベロッパーモード」を有効化
# 3. 「パッケージ化されていない拡張機能を読み込む」で extension/ フォルダを選択
```

テストフレームワークやビルドシステムは存在しない。手動テストが基本。

## アーキテクチャ

### ファイル構成

```
extension/
├── manifest.json      # Manifest V3設定
├── background.js      # Service Worker - 翻訳APIリクエスト処理
├── content.js         # コンテンツスクリプト - DOM操作・UI・翻訳キュー
├── gemlab-utils.js    # 共有ユーティリティ（トースト、エラー検知等）
├── popup.html/js      # ツールバーポップアップUI
├── options.html/js    # 詳細設定ページ
└── icons/             # 拡張機能アイコン
```

### データフロー

1. **content.js**: MutationObserverでDOMを監視し、翻訳対象テキストを検出
2. **content.js → background.js**: `chrome.runtime.sendMessage`で`TRANSLATE_TEXT_BG`メッセージ送信
3. **background.js**: Gemini APIにリクエスト、JSON配列形式で翻訳結果を取得
4. **background.js → content.js**: 翻訳結果を返却
5. **content.js**: DOMを更新し、翻訳テキストを表示

### 翻訳処理の特徴

- **バッチ処理**: 複数テキストをJSON配列として一括翻訳（`MAX_BATCH_SIZE=12`, `MAX_BATCH_CHARS=4000`）
- **並列制御**: `MAX_PARALLEL_REQUESTS=2`で同時リクエスト数を制限
- **画面内優先**: 表示領域内のコンテンツを優先的に翻訳
- **URL保護**: `<<GX_0_URL_0>>`形式のプレースホルダーでURLをマスク
- **省略検知**: 翻訳結果が極端に短い場合、再プロンプトで修正

### UI構成

- **フローティングパネル**: content.jsで動的生成、ドラッグ移動・最小化対応
- **原文⇄翻訳切替**: 原文HTMLを保持し、ワンクリックで切替可能
- **シマーエフェクト**: 翻訳中の視覚フィードバック（`gx-mosaic`クラス）

### 設定ストレージキー

```javascript
geminiApiKey           // APIキー
geminiModel            // モデル名（デフォルト: gemini-2.0-flash-lite）
translationDirection   // 'en_to_ja' または 'ja_to_en'
isAutoTranslateEnabled // 自動翻訳ON/OFF
excludeKeywords        // 除外キーワード配列
dailyCostLimitUsd      // 日次コスト上限
dailyTotalCharsLimit   // 日次文字数上限
glossaryPairs          // 用語集（{from, to}配列）
siteWhitelist          // 対象サイトホスト名配列
siteRules              // サイト別セレクタルール
modelStats             // モデル別統計（毎朝4時リセット）
```

## 設計原則

`PRODUCT_DESIGN_CRITERIA.md`に詳細あり。主な原則:

1. **邪魔しない常駐**: 視線・操作を妨げない最小限のUI
2. **原文の尊重**: 翻訳後も原文に切替可能、構造を壊さない
3. **失敗時の体験**: 技術用語を出さず、次の一手を案内
4. **コスト不安の解消**: 利用量可視化・日次上限で驚きを防止

## エラーハンドリング

`humanizeErrorMessage()`でAPIエラーをユーザーフレンドリーな日本語に変換。拡張機能コンテキスト無効化時は`handleExtensionContextInvalidated()`で安全に停止。

## 日本語優先

UIテキスト・エラーメッセージ・コメントはすべて日本語。
