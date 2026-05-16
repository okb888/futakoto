import { useEffect, useState } from 'react';
import {
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type OnboardingModalProps = {
  visible: boolean;
  onDone: () => void;
};

type OnboardingSlide = {
  emoji: string;
  title: string;
  body: string;
  hint: string | null;
};

const COLORS = {
  background: '#FAFAF8',
  primary: '#7B9E87',
  textPrimary: '#2D2D2D',
  textBody: '#444',
  textWeak: '#888',
  placeholder: '#BBB',
  white: '#fff',
} as const;

const SLIDES: OnboardingSlide[] = [
  {
    emoji: '🌿',
    title: 'ふたこと、へようこそ',
    body: '言いたいけど、うまく言えない。\nそんな気持ちをふたりのあいだに届けるアプリです。\n夜寝る前の30秒で、ふたりに。',
    hint: null,
  },
  {
    emoji: '🔗',
    title: 'パートナーと繋がろう',
    body: '設定画面の招待コードをパートナーに送ると、ふたりの気持ちが共有されます。',
    hint: '設定 → 招待コードをコピーして\nLINEやメッセージで送ろう',
  },
  {
    emoji: '✨',
    title: 'AIが気持ちを支えます',
    body: '上手く伝えられない時は、AIが言葉を整えます。\n壁打ちで気持ちを整理したり、相手の気持ちを読み解いたりも。',
    hint: 'AI機能は月5回まで無料',
  },
];

export default function OnboardingModal({ visible, onDone }: OnboardingModalProps) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  function handleNext() {
    if (isLast) {
      onDone();
      return;
    }
    setIndex((current) => current + 1);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onDone}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.skipRow}>
          <TouchableOpacity activeOpacity={0.6} onPress={onDone} style={styles.skipButton}>
            <Text style={styles.skipText}>スキップ</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.emoji}>{slide.emoji}</Text>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
          {slide.hint ? <Text style={styles.hint}>{slide.hint}</Text> : null}
        </View>

        <View style={styles.dots}>
          {SLIDES.map((item, slideIndex) => (
            <View
              key={item.title}
              style={[
                styles.dot,
                {
                  backgroundColor: slideIndex === index ? COLORS.primary : COLORS.placeholder,
                },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity activeOpacity={0.6} onPress={handleNext} style={styles.nextButton}>
          <Text style={styles.nextButtonText}>{isLast ? 'はじめる' : '次へ →'}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  skipRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  skipButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  skipText: {
    color: COLORS.textWeak,
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emoji: {
    fontSize: 72,
    textAlign: 'center',
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 24,
    textAlign: 'center',
  },
  body: {
    color: COLORS.textBody,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 16,
    textAlign: 'center',
  },
  hint: {
    color: COLORS.primary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 20,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    marginBottom: 32,
    marginHorizontal: 32,
    paddingVertical: 16,
  },
  nextButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
