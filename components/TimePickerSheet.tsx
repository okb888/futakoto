import { useRef, useEffect } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../lib/theme';

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const ITEM_HEIGHT = 50;

function scrollToValue(ref: React.RefObject<ScrollView | null>, value: number) {
  ref.current?.scrollTo({ y: Math.max(0, value * ITEM_HEIGHT - 100), animated: true });
}

type QuickAction = {
  label: string;
  onPress: () => void;
};

type TimePickerSheetProps = {
  visible: boolean;
  title: string;
  previewLabel: string;
  hour: number;
  minute: number;
  saving?: boolean;
  onChangeHour: (hour: number) => void;
  onChangeMinute: (minute: number) => void;
  onCancel: () => void;
  onSave: () => void;
  quickAction?: QuickAction;
};

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function TimePickerSheet({
  visible,
  title,
  previewLabel,
  hour,
  minute,
  saving = false,
  onChangeHour,
  onChangeMinute,
  onCancel,
  onSave,
  quickAction,
}: TimePickerSheetProps) {
  const hourRef = useRef<ScrollView>(null);
  const minuteRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        scrollToValue(hourRef, hour);
        scrollToValue(minuteRef, minute);
      }, 100);
    }
  }, [visible]);

  useEffect(() => { scrollToValue(hourRef, hour); }, [hour]);
  useEffect(() => { scrollToValue(minuteRef, minute); }, [minute]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onCancel}
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} hitSlop={10}>
              <Text style={styles.cancel}>キャンセル</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onSave} disabled={saving} hitSlop={10}>
              <Text style={[styles.save, saving && styles.saveDisabled]}>保存</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewLabel}>{previewLabel}</Text>
              {quickAction ? (
                <TouchableOpacity style={styles.quickButton} onPress={quickAction.onPress}>
                  <Text style={styles.quickText}>{quickAction.label}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.preview}>{formatTime(hour, minute)}</Text>
          </View>

          <View style={styles.panel}>
            <View style={styles.columns}>
              <View style={styles.column}>
                <Text style={styles.columnLabel}>時</Text>
                <ScrollView
                  ref={hourRef}
                  style={styles.list}
                  showsVerticalScrollIndicator={false}
                >
                  {HOURS.map((item) => {
                    const selected = item === hour;
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.item, selected && styles.itemSelected]}
                        onPress={() => onChangeHour(item)}
                      >
                        <Text style={[styles.itemText, selected && styles.itemTextSelected]}>
                          {String(item).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.colon}>
                <Text style={styles.colonText}>:</Text>
              </View>

              <View style={styles.column}>
                <Text style={styles.columnLabel}>分</Text>
                <ScrollView
                  ref={minuteRef}
                  style={styles.list}
                  showsVerticalScrollIndicator={false}
                >
                  {MINUTES.map((item) => {
                    const selected = item === minute;
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.item, selected && styles.itemSelected]}
                        onPress={() => onChangeMinute(item)}
                      >
                        <Text style={[styles.itemText, selected && styles.itemTextSelected]}>
                          {String(item).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(45,45,45,0.24)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancel: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  title: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  save: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  saveDisabled: { color: COLORS.primaryDim },
  previewCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 18,
    marginBottom: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  previewLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  quickButton: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  quickText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  preview: {
    color: COLORS.primaryDeep,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0,
  },
  panel: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: 12,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  column: {
    flex: 1,
  },
  columnLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  list: {
    height: 224,
  },
  item: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  itemSelected: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.primaryDim,
  },
  itemText: {
    color: COLORS.textSubtle,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0,
  },
  itemTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  colon: {
    paddingTop: 22,
  },
  colonText: {
    color: COLORS.textWeak,
    fontSize: 28,
    fontWeight: '700',
  },
});
