daily_pr publish 스크립트 sed 치환은 본문 H1·날짜도 바꾼다 — file-read 기반 in-process publish + readback은 artifact ID 직접 패치.
§
Gateway restart: gateway/child shell에서 금지(SIGTERM tree). 외부에서 `systemctl --user restart hermes-gateway`.
§
'최신 학회'=현재 연도 학회 cycle.
§
agent OSS watch cron 8df8ae502923(07:30 일일, fetcher=agent_oss_watch_fetch.sh, ws=~/workspaces/oss_contrib). 타깃: pydantic-ai 첫 PR(#8601 #8606 #7171), litellm(CLA 필수), MCP sdk(중기). 함정: FTC 검색은 association decay로 0 — author_association 분포로 검증.
§
`ghc github.com/weareteamturing/<repo>`는 `~/workspaces/weareteamturing/<repo>`로 clone하며, 이후 pull로 최신화한다.
§
LLM serving 학회·arXiv 읽기·분석과 경력 블로그·OSS PR을 공개 이직 근거로 축적한다.
§
범용 경력 근거는 `career-meterials/career-evidence`에 두며 `google-fde`는 최종 FDE 지원 문서 전용이다.
§
EKS→AWS 단일화('24). 온프렘 GPU 전환 계획('26, 비용절감).
§
GPAI LLM runtime: LiteLLM은 빠른 출시 당시 혼재된 호출·provider 인증을 공통화했다. provider별 reasoning/thinking/semantics 차이가 correctness가 되면서 제거했고 Model×Provider×Transport로 재설계했다.
§
GPAI BigQuery cost dashboard 매일 운영: model retirement, LLM 비용, credit 점검.
§
GPAI LLM runtime은 caching 핵심: stable prefix, provider policy, sticky routing, usage/billing. Renderer $0.30→$0.15.
§
AI 연구자와 I/O contract 합의; 정혁은 benchmark·이상치 보고와 post-training serving 전담. KT는 실력·취약 분석, KT 기반 별도 LevelPath는 AI 문제 추천이며 둘 다 출시.
§
수학대왕 U+ 유독: 요구 API를 frontend·구독 lifecycle에 연동, 실제 출시·운영 중. 신규 판매채널과 U+ 요금제 이용권 제공.
§
GPAI: AI Chat은 Solver·Visualizer 공통 engine. Solver=대학생 일상, Visualizer=연구자 전문 시각화.
§
AI-assisted 개발: 정혁이 방향 설명, AI가 plan·구현, 정혁이 review·steering 반복.
§
Hygiene/editorial ≠ evidence deepen; evidence map: artifact-hub-publishing/references/gpai-blog-evidence-map.md.
§
GPAI 2.0: Python 메인+롱러닝만 별도 런타임 분리. 공개 문서에 런타임 명칭·언어 노출 금지. DB=Aurora Serverless v2, 배포=Cloud Run. auth.gpai.app(JWKS)+OpenFGA, Loro, Centrifugo.
§
로컬 GPU: RTX PRO 6000 96GB(sm_120)+TR 7980X, CUDA 13.0(glibc 2.43/GCC15 빌드 충돌). vLLM 실험 로컬 전용(PR/push 금지), 문서는 ~/workspaces/vllm-test. XQA는 FP4 KV SM120 지원 — vLLM plumbing 갭(kv_cache_sf 미전달).
§
문서 제목·본문은 자연스러운 한국어로. 'BFF' 금지→'로그인 Server Route'.
§
Artifact Hub md 아티팩트는 ```mermaid 펜스 네이티브 렌더(풀페이지 HTML 금지). raw 링크는 viewer HTML 래핑, urllib 403 — curl+UA로 조회.
§
turing의 Heeler(iPhone→Herdr)는 Tailscale IP 경유 OpenSSH Device Key 사용. Tailscale SSH는 check-mode 재인증이 Heeler timeout을 일으켜 `tailscale set --ssh=false`로 꺼둠. `sshd`/Herdr 서버는 실행 중. iPhone에서 다른 VPN을 켜면 iOS 단일 VPN 제한으로 Tailscale이 끊겨 Heeler 접속 불가.