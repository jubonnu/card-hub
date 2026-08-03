import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackIcon, CheckCircleIcon, PencilIcon, PlusIcon } from '@/components/icons';
import { ChecklistStepNameModal } from '@/components/ChecklistStepNameModal';
import { ProductThumb } from '@/components/ProductThumb';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useChecklistStore } from '@/stores/checklistStore';
import { useMyLotteriesStore } from '@/stores/myLotteriesStore';
import { useTheme } from '@/theme/useTheme';
import { getDisplayProductName, getDisplayShopName } from '@/utils/publicLotteryDisplay';
import { formatDateTimeShort } from '@/utils/time';

type NameModalState = { mode: 'add' } | { mode: 'rename'; stepId: string; currentLabel: string } | null;

export default function ChecklistScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { lotteryId } = useLocalSearchParams<{ lotteryId: string }>();
  const saved = useMyLotteriesStore((s) => s.getSaved(Number(lotteryId)));
  const { groups, toggleStep, addStep, renameStep, ensureInitialized } = useChecklistStore();
  const steps = groups[lotteryId as string] ?? [];
  const [nameModal, setNameModal] = useState<NameModalState>(null);

  useEffect(() => {
    if (lotteryId) ensureInitialized(lotteryId);
  }, [lotteryId, ensureInitialized]);

  const doneCount = steps.filter((s) => s.done).length;
  const progress = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;
  const deadline = saved ? (saved.record.applicationEndAt ?? saved.record.applicationEndDate) : null;

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} style={styles.iconButton} onPress={() => router.back()}>
          <BackIcon color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>チェックリスト</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {saved ? (
          <View style={[styles.summaryRow, { borderBottomColor: theme.colors.borderLighter }]}>
            <ProductThumb size="md" />
            <View style={styles.summaryText}>
              <Text style={[styles.productName, { color: theme.colors.textPrimary }]}>
                {getDisplayProductName(saved.record)}
              </Text>
              <Text style={[styles.shopName, { color: theme.colors.textTertiary }]}>
                {getDisplayShopName(saved.record)}
              </Text>
              <Text style={[styles.deadline, { color: theme.colors.status.planned.fg }]}>
                応募締切　{deadline ? formatDateTimeShort(deadline) : '未公開'}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.progressSection}>
          <View style={styles.progressHeaderRow}>
            <Text style={[styles.progressLabel, { color: theme.colors.textPrimary }]}>
              進捗 {doneCount} / {steps.length} 完了
            </Text>
            <Text style={[styles.progressPercent, { color: theme.colors.green }]}>{progress}%</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.colors.thumbBg }]}>
            <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: theme.colors.green }]} />
          </View>
        </View>

        <View style={styles.stepsList}>
          {steps.map((step, index) => (
            <Pressable
              key={step.id}
              onPress={() => toggleStep(lotteryId as string, step.id)}
              style={[
                styles.stepRow,
                index < steps.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.borderLighter,
                },
              ]}
            >
              {step.done ? (
                <View style={[styles.stepCheckDone, { backgroundColor: theme.colors.green }]}>
                  <CheckCircleIcon />
                </View>
              ) : (
                <View style={[styles.stepCheckEmpty, { borderColor: theme.colors.thumbInner }]} />
              )}
              <View style={styles.stepText}>
                <Text
                  style={[
                    styles.stepLabel,
                    { color: step.done ? theme.colors.textFaint : theme.colors.textPrimary },
                  ]}
                >
                  {step.label}
                </Text>
                {step.done && step.completedAt ? (
                  <Text style={[styles.stepSub, { color: theme.colors.textFaint }]}>
                    {formatDateTimeShort(step.completedAt)} 完了{step.completedNote ? ` ・ ${step.completedNote}` : ''}
                  </Text>
                ) : step.description ? (
                  <Text style={[styles.stepSub, { color: theme.colors.textTertiary }]}>{step.description}</Text>
                ) : null}
              </View>
              <Pressable
                hitSlop={8}
                style={styles.stepEditButton}
                onPress={() => setNameModal({ mode: 'rename', stepId: step.id, currentLabel: step.label })}
              >
                <PencilIcon size={16} color={theme.colors.textFaint} />
              </Pressable>
            </Pressable>
          ))}
        </View>

        <View style={styles.addStepWrap}>
          <Pressable
            style={[styles.addStepButton, { borderColor: theme.colors.green }]}
            onPress={() => setNameModal({ mode: 'add' })}
          >
            <PlusIcon />
            <Text style={[styles.addStepLabel, { color: theme.colors.green }]}>チェック項目を追加</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ChecklistStepNameModal
        visible={nameModal !== null}
        title={nameModal?.mode === 'rename' ? 'チェック項目の名前を編集' : 'チェック項目を追加'}
        confirmLabel={nameModal?.mode === 'rename' ? '保存' : '追加'}
        initialValue={nameModal?.mode === 'rename' ? nameModal.currentLabel : ''}
        onClose={() => setNameModal(null)}
        onConfirm={(value) => {
          if (!lotteryId) return;
          if (nameModal?.mode === 'rename') {
            renameStep(lotteryId, nameModal.stepId, value);
          } else {
            addStep(lotteryId, value);
          }
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  summaryText: {
    flex: 1,
    gap: 3,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
  },
  shopName: {
    fontSize: 12,
  },
  deadline: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '900',
  },
  progressPercent: {
    fontSize: 20,
    fontWeight: '900',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 999,
  },
  stepsList: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    minHeight: 56,
  },
  stepCheckDone: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepCheckEmpty: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    flexShrink: 0,
  },
  stepText: {
    flex: 1,
    gap: 2,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  stepSub: {
    fontSize: 11,
  },
  stepEditButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addStepWrap: {
    padding: 20,
  },
  addStepButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  addStepLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
});
