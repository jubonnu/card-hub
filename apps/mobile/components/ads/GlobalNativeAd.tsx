import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeAd, NativeAdView, NativeAsset, NativeAssetType } from 'react-native-google-mobile-ads';

import { getAdRequestOptions } from '@/lib/ads';
import { getNativeAdUnitId } from '@/lib/adUnitIds';
import { useAdsEnabled } from '@/hooks/useAdsEnabled';
import { useTheme } from '@/theme/useTheme';

interface GlobalNativeAdProps {
  /**
   * ホームインジケータ分の下paddingを自前で確保するか。グロナビ（`BottomTabs`）の直上に
   * 置く場合はタブバー自体が下paddingを持つためfalseにする。グロナビの無い画面で
   * `app/_layout.tsx`から画面最下部に直接置く場合はtrue（デフォルト）。
   */
  withBottomInset?: boolean;
}

/**
 * どの画面でも常時表示するネイティブ広告（Mobile広告導入）。`GlobalBannerAd`の後継として
 * グロナビの直上・画面最下部に置く1行レイアウトの広告枠。グロナビのある4タブ画面では
 * `BottomTabs.tsx`がタブバーの直上にこのコンポーネントを描画する。グロナビの無い個別画面
 * （抽選詳細・設定・paywall等）では`app/_layout.tsx`が`<Stack>`と並列に、画面最下部に描画する。
 *
 * 広告の読み込み中・広告無効時もカードと同じ高さ（`CARD_HEIGHT`）のプレースホルダーを確保する。
 * `GlobalNativeAd`はグロナビ（`BottomTabs`）の直上に置かれるため、広告読み込み完了後に
 * 急に高さが増えるとグロナビ自体の高さが後から変わり、React Navigation側のタブバー高さ
 * 再計測タイミングのズレで画面コンテンツと重なって見える不具合があったため。
 */
export function GlobalNativeAd({ withBottomInset = true }: GlobalNativeAdProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const adsEnabled = useAdsEnabled();
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);
  // `NativeAdView`はネイティブSDK側で独自にAuto Layoutするため、幅をflexで可変にすると
  // マウント時点の過渡的な幅で内部レイアウトが固まり、最終的な幅に追従せず中身が
  // 左右どちらかに寄って見える不具合があった。`wrap`のpaddingHorizontal分を差し引いた
  // 確定済みの幅を最初から明示的に渡すことで回避する。
  const cardWidth = windowWidth - styles.wrap.paddingHorizontal * 2;

  useEffect(() => {
    if (!adsEnabled) return;

    let cancelled = false;
    let loaded: NativeAd | null = null;

    NativeAd.createForAdRequest(getNativeAdUnitId(), getAdRequestOptions())
      .then((ad) => {
        if (cancelled) {
          ad.destroy();
          return;
        }
        loaded = ad;
        setNativeAd(ad);
      })
      .catch(() => {
        // 広告の読み込み失敗時はプレースホルダーのまま（カード自体は表示しない）。
      });

    return () => {
      cancelled = true;
      loaded?.destroy();
      setNativeAd(null);
    };
  }, [adsEnabled]);

  if (!adsEnabled) return null;

  return (
    <View style={[styles.wrap, { paddingBottom: withBottomInset ? insets.bottom + 8 : 8 }]}>
      {!nativeAd ? (
        <View style={[styles.card, { width: cardWidth }]} />
      ) : (
        <NativeAdView
          nativeAd={nativeAd}
          style={[styles.card, { width: cardWidth, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <View style={styles.bodyRow}>
            {nativeAd.icon ? (
              <NativeAsset assetType={NativeAssetType.ICON}>
                <Image source={{ uri: nativeAd.icon.url }} style={styles.icon} />
              </NativeAsset>
            ) : (
              <View style={[styles.icon, { backgroundColor: theme.colors.chipTrack }]} />
            )}
            <View style={styles.body}>
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text style={[styles.headline, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  {nativeAd.headline}
                </Text>
              </NativeAsset>
              <View style={styles.subRow}>
                {nativeAd.starRating ? (
                  <NativeAsset assetType={NativeAssetType.STAR_RATING}>
                    <Text style={[styles.subText, { color: theme.colors.textTertiary }]}>
                      {`★${nativeAd.starRating.toFixed(1)}`}
                    </Text>
                  </NativeAsset>
                ) : null}
                {nativeAd.price ? (
                  <NativeAsset assetType={NativeAssetType.PRICE}>
                    <Text style={[styles.subText, { color: theme.colors.textTertiary }]} numberOfLines={1}>
                      {nativeAd.price}
                    </Text>
                  </NativeAsset>
                ) : null}
              </View>
            </View>
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <View style={[styles.ctaPill, { backgroundColor: theme.colors.green }]}>
                <Text style={styles.ctaPillText} numberOfLines={1}>
                  {nativeAd.callToAction}
                </Text>
              </View>
            </NativeAsset>
          </View>
        </NativeAdView>
      )}
    </View>
  );
}

const CARD_PADDING = 8;
const CARD_HEIGHT = 56;
// `NativeAdView`配下では子要素のflex:1が親の確定済み高さとして正しく伝わらないことがあるため
// （実機で下寄せになる不具合があった）、bodyRowの高さはflexに任せず数値で明示する。
const CARD_INNER_HEIGHT = CARD_HEIGHT - CARD_PADDING * 2;
// 上記対応後もわずかに下寄り・右寄りに見えたため、上下・左右のpaddingをあえて非対称にして
// カード（背景の四角）に対して中身を少し上・左にずらす。
const CARD_VERTICAL_NUDGE = 5;
const CARD_HORIZONTAL_NUDGE = 3;

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  card: {
    height: CARD_HEIGHT,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: CARD_PADDING - CARD_HORIZONTAL_NUDGE,
    paddingRight: CARD_PADDING + CARD_HORIZONTAL_NUDGE,
    paddingTop: CARD_PADDING - CARD_VERTICAL_NUDGE,
    paddingBottom: CARD_PADDING + CARD_VERTICAL_NUDGE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  bodyRow: {
    height: CARD_INNER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 9,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headline: {
    fontSize: 13,
    fontWeight: '700',
  },
  subRow: {
    flexDirection: 'row',
    gap: 8,
  },
  subText: {
    fontSize: 11,
  },
  ctaPill: {
    borderRadius: 999,
    paddingHorizontal: 13,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
