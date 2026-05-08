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
