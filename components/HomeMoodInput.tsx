import { useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { addEntry, updateLastVisibility, UserProfile } from '../lib/db';
import { MOODS } from '../lib/mood';
import { COLORS } from '../lib/theme';

type Props = {
  uid: string;
  profile: UserProfile;
  partnerProfile: UserProfile | null;
  onSubmit: () => void;
};

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export function HomeMoodInput({ uid, profile, onSubmit }: Props) {
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);

  function animateNext() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }

  function handleSelectMood(score: number) {
    animateNext();
    setSelectedMood(score);
  }

  async function handleSubmit() {
    if (selectedMood === null || loading) return;

    setLoading(true);
    try {
      const visibility = profile.lastVisibility ?? 'shared';
      await addEntry(uid, selectedMood, memo.trim(), visibility);
      await updateLastVisibility(uid, visibility);
      animateNext();
      setSelectedMood(null);
      setMemo('');
      onSubmit();
    } catch (e: any) {
      console.error('[HomeMoodInput] 送信エラー:', e?.code, e?.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.emojiRow}>
        {MOODS.map((mood) => (
          <TouchableOpacity
            key={mood.score}
            style={styles.emojiButton}
            onPress={() => handleSelectMood(mood.score)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`${mood.label}を選ぶ`}
          >
            <Text
              style={[
                styles.emoji,
                selectedMood !== null && selectedMood !== mood.score && styles.emojiDimmed,
              ]}
            >
              {mood.emoji}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedMood === null ? (
        <Text style={styles.hint}>今日の気持ちを伝える</Text>
      ) : (
        <View style={styles.expanded}>
          <TextInput
            style={styles.textInput}
            placeholder="ひとことメモ（任意）"
            placeholderTextColor={COLORS.placeholder}
            value={memo}
            onChangeText={setMemo}
            multiline
            maxLength={200}
          />
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color={COLORS.surface} size="small" />
            ) : (
              <Text style={styles.submitText}>伝える</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 14,
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  emojiButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 44,
    alignItems: 'center',
  },
  emoji: { fontSize: 28 },
  emojiDimmed: { opacity: 0.35 },
  hint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textWeak,
  },
  expanded: { marginTop: 12, gap: 10 },
  textInput: {
    minHeight: 60,
    maxHeight: 92,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    textAlignVertical: 'top',
    backgroundColor: COLORS.surface,
  },
  submitButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { backgroundColor: COLORS.primaryDim },
  submitText: {
    color: COLORS.surface,
    fontSize: 15,
    fontWeight: '700',
  },
});
