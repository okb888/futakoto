import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useAuth } from '../../../lib/auth';
import {
  updateCommunicationStyle,
  updateAiPersona,
  type AiPersona,
} from '../../../lib/db';
import { useSettingsProfile } from '../../../hooks/useSettingsProfile';
import { COLORS } from '../../../lib/theme';

const PERSONAS: { key: AiPersona; label: string; desc: string }[] = [
  { key: 'soft', label: 'ソフト', desc: 'そっと聞く・問いかけは必要なときだけ' },
  { key: 'friendly', label: 'フレンドリー', desc: 'タメ口で、気の置けない友人のように' },
  { key: 'logical', label: 'ロジカル', desc: '感情と事実を分けて、状況を構造化する' },
];

export default function AiScreen() {
  const { user } = useAuth();
  const { profile, setProfile } = useSettingsProfile();

  const [styleInput, setStyleInput] = useState(profile?.communicationStyle ?? '');
  const [styleSaved, setStyleSaved] = useState(false);

  async function handleSelectPersona(persona: AiPersona) {
    if (!user) return;
    setProfile(current => current ? { ...current, aiPersona: persona } : current);
    await updateAiPersona(user.uid, persona);
  }

  async function handleSaveStyle() {
    if (!user) return;
    await updateCommunicationStyle(user.uid, styleInput.trim());
    setStyleSaved(true);
    setTimeout(() => setStyleSaved(false), 2000);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* 話し方スタイル */}
      <Text style={styles.sectionLabel}>壁打ちAIの話し方</Text>
      <Text style={styles.hint}>壁打ち中のAIがどんなスタイルで話すかを選べます</Text>
      <View style={styles.personaList}>
        {PERSONAS.map(({ key, label, desc }) => {
          const selected = (profile?.aiPersona ?? 'soft') === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.personaOption, selected && styles.personaSelected]}
              onPress={() => handleSelectPersona(key)}
              activeOpacity={0.7}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
              <View style={styles.personaText}>
                <Text style={[styles.personaLabel, selected && styles.personaLabelSelected]}>{label}</Text>
                <Text style={styles.personaDesc}>{desc}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 伝え方 */}
      <Text style={styles.sectionLabel}>パートナーへの伝え方</Text>
      <Text style={styles.hint}>AIが文案を作るときの文体や雰囲気を指定できます（例: タメ口でやわらかく）</Text>
      <View style={styles.section}>
        <View style={styles.styleRow}>
          <TextInput
            style={styles.styleInput}
            value={styleInput}
            onChangeText={setStyleInput}
            placeholder="タメ口でやわらかく、など（任意）"
            placeholderTextColor="#999"
            maxLength={50}
          />
          <TouchableOpacity style={styles.styleSaveButton} onPress={handleSaveStyle}>
            <Text style={styles.styleSaveText}>{styleSaved ? '✓' : '保存'}</Text>
          </TouchableOpacity>
        </View>
        {styleInput.length > 0 ? (
          <Text style={styles.charCount}>{styleInput.length}/50</Text>
        ) : null}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingVertical: 20, paddingBottom: 60 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 20,
    textTransform: 'uppercase',
  },
  hint: { fontSize: 12, color: COLORS.placeholder, marginBottom: 10, paddingHorizontal: 20 },
  section: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  personaList: { marginHorizontal: 16, gap: 8 },
  personaOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  personaSelected: { borderColor: COLORS.ai, backgroundColor: COLORS.aiBg },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.disabled,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioSelected: { borderColor: COLORS.ai },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.ai },
  personaText: { flex: 1 },
  personaLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  personaLabelSelected: { color: COLORS.ai },
  personaDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 17 },
  styleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  styleInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.text,
  },
  styleSaveButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },
  styleSaveText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  charCount: { fontSize: 11, color: COLORS.placeholder, textAlign: 'right', paddingRight: 14, paddingBottom: 10 },
});
