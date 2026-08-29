import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

const MAX_LABEL_LENGTH = 200; // サーバー側の CHECKLIST_LABEL_MAX_LENGTH と合わせる

interface ChecklistStepNameModalProps {
  visible: boolean;
  title: string;
  initialValue: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}

/**
 * チェック項目の名前を入力するモーダル。「追加」（初期値は空）と「名前を編集」
 * （初期値は既存のlabel）の両方で共用する。
 */
export function ChecklistStepNameModal({
  visible,
  title,
  initialValue,
  confirmLabel,
  onClose,
  onConfirm,
}: ChecklistStepNameModalProps) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const trimmed = value.trim();
  const canConfirm = trimmed.length > 0;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(trimmed);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="チェック項目の名前"
            placeholderTextColor={theme.colors.textFaint}
            maxLength={MAX_LABEL_LENGTH}
            autoFocus
            style={[
              styles.input,
              { color: theme.colors.textPrimary, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSubtle },
            ]}
          />
          <View style={styles.actionsRow}>
            <Pressable style={styles.actionButton} onPress={onClose}>
              <Text style={[styles.actionLabel, { color: theme.colors.textSecondary }]}>キャンセル</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={handleConfirm} disabled={!canConfirm}>
              <Text
                style={[
                  styles.actionLabel,
                  { color: canConfirm ? theme.colors.green : theme.colors.textFaint, fontWeight: '700' },
                ]}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  input: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  actionLabel: {
    fontSize: 14,
  },
});
