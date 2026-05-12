export type ClassifiedError = {
  /** 'network' | 'quota' | 'crisis' | 'auth' | 'unknown' */
  kind: 'network' | 'quota' | 'crisis' | 'auth' | 'unknown';
  title: string;
  message: string;
  /** quota の場合のリセット時刻ミリ秒 */
  resetAt?: number;
};

export function classifyError(e: any): ClassifiedError {
  const code: string = e?.code ?? '';
  const details = e?.details;
  const rawMessage: string = e?.message ?? '';

  if (details?.type === 'crisis') {
    return {
      kind: 'crisis',
      title: '話を聞いてもらえる場所があります',
      message:
        'いまとても辛い状況かもしれません。\n\nよりそいホットライン\n0120-279-338（24時間・無料）\n\nかかりつけの人や信頼できる人に話すことも一つの方法です。',
    };
  }

  if (details?.type === 'quota-exceeded' || code === 'functions/resource-exhausted') {
    return {
      kind: 'quota',
      title: '無料分を使い切りました',
      message:
        rawMessage ||
        '今月の無料AI枠を使い切りました。プレミアムプランに登録すると無制限に使えます。',
      resetAt: typeof details?.resetAt === 'number' ? details.resetAt : undefined,
    };
  }

  // ネットワーク系
  if (
    code === 'auth/network-request-failed' ||
    code === 'functions/unavailable' ||
    code === 'unavailable' ||
    /Network request failed|network error|fetch.*failed/i.test(rawMessage)
  ) {
    return {
      kind: 'network',
      title: 'ネットワークに接続できません',
      message: 'インターネット接続を確認して、もう一度お試しください。',
    };
  }

  if (code.startsWith('auth/')) {
    return {
      kind: 'auth',
      title: 'ログインエラー',
      message: firebaseErrorMessage(e),
    };
  }

  return {
    kind: 'unknown',
    title: 'エラー',
    message: firebaseErrorMessage(e),
  };
}

export function firebaseErrorMessage(e: any): string {
  const code: string = e?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'このメールアドレスはすでに使われています';
    case 'auth/invalid-email':
      return 'メールアドレスの形式が正しくありません';
    case 'auth/weak-password':
      return 'パスワードは6文字以上で設定してください';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'メールアドレスまたはパスワードが違います';
    case 'auth/user-not-found':
      return 'アカウントが見つかりません';
    case 'auth/network-request-failed':
      return '通信に失敗しました。ネットワークを確認してください';
    case 'auth/too-many-requests':
      return 'しばらくしてからもう一度お試しください';
    case 'auth/requires-recent-login':
      return '再度ログインしてからお試しください';
    default:
      return e?.message ?? '予期しないエラーが発生しました';
  }
}
