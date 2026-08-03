# CardHub 環境まとめ

## 1. 環境は3つ

| 環境 | 何か | Worker名 | DB名 |
|---|---|---|---|
| ローカル | 自分のMacだけで動く。外部コストゼロ | - | ローカルファイル |
| ステージング | 実機で試す用。本番とは別のDB・Workerを使う | `x-post-ingest-staging` | `cardhub-staging` |
| 本番 | 実際にリリースするアプリが繋がる先 | `x-post-ingest` | `x-post-fetcher` |

モバイルのビルド（`development` / `preview` / `production`）は、上記のどれか1つに繋がるように設定されている。

| モバイルのビルド | 繋がる先 |
|---|---|
| `development`（Metro併用） | ローカル |
| `preview` | ステージング |
| `production` | 本番 |

---

## 2. 実行コマンド

### ローカル

```
cd x-post-fetcher
INGEST_TOKEN=dev-secret TURSO_DATABASE_URL=file:local.db npm run worker:dev
```

```
cd CardHub/apps/mobile
eas build --profile development --platform ios
npx expo start --dev-client
```

### ステージング（実機ですぐ試したい時）

Workerの再デプロイ:
```
cd x-post-fetcher/apps/worker
npx wrangler deploy --env staging
```

アプリのビルド（毎回作り直さなくてよい。JSだけの変更ならupdateで十分）:
```
cd CardHub/apps/mobile
eas build --profile preview --platform ios       # ネイティブ変更があった時のみ
eas update --branch preview --platform ios --message "変更内容"   # 普段はこちら
```

### 本番（リリース用）

```
cd x-post-fetcher/apps/worker
npx wrangler deploy
```

```
cd CardHub/apps/mobile
eas build --profile production --platform ios
eas update --branch production --platform ios --message "変更内容"
```

---

## 3. 課金（RevenueCat）はどこで確認できる？

**ステージングでのみ確認する。** `preview`ビルドをインストールし、実機のSandbox Apple IDで購入操作すれば、実際に課金額は発生せずに一連の流れ（購入→サーバー反映→premium機能解放）を確認できる。

- ローカルは課金系のSecretが基本未設定なので確認不可
- 本番は実際に課金が発生するため、動作確認目的では使わない

---

## 4. 忘れやすい注意点

- モバイルの環境変数（Worker URL等）はローカル`.env`ではなく**EAS Environment Variables**で管理（`npx eas env:list --environment <preview|production>`で確認、値は非表示）
- ネイティブ変更（ライブラリ追加等）は`eas update`では届かない。必ず`eas build`が必要
- ステージングDBの抽選データは本番からの**一度きりのコピー**。自動同期はしていないので、古くなったら手動で入れ直す
- Secret登録: `echo "<値>" | npx wrangler secret put <NAME>`（本番）／`--env staging`を付けるとステージング
