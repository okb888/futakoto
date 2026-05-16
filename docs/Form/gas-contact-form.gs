/**
 * ふたこと お問い合わせフォーム生成スクリプト
 *
 * 使い方:
 *   1. Google Apps Script (script.google.com) で新規プロジェクトを作成
 *   2. このコードを貼り付けて保存
 *   3. createContactForm() を実行 → フォームURLがログに出力される
 *   4. 出力されたURLを support.html に貼る
 *
 * 回答は futakoto.app@gmail.com に通知メールが届く
 *
 * --- 作成済みフォーム情報（2026-05-14）---
 * 公開URL: https://docs.google.com/forms/d/e/1FAIpQLSef1v2A7Gr1dhEm1vXxHvPcjiZQvQcx2MDUEWFYwnmdpqNh-A/viewform
 * 編集URL: https://docs.google.com/forms/d/1TPqYhR0_x73H0XA7Lg5LzXDfcqR18PRKIOSO2T5jA5I/edit
 */

const NOTIFY_EMAIL = "futakoto.app@gmail.com";
const FORM_TITLE = "ふたこと お問い合わせ";

function createContactForm() {
  const form = FormApp.create(FORM_TITLE);
  form.setDescription("ふたことに関するお問い合わせはこちらからお送りください。\n通常2〜3営業日以内にご返信します。");
  form.setConfirmationMessage("お問い合わせありがとうございます。\n内容を確認のうえ、2〜3営業日以内にご返信します。");
  // ---- 1. お問い合わせカテゴリ（必須・ラジオ） ----
  const category = form.addMultipleChoiceItem();
  category.setTitle("お問い合わせの種類");
  category.setRequired(true);
  category.setChoiceValues([
    "不具合・エラー報告",
    "使い方の質問",
    "アカウント・ログインについて",
    "アカウント削除・データ削除の依頼",
    "プライバシー・個人情報について",
    "課金・サブスクリプションについて",
    "その他",
  ]);

  // ---- 2. 返信先メールアドレス（必須） ----
  const email = form.addTextItem();
  email.setTitle("返信先メールアドレス");
  email.setHelpText("ふたことに登録したメールアドレスでなくても構いません。");
  email.setRequired(true);
  const emailValidation = FormApp.createTextValidation()
    .requireTextIsEmail()
    .build();
  email.setValidation(emailValidation);

  // ---- 3. 件名（必須） ----
  const subject = form.addTextItem();
  subject.setTitle("件名");
  subject.setRequired(true);

  // ---- 4. お問い合わせ内容（必須） ----
  const body = form.addParagraphTextItem();
  body.setTitle("お問い合わせ内容");
  body.setHelpText("できるだけ詳しくお書きください。");
  body.setRequired(true);

  // ---- 5. 端末・OS情報（任意） ----
  const device = form.addTextItem();
  device.setTitle("端末名・iOSバージョン（任意）");
  device.setHelpText("例: iPhone 15 / iOS 17.4　不具合報告の場合は記載があると助かります。");
  device.setRequired(false);

  // ---- 回答通知トリガーを設定 ----
  setupNotificationTrigger(form);

  const formUrl = form.getPublishedUrl();
  const editUrl = form.getEditUrl();
  Logger.log("=== フォーム作成完了 ===");
  Logger.log("公開URL（support.html に貼る）: " + formUrl);
  Logger.log("編集URL: " + editUrl);

  return formUrl;
}

/**
 * フォーム回答があったときに NOTIFY_EMAIL へ通知するトリガーを登録する
 * ※ createContactForm() の中から呼ぶので単体実行は不要
 */
function setupNotificationTrigger(form) {
  // 既存トリガーの重複登録を防ぐ
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "onFormSubmit") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("onFormSubmit")
    .forForm(form)
    .onFormSubmit()
    .create();

  // フォームIDをプロパティに保存（onFormSubmit で参照するため）
  PropertiesService.getScriptProperties().setProperty("FORM_ID", form.getId());
}

/**
 * フォーム送信時に呼ばれるハンドラ
 * NOTIFY_EMAIL に問い合わせ内容を転送する
 */
function onFormSubmit(e) {
  const responses = e.response.getItemResponses();
  const timestamp = Utilities.formatDate(
    e.response.getTimestamp(),
    "Asia/Tokyo",
    "yyyy/MM/dd HH:mm"
  );

  let body = "【ふたこと お問い合わせ】\n";
  body += "受信日時: " + timestamp + "\n";
  body += "─────────────────────\n\n";

  responses.forEach(r => {
    body += "■ " + r.getItem().getTitle() + "\n";
    body += r.getResponse() + "\n\n";
  });

  body += "─────────────────────\n";
  body += "Google Forms 管理画面: https://docs.google.com/forms/d/"
    + PropertiesService.getScriptProperties().getProperty("FORM_ID")
    + "/edit#responses\n";

  // 件名に問い合わせ種類を入れる
  const categoryResponse = responses.find(r => r.getItem().getTitle() === "お問い合わせの種類");
  const categoryText = categoryResponse ? "[" + categoryResponse.getResponse() + "]" : "";
  const subjectResponse = responses.find(r => r.getItem().getTitle() === "件名");
  const subjectText = subjectResponse ? subjectResponse.getResponse() : "（件名なし）";

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: "【ふたこと問合せ】" + categoryText + " " + subjectText,
    body: body,
  });
}
