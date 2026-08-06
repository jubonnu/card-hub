/**
 * 利用規約・プライバシーポリシー・サポートページの公開URL。アプリ内の複数箇所（マイページ、
 * プレミアムプラン画面等）から参照するため、ここに一元管理する。
 *
 * 独自ドメインは使わず、Cloudflare Pagesのデフォルトサブドメイン（*.pages.dev）を使う方針。
 * TODO: legal-site（リポジトリルート）をCloudflare Pagesのプロジェクト名「cardhub-legal」で
 * 公開した場合の想定URL。実際にデプロイした後、発行されたURLと一致するか確認し、
 * 異なる場合はここを実際のURLに置き換えること。詳細はdocs/legal-open-questions.mdを参照。
 */
const LEGAL_SITE_BASE_URL = 'https://cardhub-legal.pages.dev';

export const TERMS_OF_SERVICE_URL = `${LEGAL_SITE_BASE_URL}/terms/`;
export const PRIVACY_POLICY_URL = `${LEGAL_SITE_BASE_URL}/privacy/`;
export const SUPPORT_URL = `${LEGAL_SITE_BASE_URL}/support/`;
