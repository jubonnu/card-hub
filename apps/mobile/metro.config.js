const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// getDefaultConfig(expo/metro-config)の代わりにgetSentryExpoConfigを使う。ソースマップに
// Debug IDを埋め込み、EAS Build時にSentryへアップロードするソースマップと実際にユーザーの
// 端末で動くバンドルを正しく突き合わせられるようにするため（Sentryの推奨設定）。
const config = getSentryExpoConfig(__dirname);

// zustand（および一部の他パッケージ）は package.json "exports" 経由だとESMビルド
// （import.meta.env を含み、Metroのweb向けバンドルではSyntaxErrorになる）が
// 選択されてしまうことがある。exports解決を無効化し、従来のmain fieldベースの
// 解決（CommonJS版）にフォールバックさせることで回避する。
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
