import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { NativeAd, NativeAdView, NativeAsset, NativeAssetType } from 'react-native-google-mobile-ads';

import { getAdRequestOptions } from '@/lib/ads';
import { getNativeAdUnitId } from '@/lib/adUnitIds';
import { useTheme } from '@/theme/useTheme';

/**
 * 抽選一覧（`app/(tabs)/lotteries.tsx`）に数件おきに差し込むネイティブ広告カード。
 * `PublicLotteryCard`と同じカード枠（角丸14・border1px・padding14）に揃える。
 * 読み込み失敗時は何も表示しない（一覧の他アイテムには影響させない）。
 */
export function NativeLotteryAd() {
  const theme = useTheme();
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);

  useEffect(() => {
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
        // 広告の読み込み失敗時はカード自体を表示しない。
      });

    return () => {
      cancelled = true;
      loaded?.destroy();
    };
  }, []);

  if (!nativeAd) return null;

  return (
    <NativeAdView
      nativeAd={nativeAd}
      style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.adBadge, { backgroundColor: theme.colors.chipTrack }]}>
          <Text style={[styles.adBadgeText, { color: theme.colors.textTertiary }]}>広告</Text>
        </View>
        {nativeAd.advertiser ? (
          <NativeAsset assetType={NativeAssetType.ADVERTISER}>
            <Text style={[styles.advertiser, { color: theme.colors.textFaint }]} numberOfLines={1}>
              {nativeAd.advertiser}
            </Text>
          </NativeAsset>
        ) : null}
      </View>

      <View style={styles.bodyRow}>
        {nativeAd.icon ? (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{ uri: nativeAd.icon.url }} style={styles.icon} />
          </NativeAsset>
        ) : (
          <View style={[styles.icon, { backgroundColor: theme.colors.chipTrack }]} />
        )}
        <View style={styles.bodyText}>
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
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 11,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  adBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  advertiser: {
    fontSize: 11,
    flexShrink: 1,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 11,
  },
  bodyText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  headline: {
    fontSize: 15,
    fontWeight: '700',
  },
  subRow: {
    flexDirection: 'row',
    gap: 10,
  },
  subText: {
    fontSize: 12,
  },
  ctaPill: {
    borderRadius: 999,
    paddingHorizontal: 16,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
