方針は承認します。実装を進めてください。

以下のルールで確定します。

1. attempt 開始

-   applied への到達で新規 attempt を開始する
-   オープン中の attempt がない状態で unknown から won/lost へ直接到達した場合も、
    そのイベントを開始兼結果確定の 1attempt として扱う
-   unknown のみで終わるものは attempt として数えない

2. attempt 結果

-   各 attempt で最初に到達した won または lost を結果とする
-   won 後の purchased/skipped は同一 attempt の後続状態とする
-   再度 applied へ到達した場合は新しい attempt を開始する

3. 訂正イベント
   purchased→won は新規 attempt ではない。
   ただしイベントを完全に無視するのではなく、
   同一 attempt の購入状態を訂正するものとして扱う。

例:

-   won→purchased
    当選 1、購入 1
-   won→purchased→won
    当選 1、購入 0
-   won→skipped
    当選 1、購入見送り 1
-   won→skipped→won
    当選 1、購入見送り 0

同様に、isCorrectionTransition で許可される他の遷移も確認し、
結果状態・購入状態のどちらを訂正するイベントかを明文化してください。

4. 集計実装

-   履歴は id 昇順で取得する
-   lotteryId ごとに 1 回スキャンする
-   共通の純粋 TS 関数で attempt を再構築する
-   summary/monthly/stores で同じ attempt 集計結果を使用する
-   DB アクセスと集計ロジックを分離する

5. 期間集計

-   応募数は attempt 開始日時を基準とする
-   当選・落選数は結果確定日時を基準とする
-   購入数・購入見送り数は各後続イベント日時を基準とする
-   JST 基準で統一する

6. テスト
   最低限、以下を追加してください。

-   unknown のみ
-   unknown→won
-   unknown→lost
-   applied→won
-   applied→lost
-   applied→won→purchased
-   applied→won→purchased→won
-   applied→won→skipped
-   applied→won→skipped→won
-   applied→won→skipped→planned→applied→lost
-   同一 status の重複イベント
-   changedAt 同一時の id 順安定性
-   summary/monthly/stores で集計結果が一致すること

将来的な attempt_id 追加は今回は行わず、
履歴再構築方式で進めてください。
