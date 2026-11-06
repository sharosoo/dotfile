// The way in: make a Spotify app (Client ID only, no secret), paste its Client ID, approve in
// the browser. `v` is the panel: v.wiz ({ step, waiting, error, copied }), v.idIn / v.idEmpty
// (the Client ID field), v.connect(cx), v.cancelConnect(cx), v.closeSetup(cx), v.acct.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";
import { REDIRECT_URI, DASHBOARD_URL, isClientId } from "./api.js";

const ICON = (name) => `mods/spotify/${name}.svg`;

export const newWizard = (acct, error = null) => ({ step: acct.clientId ? 2 : 1, waiting: false, error, copied: false });

export const button = (t, id, label, onClick, { primary = false, icon = null, disabled = false } = {}) =>
  h_flex().id(id).h(28).px(10).gap(6).flex_none().items_center().justify_center().rounded(4).text_size(12).font_medium()
    .when(primary, (el) => el.bg(disabled ? t.raised : t.solid).text_color(disabled ? t.dim : t.solid_foreground))
    .when(!primary, (el) => el.bg(t.raised).border(1).border_color(t.input).text_color(disabled ? t.dim : t.foreground))
    .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.85)).on_click(onClick))
    .when(Boolean(icon), (el) => el.child(svg(ICON(icon)).size(13).flex_none()))
    .child(label);

const para = (t, text) => div().text_size(12.5).text_color(t.muted).child(text);

const steps = (t, lines) => v_flex().gap(8).children(lines.map((line, i) => h_flex().gap(8).items_start()
  .child(div().size(18).flex_none().rounded_full().bg(t.raised).border(1).border_color(t.input).flex().items_center().justify_center()
    .text_size(10.5).font_semibold().text_color(t.foreground).child(String(i + 1)))
  .child(v_flex().flex_1().min_w(0).gap(6).children(Array.isArray(line) ? line : [div().text_size(12.5).text_color(t.muted).child(line)]))));

function errorLine(t, text) {
  return h_flex().gap(6).items_start().text_size(12).text_color(t.blocked)
    .child(svg(ICON("triangle-alert")).size(13).flex_none().mt(1)).child(div().flex_1().min_w(0).child(text));
}

export function renderSetup(v, t, cx) {
  const W = v.wiz;
  const canClose = v.acct.signedIn;
  const head = v_flex().gap(8)
    .child(h_flex().items_center().gap(8)
      .child(svg(ICON("key")).size(14).flex_none().text_color(t.dim))
      .child(div().flex_1().font_semibold().text_color(t.foreground).child("Spotify 연결"))
      .child(div().text_size(11).text_color(t.dim).child(`${W.step} / 2단계`))
      .when(canClose, (el) => el.child(div().id("sp-su-close").size(22).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer()
        .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("설정 닫기")
        .on_click((_e, cx) => v.closeSetup(cx)).child(svg(ICON("x")).size(13)))))
    .child(h_flex().gap(4).children([1, 2].map((n) => div().flex_1().h(3).rounded(2).bg(n <= W.step ? t.accent : t.raised))));
  const footer = (...buttons) => h_flex().gap(8).pt(4).justify_end().children(buttons);
  let body;

  if (W.step === 1) {
    const uriBox = h_flex().gap(6).items_center()
      .child(div().flex_1().min_w(0).h(28).px(8).flex().items_center().rounded(4).border(1).border_color(t.input).bg(t.background)
        .text_size(12).text_color(t.foreground).truncate().child(REDIRECT_URI))
      .child(button(t, "sp-su-copy", W.copied ? "복사됨" : "복사", (_e, cx) => {
        cx.write_to_clipboard(REDIRECT_URI);
        W.copied = true;
        cx.timer.after(1500, (cx) => { W.copied = false; cx.notify(); });
        cx.notify();
      }, { icon: W.copied ? "check" : "copy" }));
    body = v_flex().gap(12)
      .child(div().font_medium().text_color(t.foreground).child("Spotify 앱 만들기"))
      .child(para(t, "직접 만든 Spotify 앱을 사용해요. Secret은 필요 없고 Client ID만 있으면 돼요."))
      .child(steps(t, [
        [div().text_size(12.5).text_color(t.muted).child("개발자 대시보드를 열고 로그인하세요."),
          h_flex().child(button(t, "sp-su-dash", "대시보드 열기", (_e, cx) => cx.open_url(DASHBOARD_URL), { icon: "external-link" }))],
        "'Create app'을 누르세요 (이름은 아무거나 괜찮아요).",
        [div().text_size(12.5).text_color(t.muted).child("이 Redirect URI를 그대로 추가하세요."), uriBox],
        "Web API를 선택하고 약관에 동의한 뒤 저장하세요.",
        "Client ID를 복사하세요.",
      ]))
      .child(div().text_size(11.5).text_color(t.dim).child("앱 소유자 계정에 Premium이 있어야 해요. 없으면 이 패널이 Spotify 데스크톱 앱을 대신 제어해요."))
      .child(footer(button(t, "sp-su-next", "Client ID가 있어요", (_e, cx) => { W.step = 2; W.error = null; cx.notify(); }, { primary: true })));
  } else {
    const value = v.idIn.value().trim();
    const valid = isClientId(value);
    body = v_flex().gap(12)
      .child(div().font_medium().text_color(t.foreground).child("Client ID 붙여넣고 로그인하기"))
      .child(h_flex().gap(6).items_center()
        .child(div().relative().flex_1().min_w(0)
          .child(Input.new(v.idIn).h(30).px(9).rounded(4).border(1).border_color(t.input).bg(t.canvas ?? t.background).text_size(12).text_color(t.foreground))
          .when(v.idEmpty, (el) => el.child(div().absolute().left(10).top(0).h(30).flex().items_center().text_size(12).text_color(t.dim).child("영문·숫자 32자"))))
        .child(div().id("sp-su-paste").size(30).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer()
          .bg(t.raised).border(1).border_color(t.input).text_color(t.dim).hover((s) => s.text_color(t.foreground))
          .tooltip("클립보드에서 붙여넣기").on_click((_e, cx) => {
            const text = cx.read_from_clipboard();
            if (text) { v.idIn.set_value(text.replace(/\s+/g, "")); v.idEmpty = false; W.error = null; }
            cx.notify();
          }).child(svg(ICON("clipboard")).size(14))))
      .when(Boolean(value) && !valid, (el) => el.child(div().text_size(12).text_color(t.working).child("올바른 Client ID 형식이 아니에요 (영문·숫자 32자).")))
      .when(W.waiting, (el) => el.child(v_flex().gap(8).p(10).rounded(6).bg(t.raised)
        .child(h_flex().gap(8).items_center().text_size(12.5).text_color(t.foreground)
          .child(svg(ICON("refresh-cw")).size(13).flex_none().text_color(t.dim).spin(1200))
          .child("Spotify 응답을 기다리고 있어요. 브라우저에서 권한을 승인해 주세요."))
        .child(div().text_size(11.5).text_color(t.dim).child("창이 열리지 않았나요? '페이지 다시 열기'를 누르세요."))))
      .when(Boolean(W.error), (el) => el.child(errorLine(t, W.error)))
      .child(footer(...[
        button(t, "sp-su-back", "이전", (_e, cx) => { v.cancelConnect(cx); W.step = 1; cx.notify(); }),
        W.waiting ? button(t, "sp-su-reopen", "페이지 다시 열기", (_e, cx) => v.connect(cx), { icon: "external-link" }) : null,
        W.waiting ? button(t, "sp-su-cancel", "취소", (_e, cx) => v.cancelConnect(cx))
          : button(t, "sp-su-connect", "Spotify로 연결", (_e, cx) => v.connect(cx), { primary: true, disabled: !valid }),
      ].filter(Boolean)));
  }
  return v_flex().id("sp-setup").flex_1().min_h(0).overflow_y_scroll().p(14).gap(14).child(head).child(body);
}
