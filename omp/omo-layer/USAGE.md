# omo-layer 사용 가이드 (OMP 세팅 + 에이전트 사용법)

> OMO의 페르소나·모델 라우팅·루프 엔진을 oh-my-pi(omp)에서 쓰는 법.
> 이 가이드는 실제로 만든 것(검증된 코드 기반)만 다룹니다.

---

## 0. 이 패키지가 하는 일 (한눈에)

| 추가되는 것 | OMP 표면 | 뭐 하는지 |
|---|---|---|
| **11 에이전트** (sisyphus/atlas/prometheus/hephaestus/momus/oracle/librarian/explore/metis/multimodal-looker/sisyphus-junior) | `task` 툴로 스폰 | 각 전문 역할 수행 |
| **명령 6개** | `/omo-doctor` `/omo-route` `/omo-apply` `/ultrawork` `/ulw-loop` `/ulw-stop` | 모델 배정·변형 스왑·루프 제어 |
| **스킬 3개** | `skill://ulw-plan` `skill://ultrawork` `skill://git-master` | 계획·루프 방법론·git 작업 |
| **룰 3개** | 자동 주입(항상/TTSR/온디맨드) | 오케스트레이터 규율·AI slop 차단·라우팅 가이드 |
| **모델 라우터** | extension (런타임) | 활성 모델 → 각 에이전트에 자동 배정 |

---

## 1. 설치

```bash
cd ~/workspaces/sharosoo/omo-omp/omo-layer
bun install            # 개발 의존성만 (@types/bun, typescript)
omp plugin link .      # 패키지를 omp에 등록
```

`omp plugin link`가 하는 일:
- `package.json`의 `"omp": { "extensions": ["./src/extension.ts"] }`를 읽어 extension 로드 → 명령 6개 + `session_stop`/`todo_reminder` 훅 등록
- `agents/*.md` → `~/.omp` 에이전트 발견 (11 에이전트)
- `skills/*/SKILL.md` → 스킬 발겅 (3 스킬, `/skill:<name>` + `skill://`)
- `rules/*.md` → `omp-plugins` 룰 provider가 자동 발견 (3 룰)

> **중요**: 마켓플레이스(`/marketplace install`)로는 extension이 로드 안 됩니다. 반드시 `omp plugin link` 또는 npm 설치로 등록해야 명령/루프가 작동합니다. (루트 리서치 `06-precedents.md` §3 참고)

**omp 재시작** 후 적용됩니다.

---

## 2. 모델 배정 — 역할(role) 기반 (핵심)

각 에이전트는 **omp의 모델 역할**에 바인딩됩니다. 역할은 `/model`에서 설정하므로 omp의 `/model` 설정을 그대로 추적 — 하드코딩 체인·provider명 불일치 문제 없음.

### 기본 역할 바인딩 (제로 설정)

| 에이전트 | 역할 | 의미 |
---|---|---|
| sisyphus, hephaestus, metis, sisyphus-junior | `default` | 오케스트레이터/딥워커/컨설턴트/실행기 |
| prometheus | `plan` | 플래너 |
| atlas | `task` | 계획 실행 |
| momus, oracle | `advisor` | 리뷰/자문 |
| librarian, explore | `smol` | 빠른 검색 |
| multimodal-looker | `vision` | 비전 |

에이전트 파일의 `model:`이 `pi/<role>`(역할 별칭)로 되어 있어, omp가 별칭을 전개하면 **아무 설정 없이** `/model`의 역할 매핑을 따라갑니다.

### ① 진단 (쓰기 없음)
```
/omo-doctor
```
각 에이전트가 현재 `/model` 역할 기준으로 **어떤 구체적 모델**에 해상되는지 보고. unassigned가 뜨면 해당 역할을 `/model`에서 설정.

```
OMO persona router — effective resolution
--------------------------------------------------
  sisyphus         zai/glm-5.2 (role: default)
  prometheus       openai-codex/gpt-5.5 (role: plan)
  atlas            openai-codex/gpt-5.5 (role: task)
  momus            openai-codex/gpt-5.5 (role: advisor)
  librarian        openai-codex/gpt-5.4-mini (role: smol)
```

### ② 구체화 (선택)
```
/omo-route
```
해상된 구체적 모델을 `agents/*.md`에 기록. 역할 별칭 전개가 안 되는 omp 버전에선 한 번 실행하면 동작. `/model` 역할 바꾸면 재실행하여 갱신. 변형 프롬프트(`variants/`)가 해당 가족에 있으면 본문도 스왑.

---

## 3. 에이전트 사용법 — 두 가지 방식

### A. 메인 모드 전환 (명시적) — `/<agent>` (예: `/hephaestus`)
각 에이전트 이름 자체가 슬래시 명령. **메인 세션 자체를** 해당 페르소나로 전환 — 시스템 프롬프트가 그 에이전트 본문으로 바뀌고, 모델도 해당 역할 모델로 전환.

```
/hephaestus
이 버그 잡아줘      ← 메인이 hephaestus(딥 워커)로 직접 작업

/sisyphus
이 기능 끝까지 만들어  ← 메인이 오케스트레이터로 위임 주도

/momus
이 plan 리뷰해줘      ← 메인이 리뷰어로 동작

/default            ← 기본 모드로 복귀
```

전체 목록: `/sisyphus` `/hephaestus` `/prometheus` `/atlas` `/momus` `/oracle` `/librarian` `/explore` `/metis` `/multimodal-looker` `/sisyphus-junior` + `/default`(복귀).

한 번 전환하면 **이후 모든 턴**이 해당 페르소나로 동작 (`context` 훅이 매 LLM 호출마다 페르소나 프롬프트를 시스템 메시지로 주입 + `setModel`). `/default`로 해제.

### B. 서브에이전트로 스폰 (메인이 위임)
메인이 `task` 툴로 에이전트를 호출. 주로 모드 전환 없이 일회성 위임이 필요할 때:

```
task(tasks=[
  { id: "deep-1", agent: "hephaestus",
    assignment: "목표를 주세요. 레시피가 아니라 목표를." }
])
```
병렬로 여럿도 가능. `omo-orchestration` 룰(항상 주입)이 메인을 오케스트레이터로 행동하게 해 자동 위임하기도 함.


### 11 에이전트 — 역할 / 언제 / 예시

| 에이전트 | 역할 | 언제 부를까 | 예시 |
|---|---|---|---|
| **sisyphus** | 메인 오케스트레이터 | 복잡한 다단계 작업, 병렬 위임 필요 시 | "이 기능 끝까지 만들어" → sisyphus가 hephaestus/momus 등에 위임 |
| **prometheus** | 전략 플래너 (인터뷰→계획) | 코드 전에 결정이 필요할 때, 범위가 애매할 때 | "이거 어떻게 만들지 같이 정해" → `plans/<slug>.md` 작성, 코드 안 씀 |
| **atlas** | 계획 실행 (Boulder) | prometheus가 쓴 계획을 끝까지 실행 | "이 plan 체크리스트 전부 완수해" |
| **hephaestus** | 자율 딥 워커 (**GPT 전용**) | 어려운 기술 문제, 목표만 주고 맡길 때 | "이 버그 잡아" / "이 기능 구현해" |
| **momus** | 냉혹한 리뷰어 (읽기전용) | 계획/변경을 ship 전에 검토 | "이 plan 실행 가능한지 리뷰해" → `[OKAY]`/`[REJECT]` |
| **oracle** | 아키텍처 자문 (읽기전용) | 복잡한 설계, 2회 이상 실패한 디버그 | "이 설계 절충안 중 뭐가 나아?" |
| **librarian** | 외부 문서/코드 검색 (읽기전용) | 낯선 라이브러리, 공식 문서, OSS 예시 | "이 패키지 API 어떻게 쓰는지 찾아, permalink와 함께" |
| **explore** | 코드베이스 grep (읽기전용) | "X가 어디 있지?", 다중 모듈 탐색 | "auth 흐름이 어느 파일에?" |
| **metis** | 사전 계획 컨설턴트 | prometheus 전에 숨은 의도/모호성 발굴 | "이 요청의 진짜 의도가 뭘까, 질문 정리해" |
| **multimodal-looker** | 비전/PDF 해석 (읽기전용) | 이미지·PDF·다이어그램 분석 | "이 스크린샷에서 UI 요소 설명해" |
| **sisyphus-junior** | 집중 실행기 (위임 없음) | 단일 잘 정의된 작업, 다른 실행자 안 부를 때 | "이 파일 하나 고쳐" |

> **위임 그래프** (누가 누구를 스폰): 자세한 건 `AGENT-GRAPH.md`. 핵심: sisyphus/atlas는 누구든 스폰; prometheus/metis/hephaestus/sisyphus-junior는 읽기전용 스카우트(explore/librarian/oracle)만; momus/oracle/librarian/explore/multimodal-looker는 leaf(스폰 불가).


---

## 4. 명령 사용법

| 명령 | 동작 |
|---|---|
| `/omo-doctor` | 에이전트별 유효 모델 배정 + 경고 보고 (쓰기 없음). 진단용. |
| `/omo-route` `/omo-apply` | 해상 모델을 `agents/*.md`에 구체화 + 변형 본문 스왑. `/model` 변경 시 재실행. |
| `/<agent>` (예: `/hephaestus`) | **메인 모드 전환** — 메인을 해당 에이전트 페르소나+모델로. 전체: §3A |
| `/default` | 메인 모드 기본으로 복귀 (활성 페르소나 해제). |
| `/ultrawork` | ultrawork 루프 활성화 — todo+검증 통과까지 세션 종료 시 자동 재개(최대 8회). |
| `/ulw-loop ["완료조건"]` | 내구성 루프. 완료 promise 명시. |
| `/ulw-stop` | 루프 즉시 중단. |

### ultrawork 루프 예시
```
/ultrawork
이 기능 구현하고 테스트까지 통과시켜
```
→ 메인 에이전트가 작업 → 세션이 끝나려 할 때 `session_stop { continue: true }`로 재개(8회 한계) → todo 전부 done + 검증 통과 시 모델이 `write(local://ulw-complete.marker)` 써서 루프 종료.

**루프 종료 조건**: 모델이 매 이터레이션 nudge를 받아 (1) todo 전부 완료 (2) 변경 파일 `lsp` 진단 + 테스트 + 빌드 통과 확인 → 완료 마커 작성. 8회 안에 못 끝내면 사용자에게 인계.

---

## 5. 스킬 사용법

스킬은 에이전트가 `skill://`로 읽거나, 사용자가 `/skill:<name>`으로 직접 호출.

| 스킬 | 누가 쓰나 | 하는 일 |
|---|---|---|
| `skill://ulw-plan` | prometheus (필수) | explore-first 계획 방법론. 인텐트 라우팅(clear/unclear), 승인 게이트, 의사결정-완료 계획 템플릿, scaffold 스크립트 호출. |
| `skill://ultrawork` | 메인 (ultrawork 활성화 시) | 확실성 게이트·시나리오 계약·TDD red→green→surface·수동 QA 명령. 루프 첫 이터레이션에 자동 참조. |
| `skill://git-master` | 모든 에이전트 (git 작업 시) | atomic commit, 안전한 rebase, worktree 정리. |

직접 호출: `/skill:git-master` 또는 에이전트에게 *"git-master 스킬 써서 커밋해"*.

### ulw-plan으로 계획 만들기 (scaffold 스크립트)
prometheus가 계획 세울 때 자동으로:
```bash
bun <package-root>/scripts/scaffold-plan.mjs <slug> --clear
```
→ `plans/<slug>.md`(체크리스트) + `drafts/<slug>.md`(이력, compaction 안전) 생성. 재실행은 no-op(안전). 경로는 `plans/`·`drafts/`로 샌드박스됨.

---

## 6. 룰 (자동 작동, 설정 불필요)

| 룰 | 버킷 | 자동으로 하는 일 |
|---|---|---|
| `omo-orchestration` | **alwaysApply** | 모든 세션의 시스템 프롬프트에 주입. 메인 에이전트가 오케스트레이터 규율(병렬 위임, 중간 멈춤 금지, 검증 후 완료)로 행동. |
| `no-ai-slop` | **TTSR** (edit/write 시) | 편집이 slop 패턴(TODO/FIXME/"as required" 등)을 코드에 넣으면 발화하여 제거 유도. Comment-checker 역할. |
| `persona-routing` | **rulebook** (온디맨드) | `rule://persona-routing`으로 읽음. 작업 종류→페르소나 매핑 + 금지 조합(MiniMax/Qwen as sisyphus 등) 경고. |

룰은 `omp-plugins` provider가 `rules/*.md`를 자동 발견하므로 사용자 설정 없이 작동.

---

## 7. end-to-end 워크플로우 예시

### A. 계획 → 실행 (prometheus → atlas)
1. *"prometheus한테 auth 기능 계획 세우라고 해"*
2. prometheus가 `skill://ulw-plan` 읽고 → 인터뷰/탐색 → `plans/auth.md` + `drafts/auth.md` 작성 → 승인 게이트에서 대기
3. 사용자 승인 → *"atlas한테 이 plan 완수해"*
4. atlas가 체크리스트를 병렬로 위임(hephaestus 등) + 매 단계 검증 → `ORCHESTRATION COMPLETE`

### B. 딥 워크 (hephaestus 직접)
1. *"hephaestus한테 이 성능 버그 잡으라고 해 — 목표만 줘"*
2. hephaestus가 탐색→구현→검증(수동 QA 포함) → 결과

### C. ship 전 리뷰 (momus)
1. *"이 plan momus가 검토해"*
2. momus가 `plans/<slug>.md` 재읽기 → `[OKAY]` 또는 `[REJECT: 최대 3개 blocker]`

### D. ultrawork 루프 (자동 완수)
1. `/ultrawork` 입력
2. *"이 PR 피드백 전부 반영하고 테스트 녹색으로 만들어"*
3. 메인이 위임+검증 루프 → 8회 한계 내 자동 재개 → 완료 마커 → 종료

---

## 8. 커스터마이즈

### 오버라이드 — `~/.omp/agent/omo-personas.json`
기본은 역할 바인딩(위 §2). 특정 에이전트를 역할과 다른 모델로 고정하려면 `pins`로 오버라이드:
```json
{
  "pins": {
    "hephaestus": "openai-codex/gpt-5.5:high",
    "prometheus": "zai/glm-5.2:high",
    "librarian": "opencode-go/minimax-m3",
    "explore": "openai-codex/gpt-5.5:low",
    "sisyphus-junior": "openai-codex/gpt-5.5:high"
  },
  "disable": []
}
```
- `pins`: `"provider/model"` 또는 `"provider/model:thinking"`. 역할보다 **우선**.
- `disable`: 해당 에이전트 배정 스킵.
- 우선순위: **핀 > 역할(`/model`) > 미배정**.
- `omo-personas.example.json`에 위 핀들이 미리 들어있음 — 복사하면 사용자의 `/model` 역할 매핑과 함께 Ask A 세팅이 그대로.

> 역할 자체를 바꾸려면 `/model`에서(default/plan/task/advisor/smol/vision 각각에 모델 지정). 모든 "역할 기반" 에이전트가 자동 추적. 핀은 예외적으로 특정 에이전트만 고정할 때.

핀/역할 바꾼 뒤엔 `/omo-route` 재실행하여 `agents/*.md` 갱신.

### 모델 가족별 변형 프롬프트
`variants/<agent>/<family>.md`에 두면, `/omo-route`가 해당 가족 모델로 배정될 때 본문을 스왑. 가족 감지(`src/extension.ts :: variantFamily`):
- `claude-opus-4-7` / `claude-opus-4-8` / `claude-fable-5` / `claude`
- `gpt-5-5` / `gpt-5-4`
- `kimi-k2-7` / `kimi-k2-6`
- `glm-5-2` / `glm` / `gemini`

현재 포팅된 변형: sisyphus(gpt-5-5, kimi-k2-7), momus(gpt-5-5), oracle(gpt-5-5). 나머지는 `variants/MANIFEST.md` 참고.

### 재귀 깊이 (다단계 위임 시)
sisyphus→atlas→hephaestus→explore 같은 3홉 체인을 위해 config에 명시:
```yaml
# ~/.omp/agent/config.yml
task:
  maxRecursionDepth: 4
```
(기본값은 문서에 명시 없음 — 명시 권장. `AGENT-GRAPH.md` 참고)

---

## 9. 검증 / 트러블슈팅

### 설치 확인
```bash
omp plugin list          # omo-layer 보여야 함
# omp 안에서:
/omo-doctor              # 에이전트 목록 + 배정 나오면 정상
```

### 명령이 안 보이면
- `omp plugin link .` 했는지 (마켓플레이스 install은 extension 로드 안 함)
- omp 재시작 했는지
- `package.json`의 `"omp": { "extensions": ["./src/extension.ts"] }` 경로 맞는지

### 에이전트가 스폰 안 되면
- 부모 에이전트의 `spawns`가 대상을 허용하는지 (`AGENT-GRAPH.md` 그래프 참고)
- `task.maxRecursionDepth` 충분한지 (깊은 체인 시)
- 대상 에이전트가 배정됐는지 (`/omo-doctor`에서 unassigned면 해당 모델 연결 필요)

### 루프가 안 멈추면
- `/ulw-stop` 으로 즉시 중단
- 8회(OMP 상한) 후 자동 종료
- 모델이 `write(local://ulw-complete.marker)`를 안 쓰면 계속됨 — todo/검증 완료 조건을 명확히

### 검증 상태 (정직하게)
| 항목 | 상태 |
|---|---|
| model-core (1:1) + 라우터 + 루프 상태머신 | ✅ 23 테스트 통과 (bun) |
| TypeScript (strict) | ✅ tsc 클린 |
| scaffold 스크립트 | ✅ 실행 검증 (생성 + no-op + 샌드박스) |
| omp 실제 로드 (`/omo-doctor`·`/ultrawork` 동작) | ⬜ `omp plugin link` + 재시작 후 확인 필요 |

---

## 10. 더 보기

- `README.md` — 패키지 개요
- `AGENT-GRAPH.md` — 에이전트 호출 구조(OMP 재현 검증) + 위임 그래프
- `variants/MANIFEST.md` — 모든 변형의 OMO 소스 경로 (추가 포팅용)
- 부모 워크스페이스 `~/workspaces/sharosoo/omo-omp/` — 리서치 문서(01~07)
