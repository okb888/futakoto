import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { ArrowRight, Sparkle } from 'phosphor-react-native';
import { COLORS } from '../lib/theme';

type Props = {
  onPress: () => void;
};

export function SourceConsultationLink({ onPress }: Props) {
  return (
    <TouchableOpacity style={styles.link} onPress={onPress} activeOpacity={0.7}>
      <Sparkle size={13} color={COLORS.ai} weight="fill" />
      <Text style={styles.text}>この壁打ちを見る</Text>
      <ArrowRight size={13} color={COLORS.ai} weight="bold" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  link: {
    backgroundColor: COLORS.aiBgSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.aiBorderSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: { flex: 1, fontSize: 12, color: COLORS.ai, fontWeight: '700' },
});
