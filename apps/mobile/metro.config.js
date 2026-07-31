const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// zustand（および一部の他パッケージ）は package.json "exports" 経由だとESMビルド
// （import.meta.env を含み、Metroのweb向けバンドルではSyntaxErrorになる）が
// 選択されてしまうことがある。exports解決を無効化し、従来のmain fieldベースの
// 解決（CommonJS版）にフォールバックさせることで回避する。
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
