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

// posthog-react-native（PostHog導入、2026-09-13）は内部で`@posthog/core/surveys`をpackage.json
// "exports"経由のサブパスとしてのみ公開しており、上記でexports解決を無効化した影響で
// 通常のファイル解決では見つからずビルドが失敗する（Surveys機能自体は使用していないが、
// posthog-react-native側が無条件にrequireするため回避できない）。このサブパスだけ実体の
// ファイルへ直接解決するようoriginalResolveRequestの前段でハンドルする。
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@posthog/core/surveys') {
    return context.resolveRequest(context, '@posthog/core/dist/surveys/index.js', platform);
  }
  if (originalResolveRequest) return originalResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
