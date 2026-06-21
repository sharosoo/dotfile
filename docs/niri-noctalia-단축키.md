# Niri + Noctalia + fcitx5 — 단축키·명령 전체

`~/niri-noctalia-단축키.md`

---

## 키 이름

| 표기 | 키 |
|------|-----|
| **Mod** | **Super** = **윈도우 키** (⊞) |
| **Alt** | 스페이스 양옆 **Alt** |
| **Ctrl** | **Ctrl** |
| **Shift** | **Shift** |

**niri 단축키 목록 팝업:** **Mod+Shift+/**

---

## A. 한글 · 입력 (fcitx5 + niri)

### 지금 쓰는 것 (권장)

| 단축키 | 하는 일 |
|--------|---------|
| **Ctrl+Space** | 한/영 **전환** (메인) |
| **한/영 (Hangul)** | 한/영 전환 |
| **Hangul_Romaja** | 영문 쪽 전환 (설정에 있음) |

niri에서도 **Ctrl+Space** / **Hangul** 이 fcitx5-remote로 연결됨 (`session.kdl`).

### fcitx5 설정에만 있는 것 (`~/.config/fcitx5/config`)

| 단축키 | 하는 일 |
|--------|---------|
| **Shift (왼쪽만, 짧게)** | AltTrigger (보조 트리거) |
| **Hangul_Hanja** | ActivateKeys |
| **Zenkaku_Hankaku** | TriggerKeys (일본 키보드용) |
| **Ctrl+Alt+P** | 한글 조합(Preedit) 표시 토글 |
| 후보 창 안 **Tab / Shift+Tab** | 다음·이전 후보 |
| 후보 창 안 **↑ / ↓** | 페이지 이전·다음 |

### 한영 관련 터미널 명령

| 명령 | 하는 일 |
|------|---------|
| `fcitx5-remote -t` | 한/영 토글 |
| `fcitx5-remote -o` | 입력기 **켜기** |
| `fcitx5-remote -c` | 입력기 **끄기** |
| `fcitx5-remote -r` | **설정 다시 읽기** (config 수정 후) |
| `fcitx5-remote` | 상태 (0/1/2) |
| `fcitx5-config-qt` | GUI 설정 |

> **Mod+Space** = **Noctalia 런처** (한영 아님). 예전 **Super+Space** 한영은 fcitx에서 **제거**해 둠.

---

## B. 앱 · 런처 · 브라우저

| 단축키 | 하는 일 |
|--------|---------|
| **Mod+Space** | Noctalia **앱 런처** (검색·실행) |
| **Mod+D** | 런처 (위와 동일) |
| **Mod+T** | 터미널 **ghostty** |
| **Mod+Alt+F** | **Firefox** |
| **Mod+Alt+G** | **Google Chrome** |

---

## C. 창 닫기 · 크기 · 레이아웃

| 단축키 | 하는 일 |
|--------|---------|
| **Mod+Q** | **창 닫기** |
| **Mod+O** | 워크스페이스 **개요(Overview)** |
| **Mod+F** | 열 **최대화** |
| **Mod+Shift+F** | 창 **전체화면** |
| **Mod+M** | 창을 화면 끝까지 확대 |
| **Mod+V** | 떠 있는 창 ↔ **타일** 전환 |
| **Mod+W** | 열을 **탭** 형태로 |
| **Mod+R** | 열 너비 프리셋 |
| **Mod+Shift+R** | 열 너비 프리셋 (역방향) |
| **Mod+Minus / Mod+Equal** | 열 너비 −10% / +10% |
| **Mod+Shift+Minus / Mod+Shift+Equal** | 창 높이 −10% / +10% |
| **Mod+C** | 열 가운데 정렬 |
| **Mod+Ctrl+C** | 보이는 열들 가운데 정렬 |
| **Mod+Ctrl+F** | 열이 남는 공간까지 넓히기 |
| **Mod+, / Mod+.** | 창 열에 합치기 / 열에서 빼기 |
| **Mod+BracketLeft / Mod+BracketRight** | 창을 옆 열로 합치거나보내기 |

---

## D. 포커스 (같은 모니터 안)

| 단축키 | 하는 일 |
|--------|---------|
| **Mod+← → ↑ ↓** | 포커스 이동 |
| **Mod+H / J / K / L** | ← / ↓ / ↑ / → (같음) |
| **Mod+Home** | 열 **맨 앞** |
| **Mod+End** | 열 **맨 뒤** |
| **Mod+Wheel 좌/우** | 열 포커스 좌/우 |
| **Mod+Shift+Wheel 위/아래** | 열 포커스 좌/우 (가로 스크롤 대체) |

**창/열 이동 (같은 모니터):**

| 단축키 | 하는 일 |
|--------|---------|
| **Mod+Ctrl+방향** | 열·창 **이동** |
| **Mod+Ctrl+H J K L** | 위와 동일 |
| **Mod+Ctrl+Home / End** | 열을 맨 앞/뒤로 **보냄** |
| **Mod+Ctrl+Wheel** | 열 좌/우로 **이동** |

---

## E. 모니터 왔다갔다 (듀얼 모니터) ★

배치: **왼쪽** = HDMI 보조(세로) · **오른쪽** = Dell DP 메인.  
포커스만 옮기면 **그 모니터의 마지막 창**으로 감.

### 포커스만 다른 모니터로 (왔다갔다)

| 단축키 | 하는 일 |
|--------|---------|
| **Mod+Shift+←** | **왼쪽 모니터**로 포커스 |
| **Mod+Shift+→** | **오른쪽 모니터**로 포커스 |
| **Mod+Shift+↑** | **위** 모니터 (세로 배치일 때) |
| **Mod+Shift+↓** | **아래** 모니터 |
| **Mod+Shift+H** | 왼쪽 모니터 (= ←) |
| **Mod+Shift+L** | 오른쪽 모니터 (= →) |
| **Mod+Shift+K** | 위 모니터 |
| **Mod+Shift+J** | 아래 모니터 |

지금은 보조가 **왼쪽**, Dell이 **오른쪽**이면:  
**Mod+Shift+→** / **Mod+Shift+L** → Dell · **Mod+Shift+←** / **Mod+Shift+H** → 15″ 보조

### 창(열) 통째로 다른 모니터로 보내기

| 단축키 | 하는 일 |
|--------|---------|
| **Mod+Shift+Ctrl+←** | 열을 **왼쪽 모니터**로 |
| **Mod+Shift+Ctrl+→** | 열을 **오른쪽 모니터**로 |
| **Mod+Shift+Ctrl+↑ / ↓** | 위/아래 모니터로 |
| **Mod+Shift+Ctrl+H J K L** | 위와 동일 (H=왼쪽, L=오른쪽, K=위, J=아래) |

> 설정에 주석 처리된 것: **창 하나만** 옮기기 `move-window-to-monitor-*`, **워크스페이스 통째** `move-workspace-to-monitor-*` — 필요하면 `config.kdl`에서 주석 해제.

### 모니터 확인·설정 (터미널)

| 명령 | 하는 일 |
|------|---------|
| `niri msg outputs` | 모니터 이름, **Transform(세로)**, Scale, 위치 |
| `niri msg action load-config-file` | `session.kdl` 모니터·단축키 **다시 적용** |

설정 파일: `~/.config/niri/session.kdl`  
- **HDMI-A-1**: `transform "90"`, `scale 2.25`, 왼쪽  
- **DP-1**: Dell, `position x=960` (오른쪽)

---

## F. 워크스페이스 (가상 데스크톱)

| 단축키 | 하는 일 |
|--------|---------|
| **Mod+1 ~ 9** | 워크스페이스 1~9 |
| **Mod+Page Up / Page Down** | 위/아래 워크스페이스 |
| **Mod+U / Mod+I** | 아래 / 위 워크스페이스 |
| **Mod+Ctrl+1 ~ 9** | 열을 N번 워크스페이스로 **이동** |
| **Mod+Ctrl+Page Up/Down** | 열을 위/아래 워크스페이스로 |
| **Mod+Ctrl+U / I** | 위와 동일 |
| **Mod+Wheel 위/아래** (cooldown) | 워크스페이스 위/아래 |
| **Mod+Ctrl+Wheel 위/아래** | 열을 워크스페이스 위/아래로 |

---

## G. 세션 · 잠금 · 로그아웃 (Noctalia / niri)

| 단축키 | 하는 일 |
|--------|---------|
| **Mod+Shift+Space** | Noctalia **세션 메뉴** |
| **Mod+Shift+L** | **화면 잠금** |
| **Mod+Shift+E** | niri **세션 종료** (확인) |
| **Ctrl+Alt+Delete** | 세션 종료 |
| **Mod+Shift+P** | **모니터 전원 끄기** (입력 시 켜짐) |
| **Super+Alt+L** | swaylock (예비, Noctalia 잠금 권장) |

세션 메뉴 연 뒤: **1** 잠금 · **5** 로그아웃 · **4** 재부팅 · **6** 종료

| 명령 | 하는 일 |
|------|---------|
| `loginctl terminate-user global` | **로그아웃** → SDDM |
| `bash ~/tmp/emergency-logout.sh` | 위와 동일 시도 |

---

## H. 스크린샷 · 소리 · 밝기

| 단축키 | 하는 일 |
|--------|---------|
| **Print** | 영역 스크린샷 |
| **Ctrl+Print** | 전체 화면 |
| **Alt+Print** | 활성 창 |
| 저장 | `~/Pictures/Screenshots/` |
| **볼륨 ± / 음소거 / 마이크 음소거** | 미디어 키 |
| **재생·일시정지 / 이전·다음** | 미디어 키 |
| **밝기 ±** | 노트북 밝기 키 |

---

## I. Noctalia (터미널 IPC)

```bash
~/.local/bin/qs -c noctalia-shell ipc call launcher toggle      # 런처
~/.local/bin/qs -c noctalia-shell ipc call sessionMenu toggle   # 세션 메뉴
~/.local/bin/qs -c noctalia-shell ipc call lockScreen lock    # 잠금
~/.local/bin/qs -c noctalia-shell ipc call settings toggle      # 설정
~/.local/bin/qs -c noctalia-shell ipc call bar toggle          # 바
```

서비스: `systemctl --user status noctalia-qs`

---

## J. 한 번에 외울 것

| 용도 | 키 |
|------|-----|
| 앱 검색 | **Mod+Space** |
| 한/영 | **Ctrl+Space** · **한/영** |
| 터미널 | **Mod+T** |
| 창 닫기 | **Mod+Q** |
| Firefox / Chrome | **Mod+Alt+F** / **G** |
| **모니터 이동 (포커스)** | **Mod+Shift+←→** (또는 **H L**) |
| **창을 다른 모니터로** | **Mod+Shift+Ctrl+←→** |
| 로그아웃 메뉴 | **Mod+Shift+Space** → **5** |
| 설정 다시 읽기 | `niri msg action load-config-file` |

---

*2026-06-21 · `config.kdl` + `session.kdl` + `fcitx5/config` 기준*