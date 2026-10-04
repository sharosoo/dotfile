Discord 단독 서버/채널에서는 @멘션 없이 DM처럼 응답을 원함.
§
**학습 패턴**: 기초 12살 비유·직관 → 사용자 답 → 답을 인정·정리·정확히 보정 → 다음 질문 하나의 소크라테스식 진행을 선호. LLM serving은 buzzword/논문부터 던지지 말고 Prefill→Decode→KV cache→scheduler 등 바닥부터; 옆 주제는 core 흐름에 덜 중요하면 빨리 벗어날 것.
§
정혁. 한국어 반말, English technical terms 혼용. 짧고 기술적으로 깊은 답 선호.
§
LLM serving career 전환 목표. K8s·ML 배포·serving 최적화·OSS 기여 경험을 hire-ready profile로 정리.
§
GPAI commits: no Co-authored-by footer; use feat/fix/test/docs(python-worker/backend/web): … format.
§
GPAI model-catalog 변경은 repo-local 지침을 따르고 frontend selector·visual default를 함께 갱신하며, 명시적 retire 전 기존 enum 호환을 유지.
§
영어 기술 블로그는 채용·PR용 문제해결 증거다. 문제-first·one failure mode·자연스러운 문체·검증된 근거. 외부 독자가 이해하는 설명·명확한 기승전결 우선, 내부 식별정보·대화 메타·작성 과정 흔적 제거. 수치 없어도 before 코드/after diff/고정 테스트가 근거 가능. 아키텍처는 workload-fit으로, 검색은 DB→heavy user 측정 tail latency 넘을 때만 search-engine escalation.
§
뇌과학 영감 LLM 구조에 관심: MoE보다 sparse recurrent module interaction, direct latent links, global workspace/feedback, CoT·thinking signature·latent state의 관계를 탐구함.
§
번역투·갈래/줄기/줄거리 거절. 「축」→axis. korean-review는 어색 표현 목록 먼저. 조사 H1은 글 목적. `연 것은 Y가 아니다` 거절. 사주: 전통+현대 생활 언어. 'AI가 쓴 한국어' 거부: 전부다/딱/단정, em-dash 남용, 재언급 금지, 간결한 평서문.
§
정혁은 2022-06 입사. edge-tunnel 개인. EKS·온프렘 GPU serving 전 과정과 GPAI Solver/초기 Visualizer·native LLM/agent·billing 담당.