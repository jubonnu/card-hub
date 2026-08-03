import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function toHHMM(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function hourOf(hhmm: string): number {
  return Number(hhmm.split(':')[0]);
}

interface QuietHoursTimePickerModalProps {
  visible: boolean;
  initialStart: string;
  initialEnd: string;
  onClose: () => void;
  onConfirm: (start: string, end: string) => void;
}

/**
 * おやすみモードの時間帯（開始・終了）を選ぶモーダル。
 * ネイティブの時刻ピッカー（`@react-native-community/datetimepicker`）を使うと
 * 新規ネイティブビルドが必要になるため、1時間刻みのチップ選択のみの自作UIにしている
 * （分単位の指定はできない）。
 */
export function QuietHoursTimePickerModal({
  visible,
  initialStart,
  initialEnd,
  onClose,
  onConfirm,
}: QuietHoursTimePickerModalProps) {
  const theme = useTheme();
  const [activeField, setActiveField] = useState<'start' | 'end'>('start');
  const [draftStart, setDraftStart] = useState(initialStart);
  const [draftEnd, setDraftEnd] = useState(initialEnd);

  function open() {
    setActiveField('start');
    setDraftStart(initialStart);
    setDraftEnd(initialEnd);
  }

  function handleSelectHour(hour: number) {
    if (activeField === 'start') setDraftStart(toHHMM(hour));
    else setDraftEnd(toHHMM(hour));
  }

  function handleConfirm() {
    onConfirm(draftStart, draftEnd);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={open}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>おやすみ時間帯</Text>

          <View style={[styles.segmentRow, { backgroundColor: theme.colors.chipTrack }]}>
            <Pressable
              style={[styles.segmentButton, activeField === 'start' && { backgroundColor: theme.colors.green }]}
              onPress={() => setActiveField('start')}
            >
              <Text style={[styles.segmentLabel, { color: activeField === 'start' ? '#fff' : theme.colors.textSecondary }]}>
                開始 {draftStart}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentButton, activeField === 'end' && { backgroundColor: theme.colors.green }]}
              onPress={() => setActiveField('end')}
            >
              <Text style={[styles.segmentLabel, { color: activeField === 'end' ? '#fff' : theme.colors.textSecondary }]}>
                終了 {draftEnd}
              </Text>
            </Pressable>
          </View>

          <View style={styles.hourGrid}>
            {HOURS.map((hour) => {
              const selected = hourOf(activeField === 'start' ? draftStart : draftEnd) === hour;
              return (
                <Pressable
                  key={hour}
                  style={[
                    styles.hourChip,
                    { borderColor: theme.colors.border },
                    selected && { backgroundColor: theme.colors.green, borderColor: theme.colors.green },
                  ]}
                  onPress={() => handleSelectHour(hour)}
                >
                  <Text style={[styles.hourChipText, { color: selected ? '#fff' : theme.colors.textPrimary }]}>
                    {String(hour).padStart(2, '0')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actionsRow}>
            <Pressable style={styles.actionButton} onPress={onClose}>
              <Text style={[styles.actionLabel, { color: theme.colors.textSecondary }]}>キャンセル</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={handleConfirm}>
              <Text style={[styles.actionLabel, { color: theme.colors.green, fontWeight: '700' }]}>決定</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    borderRadius: 11,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  hourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  hourChip: {
    width: 52,
    height: 40,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
    paddingTop: 4,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  actionLabel: {
    fontSize: 14,
  },
});
