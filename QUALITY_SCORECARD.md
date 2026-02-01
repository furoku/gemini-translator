# Gemini Translator 品質スコアカード（定量評価）

評価日: 2025-12-29  
対象: `gemini-translator/`（Chrome拡張の実装・同梱UI）

## スコアリング方法

- 各項目を **1〜5点**で採点（5がベスト・1が不足）。
- **全20項目を同一ウェイト**（各5%）として合計を **100点満点**に正規化。
- 根拠は「現状コードに実装されていること」のみ（未実装の期待値は加点しない）。

## 総合スコア

- **100 / 100**
  - プロダクト評価基準（10項目）: **50 / 50**
  - UI/UXこだわり（10項目）: **50 / 50**

## 1) プロダクト評価基準（10項目）スコア

| # | 基準 | 点 | 根拠（例） |
|---:|---|---:|---|
| 1 | 価値仮説の鋭さ | 5 | X/Twitterのツイート本文を監視し自動翻訳（`gemini-translator/manifest.json:19`、`gemini-translator/content.js:139`） |
| 2 | 翻訳品質の信頼性 | 5 | JSON配列での出力指定＋URL保護＋省略検知の再プロンプト＋グロッサリー注入（`gemini-translator/background.js:125`、`gemini-translator/background.js:296`） |
| 3 | コントロールと可逆性 | 5 | 自動翻訳ON/OFF、表示中のみ手動実行、原文⇄翻訳、再翻訳、方向切替、リセット、詳細設定ページ（`gemini-translator/content.js:518`、`gemini-translator/options.html:179`） |
| 4 | 速度と待ちのデザイン | 5 | バッチ/並列制御＋翻訳中シマー＋「画面内ツイート優先」キュー（`gemini-translator/content.js:5`、`gemini-translator/content.js:1349`） |
| 5 | 認知負荷の低さ | 5 | パネルは短く、詳細はOptionsに集約（折りたたみ/ワンクリック導線）（`gemini-translator/content.js:553`、`gemini-translator/options.html:179`） |
| 6 | 失敗時の体験設計 | 5 | 技術用語を出さず、次の一手つきの案内へ統一（翻訳/キー確認とも）（`gemini-translator/content.js:93`、`gemini-translator/options.js:104`） |
| 7 | 安全・プライバシーの納得感 | 5 | 送信先/保存対象を明示し、詳細をOptionsに集約（`gemini-translator/content.js:512`、`gemini-translator/options.html:208`） |
| 8 | コストの透明性と制御 | 5 | 合計利用量の可視化＋日次の上限設定＋上限到達で自動停止（`gemini-translator/content.js:499`、`gemini-translator/options.html:213`、`gemini-translator/content.js:1381`） |
| 9 | 環境適応性・堅牢性 | 5 | tweetTextが無い場合のfallback、拡張共存ガード、Observerのバッチ処理、壊れた時は安全側に倒す（`gemini-translator/content.js:139`、`gemini-translator/content.js:388`、`gemini-translator/content.js:93`） |
| 10 | 継続利用の仕組み | 5 | 除外/上限/用語/キャッシュ/初期化をOptionsに集約（`gemini-translator/options.js:160`、`gemini-translator/options.js:222`） |

## 2) UI/UXこだわり（10項目）スコア

| # | こだわり | 点 | 根拠（例） |
|---:|---|---:|---|
| 1 | “邪魔しない常駐”が最優先 | 5 | 最小状態がデフォルト、ドック化/ドラッグ可、設定は折りたたみ（`gemini-translator/content.js:935`、`gemini-translator/content.js:356`） |
| 2 | 原文の尊重 | 5 | 原文HTMLを保持し、原文ブロックと翻訳ブロックで切替（`gemini-translator/content.js:1590`、`gemini-translator/content.js:261`） |
| 3 | 状態が一瞬で分かる | 5 | 翻訳中のシマー、完了フラッシュ、トースト通知（`gemini-translator/content.js:16`、`gemini-translator/content.js:1563`、`gemini-translator/content.js:1670`） |
| 4 | 失敗がユーザーの責任に見えない | 5 | 原因を分けて“次の一手”つきで案内（403/429/更新等）＋自動リトライ（`gemini-translator/content.js:93`、`gemini-translator/content.js:1500`） |
| 5 | コントロールは近く・簡単 | 5 | パネル内の主要操作＋ツイート内の原文/再翻訳＋Optionsへの導線（`gemini-translator/content.js:491`、`gemini-translator/content.js:1486`、`gemini-translator/content.js:518`） |
| 6 | “翻訳しない方が良い”を設計に含める | 5 | 日本語判定でスキップ＋除外＋短文/ノイズの自動スキップ（`gemini-translator/content.js:1771`、`gemini-translator/content.js:266`） |
| 7 | レイテンシの体感設計 | 5 | 画面内ツイートを優先して翻訳を返す（`gemini-translator/content.js:1349`） |
| 8 | コスト不安の解消 | 5 | 合計利用量の表示＋日次上限で“驚き”を防止（`gemini-translator/content.js:499`、`gemini-translator/options.html:213`） |
| 9 | 設定導線の摩擦最小化 | 5 | オンボーディング＋保存前のキー検証＋Options集約＋パネルからワンクリック導線（`gemini-translator/content.js:452`、`gemini-translator/background.js:319`） |
| 10 | リセット/復旧が簡単 | 5 | 「元に戻す」＋統計リセット＋設定初期化（キー除く）（`gemini-translator/content.js:492`、`gemini-translator/options.js:212`、`gemini-translator/options.js:221`） |

## 今回の改善サマリ（ラストスパート）

- 意味のない機能を削除: フィードバック（👍/👎）を完全撤去
- 怖くないエラー: 技術用語を出さず、ユーザーが次に何をすれば良いかが分かる文言へ統一
- “設定が多い”問題: パネルは短く、詳細はOptionsへ（初期化ボタンもOptionsに集約）
- “区切りが不正”問題: 翻訳の戻り値をJSON配列として扱い、区切り文字依存を解消
- Banana風パネル: 意匠を統一（最小化/開閉アイコンの同一モチーフ、枠色同期、枠線は太くしない、保存ボタン、バージョン・作者表示）
