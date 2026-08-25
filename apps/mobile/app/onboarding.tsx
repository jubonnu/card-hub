import { useCallback, useRef, useState } from 'react';
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';

import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { CalendarIcon, IconProps, ListCheckIcon, SearchIcon, TrendingUpIcon } from '@/components/icons';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useTheme } from '@/theme/useTheme';

// フレーム部分（アプリ画面のモックアップ）は画像アセットをそのまま使う（内容はコードで再現しない）。
// 見出し・アイコンのみコードで描画し、端末解像度によらず常にくっきり表示されるようにする。
const SLIDES: {
  image: number;
  Icon: (props: IconProps) => React.JSX.Element;
  headline: [string, string];
  subtext: [string, string];
}[] = [
  {
    image: require('../assets/onboarding/1.png'),
    Icon: SearchIcon,
    headline: ['カード抽選を', 'まとめてチェック'],
    subtext: ['全国のカード抽選を検索して、', '受付中の抽選を見つけよう'],
  },
  {
    image: require('../assets/onboarding/2.png'),
    Icon: ListCheckIcon,
    headline: ['応募した抽選を', 'しっかり管理'],
    subtext: ['応募状況や結果をまとめて確認。', 'チェックリストで管理もかんたん'],
  },
  {
    image: require('../assets/onboarding/3.png'),
    Icon: CalendarIcon,
    headline: ['締切・当選発表日を', 'カレンダーで管理'],
    subtext: ['大事な日をカレンダーでお知らせ。', 'もう見逃す心配はありません'],
  },
  {
    image: require('../assets/onboarding/4.png'),
    Icon: TrendingUpIcon,
    headline: ['応募履歴から', '当選率をチェック'],
    subtext: ['これまでの実績をグラフで可視化。', 'あなたの抽選傾向がわかります'],
  },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const isLastPage = page === SLIDES.length - 1;

  function finish() {
    useOnboardingStore.getState().markCompleted();
    router.replace('/(tabs)');
  }

  // ボタン押下時はスクロールイベントの反映を待たず、押した瞬間にpageを確定させる
  // （プラットフォームによってはonMomentumScrollEndがプログラム的なscrollToで発火しない
  // ことがあり、それに頼るとボタン連打で次のページ番号がずれるため）。
  function handleNext() {
    if (isLastPage) {
      finish();
      return;
    }
    const nextPage = page + 1;
    setPage(nextPage);
    scrollRef.current?.scrollTo({ x: windowWidth * nextPage, animated: true });
  }

  // 手でスワイプした場合はこちらでpageを実際のスクロール位置に追従させる。
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (windowWidth === 0) return;
      const nextPage = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
      setPage((prev) => (prev === nextPage ? prev : nextPage));
    },
    [windowWidth]
  );

  return (
    <View style={styles.root}>
      {/* 背景画像はステータスバー・ホームインジケーター領域も含めて画面全体に敷く
       （ScreenContainer内側ではなく、その外側に重ねることで安全領域の外まで塗り広げる）。 */}
      <Image
        source={require('../assets/onboarding/background.jpg')}
        resizeMode="cover"
        style={StyleSheet.absoluteFillObject}
      />
      <ScreenContainer edges={['top', 'bottom']} style={{ backgroundColor: 'transparent' }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={styles.flex}
        >
          {SLIDES.map((slide, index) => (
            <View key={index} style={[styles.slide, { width: windowWidth }]}>
              <View style={[styles.iconCircle, { backgroundColor: theme.colors.surface }]}>
                <slide.Icon size={30} color={theme.colors.green} strokeWidth={2.1} />
              </View>
              <Text style={[styles.headlineLine, { color: theme.colors.textPrimary }]}>{slide.headline[0]}</Text>
              <Text style={[styles.headlineLine, { color: theme.colors.green }]}>{slide.headline[1]}</Text>
              <Text style={[styles.subtextLine, { color: theme.colors.textSecondary }]}>{slide.subtext[0]}</Text>
              <Text style={[styles.subtextLine, { color: theme.colors.textSecondary }]}>{slide.subtext[1]}</Text>

              {/* モックアップ画像はトリミングせず、縦横比を保ったまま残りスペースに収める
               （端末によって上下左右に余白が出ることは許容する）。 */}
              <View style={styles.imageWrap}>
                <Image source={slide.image} resizeMode="contain" style={styles.image} accessibilityIgnoresInvertColors />
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dotsRow}>
            {SLIDES.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index === page ? theme.colors.green : theme.colors.thumbInner,
                    width: index === page ? 20 : 8,
                  },
                ]}
              />
            ))}
          </View>

          <PrimaryButton label={isLastPage ? 'はじめる' : '次へ'} onPress={handleNext} style={styles.nextButton} />
        </View>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headlineLine: {
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 31,
  },
  subtextLine: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 2,
  },
  imageWrap: {
    flex: 1,
    width: '100%',
    marginTop: 18,
  },
  image: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.1 }],
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 16,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 999,
  },
  nextButton: {
    width: 160,
  },
});
