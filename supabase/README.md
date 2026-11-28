# KutsuDoki（クツドキ）共有統計のセットアップ

ブログの個人記録は `localStorage` に保存されます。現在のUIではヘッダーに統計利用の案内とプライバシーポリシーを表示し、新規登録した記録を自動でEdge Functionへ送信して、非公開の投稿テーブルへ保存します。APIには登録操作に基づく `consent: true` を送信します。ブラウザから取得できるのは同じシューズに有効な記録が1件以上あれば表示する公開統計と、メーカー名・シューズ名だけの共有候補一覧です。同じ利用者・ブラウザからの複数記録も件数に含めます。1件の統計では平均・中央値・最小値・最大値はその記録の距離になります。

メーカー名とシューズ名は `shoe_models.manufacturer` と `shoe_models.model_name` に分けて保存します。従来の `canonical_name` とモデルIDは維持します。既存プロジェクトでは `supabase/sql/add-shoe-manufacturer-model.sql` を適用してからFunctionを再デプロイしてください。旧アプリからの送信も引き続き受け付けます。

同じモデルの複数の靴は、任意の「識別名」（例：青、白、2足目）で区別できます。識別名は最大40文字で、`shoeLifespanRecordsV2` の各記録の `pairLabel` としてブラウザ内に保存します。「自分の記録」の識別名を編集すると自動保存され、既存記録にも追加できます。Supabaseへは送信せず、共有候補・個人のモデル別集計・公開統計はメーカー名とシューズ名でまとめます。各足は別の記録IDを持ち、識別名の変更では新しい投稿は作成しません。

「自分の記録」の「編集」からメーカー名・シューズ名・距離・識別名を登録フォームへ読み込み、「変更を保存」で更新できます。「編集をキャンセル」は未保存の変更を破棄します。提供済みの記録は同じ投稿IDとブラウザ識別子でEdge Functionへ `action: "save"` を送り、専用RPC `save_shoe_lifespan_submission` で元の投稿を更新します。RPCは `service_role` だけが実行でき、保存済みの提供者ハッシュが一致する場合にだけ更新します。投稿ID・作成日時・管理者の除外状態を保持し、変更前後のモデルの統計は既存トリガーで再計算します。

送信が失敗した編集は `pendingUpdate: true` としてブラウザへ保存し、再読み込み後の再試行でも同じ投稿を更新します。元の登録がサーバーへ届いていなかった場合だけ同じ投稿IDで追加するため、再送で件数は増えません。識別名だけの変更や、以前に統計へ提供していなかった個人記録の編集は送信しません。ブラウザ識別子を消去した場合は元の提供済み投稿を更新できません。

プルダウンのメーカー・シューズ候補はSupabaseの `shoe_models` で一元管理し、`get_shoe_catalog()` RPCで取得します。旧YAMLの6メーカー12モデルは `supabase/sql/migrate-initial-shoe-catalog.sql` で移行済みです。YAMLや画面内のモデル一覧は使用しません。移行SQLは新しい環境の初期登録にも使用でき、再実行しても重複しません。

2026年11月28日に、公式サイトで名前を確認した48モデルを `supabase/sql/seed-major-shoe-catalog.sql` で追加し、事前候補は合計12メーカー60モデルになりました。HOKA・Saucony・MIZUNO・On・ALTRA・Salomonを加え、従来メーカーの候補も拡充しています。確認元URLはSQL内のコメントに記載しています。候補名のみで、価格・推奨寿命・使用記録は登録しません。

管理者が使用記録なしで候補を追加する場合は、`shoe_models` の `canonical_name`（メーカー＋シューズ名）、`normalized_name`（既存Functionと同じ正規化規則）、`manufacturer`、`model_name` を設定し、`is_catalog_entry` を `true` にします。使用記録や統計のダミーデータは不要です。一般ユーザーが送信したシューズは、有効な投稿が1件あれば候補になります。

端末内の記録も即時に候補へ追加されます。別ブラウザでは画面を開き直すと最新候補を取得します。Supabaseの候補と端末内記録を統合し、表記の大文字小文字や空白による重複を除きます。通信できない場合も端末内の記録と手入力は利用できます。JavaScript内のメーカー別名は過去の記録の読み取り互換用で、候補一覧ではありません。

「みんなのシューズ寿命統計」は登録件数の多い上位5種類を初期表示します。「シューズを検索」タブでは全公開統計を対象にメーカー名・シューズ名で検索できます。空白区切りの複数語に対応し、既存の表記辞書を利用して日本語のメーカー名・モデル名も照合します。検索語はタブを切り替えても保持します。公開統計は空のページに到達するまで分割取得するため、Supabaseの1回の取得上限を超えても検索対象に含まれます。統計の公開条件や外れ値の扱いは変わりません。

入力候補と表記照合には `assets/js/shoe-names.mjs` を使います。メーカー別名、全角・半角、ひらがな・カタカナ、主要モデル名の日本語・英語表記を照合し、一意に一致する場合はSupabaseの登録名を使用します。型番・世代番号は維持し、不確かな誤字は候補表示にとどめます。候補にないモデルは手入力の名前を保持します。これはメーカー・シリーズ名の別名辞書であり、シューズ候補の固定一覧ではありません。

同じモジュールをEdge Functionからも読み込み、ブラウザの古い候補や直接の送信でも登録前に照合します。既存の正規モデルIDへ登録し、正規表記をレスポンスで返して端末内の新規記録も同期します。過去の記録を一括で書き換えたり、世代違いのモデルを統合したりはしません。

既存プロジェクトでは `supabase/sql/add-shared-shoe-catalog.sql` を適用してください。RPCは名前だけを返し、個別の走行距離・日時・識別子は返しません。`shoe_models` と `shoe_lifespan_submissions` 自体の一般公開読み取り権限は付与しません。以前のUIで共有しなかった既存記録は自動送信せず、そのブラウザの候補にのみ使用します。管理者が候補指定したモデル以外では、全投稿が `excluded` のモデルや、登録に失敗してモデル名だけ残った行は共有候補から除外します。

## 1. Supabaseデータベース

Supabaseでプロジェクトを作成し、SQL Editorで `running/supabase-setup.sql` を実行します。

既存環境で編集を有効にする場合は `supabase/sql/add-shoe-record-editing.sql` を適用してから `submit-shoe-lifespan` Functionを再デプロイします。検証には `tests/shoe-record-editing.sql` を使用でき、テストデータはロールバックされます。

既存環境で1件目から統計を公開する場合は `supabase/sql/publish-stats-from-one-record.sql` を実行します。制約と集計関数をまとめて更新し、既存の記録も再集計します。以前の `publish-stats-from-two-records.sql` は旧条件の移行履歴であり、現在の環境には使用しません。

距離は10〜3,000kmを受け付け、`accepted` の全記録から件数・平均・中央値・最小値・最大値を計算します。10件以上の場合だけ、10〜90パーセンタイルの範囲内で補正平均を計算します。これは補正平均だけの処理で、範囲外の記録を自動的に `excluded` へ変更する機能ではありません。管理者が `excluded` に変更した記録はすべての集計から外れます。

初期候補も登録する場合は、続けて `supabase/sql/migrate-initial-shoe-catalog.sql` を実行します。候補名のみを登録し、使用記録・走行距離・統計件数は追加しません。

主要メーカーの追加候補を揃える場合は、さらに `supabase/sql/seed-major-shoe-catalog.sql` を実行します。いずれも同じ正規化名が存在する場合はモデルIDを保持し、候補が重複しない形式です。

旧版の `shoe_lifespan_records` が存在する場合、このSQLはテーブルを削除せず、ブラウザからの読み書き権限だけを無効化します。

## 2. Edge Function

Supabase CLIでログイン・プロジェクト接続後、環境変数を登録します。

```sh
supabase secrets set SHOE_STATS_SECRET_KEY=sb_secret_...
supabase secrets set SHOE_STATS_PUBLISHABLE_KEY=sb_publishable_...
supabase secrets set ALLOWED_ORIGINS=https://ara03541506-sys.github.io,http://localhost:4000,http://127.0.0.1:4000
```

Functionをデプロイします。APIキーとオリジン、入力内容はFunction内で検証されます。

```sh
supabase functions deploy submit-shoe-lifespan --use-api --no-verify-jwt
```

新しいSecret keyは、Function secretsに `SHOE_STATS_SECRET_KEY` として設定します。Supabaseが提供する従来の `SUPABASE_SERVICE_ROLE_KEY` も互換用に利用できますが、ブラウザやGitHubには保存しません。

`SHOE_STATS_PUBLISHABLE_KEY` は `_config.yml` の `supabase.publishable_key` と同じ値を設定します。Functionは `apikey` ヘッダーをこの値と照合します。これはアプリのキー確認であり、個人のログイン認証ではありません。許可オリジンと入力検証も行いますが、オリジン制限は不正投稿対策やレート制限の代わりにはなりません。

## 3. ブログの公開設定

`_config.yml` にブラウザ公開可能な値だけを設定します。

```yml
supabase:
  url: "https://PROJECT_REF.supabase.co"
  publishable_key: "sb_publishable_..."
```

Secret keyは `_config.yml` に記載しません。

## 4. 動作確認

1. `bundle exec jekyll build` が成功すること
2. 記録がブラウザ内へ保存されること
3. チェック操作なしで新規登録がSupabaseへ送信され、過去の端末内記録は勝手に送信されないこと
4. 登録した記録が `shoe_lifespan_submissions` に追加されること
5. 同じシューズについて有効な記録が1件届くと `shoe_lifespan_stats` に公開されること（同じブラウザからの複数記録も含む）。すべての記録が `excluded` の場合は非公開になること。`tests/shoe-stat-publication.sql` で確認でき、検証データはロールバックされます。
6. `anon` / Publishable keyでは投稿テーブルを直接取得できないこと

## 承認なし運用

有効な投稿は自動的に `accepted` となります。管理者による都度承認は不要です。問題のある投稿だけ、SQL Editorで `status` を `excluded` に変更するとトリガーが統計を再計算します。

```sql
update public.shoe_lifespan_submissions
set status = 'excluded'
where id = '<submission-id>';
```
