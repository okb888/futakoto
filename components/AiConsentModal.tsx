import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from 'react-native';
import { Sparkle } from 'phosphor-react-native';
import { COLORS } from '../lib/theme';

type Props = {
  visible: boolean;
  onAgree: () => void;
  onCancel?: () => void;
};

export function AiConsentModal({ visible, onAgree, onCancel }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Sparkle size={28} color={COLORS.ai} weight="fill" />
          </View>

          <Text style={styles.title}>AI機能をはじめる前に</Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.body}>
              ふたことのAI機能（壁打ち・伝え方リライト・気持ちを読み解く・月次サマリー）は、
              入力されたテキストを <Text style={styles.bold}>Google Gemini API</Text> に送信して処理します。
            </Text>

            <View style={styles.bullets}>
              <Bullet>送信される内容：入力した文章、パートナー名（任意）、気分の数値</Bullet>
              <Bullet>送信されない内容：メールアドレス、認証情報、招待コード、相手の連絡先</Bullet>
              <Bullet>処理後、送信データはGoogle側で短期間しか保持されません</Bullet>
              <Bullet>Apple Sign-in などのログイン情報はAIに送信されません</Bullet>
            </View>

            <Text style={styles.body}>
              詳細は
              <Text style={styles.link} onPress={() => Linking.openURL('https://futakoto.app/privacy.html')}>
                プライバシーポリシー
              </Text>
              をご確認ください。
            </Text>
          </ScrollView>

          <TouchableOpacity style={styles.primary} onPress={onAgree}>
            <Text style={styles.primaryText}>同意してAI機能を使う</Text>
          </TouchableOpacity>

          {onCancel ? (
            <TouchableOpacity onPress={onCancel} style={styles.secondary}>
              <Text style={styles.secondaryText}>あとで</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>・</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 24,
    maxHeight: '85%',
  },
  iconWrap: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.aiBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  scroll: {
    maxHeight: 320,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textBody,
    marginBottom: 12,
  },
  bold: {
    fontWeight: '600',
    color: COLORS.text,
  },
  bullets: {
    marginBottom: 12,
    gap: 4,
  },
  bulletRow: {
    flexDirection: 'row',
  },
  bulletDot: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginRight: 4,
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSubtle,
  },
  link: {
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  primary: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: {
    color: COLORS.surface,
    fontSize: 15,
    fontWeight: '600',
  },
  secondary: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
});
