---
name: engineering-blog-writing
description: "Use when writing architecture or backend engineering blogs."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [technical-writing, engineering-blog, architecture, backend, reliability, scalability]
    related_skills: [evidence-backed-technical-writing, grounded-citations, requesting-code-review]
---

# Engineering Blog Writing: 운영 문제에서 설계·코드·검증까지

## Overview

이 스킬은 Canva의 **Session revocations at scale**처럼 실제 운영 문제를 하나의 기술적 이야기로 좁혀 쓰는 데 사용한다. 독자는 “무엇을 만들었는가”보다 다음을 알고 싶어 한다.

- 어떤 규모와 SLO에서 문제가 발생했는가?
- 기존 설계는 왜 그때까지 잘 작동했고, 무엇이 한계가 되었는가?
- 가능한 선택지 중 왜 이 설계를 골랐는가?
- 데이터 구조, 동시성, 실패 경계, 배포 방식은 어떻게 생겼는가?
- 이론상 우아함과 실제 운영 결과가 어떻게 달랐는가?

좋은 글은 제품 홍보나 기술 목록이 아니다. **문제의 압력 → 선택의 이유 → 구현의 경계 → 검증 가능한 결과 → 다음에 남은 판단**을 독자가 따라가게 하는 설계 리뷰에 가깝다.

## When to Use

- 대규모 백엔드, 분산 시스템, 데이터 파이프라인, 캐시, 저장소, 메시징, 인증, 관측성 글
- 마이그레이션, 리팩터링, 성능 개선, 장애 예방, 안정성 작업
- 코드 품질을 “클린 코드” 같은 추상어가 아니라 모듈 경계·계약·자료구조·테스트로 보여줄 때
- 실제 수치, 운영 제약, 실패 사례, 트레이드오프를 공개할 수 있을 때

사용하지 않을 때:

- 제품 업데이트나 API 사용법만 설명하는 글
- 내부 근거 없이 일반 원칙을 나열하는 글
- 실제 결과 없이 “이렇게 하면 확장 가능하다”고 추정하는 글

## 핵심 모델: 작은 운영 문제를 끝까지 판다

주제를 “우리의 대규모 세션 시스템”처럼 넓게 잡지 말고, 다음처럼 **한 문장으로 실패 모드를 고정**한다.

> 배포 때 모든 gateway가 MySQL에서 전체 revoke 목록을 동시에 읽어, 요청 경로는 빠르지만 배포가 데이터베이스에 stampede를 일으켰다.

주제 문장에는 가능하면 다음 네 가지를 넣는다.

1. **주요 경로**: request, deploy, migration, event ingestion 중 무엇인가
2. **부하 또는 규모**: RPS, 사용자 수, 데이터 크기, pod 수, p99, 비용
3. **구체적 병목**: startup read storm, lock contention, tail latency, memory overhead 등
4. **깨지면 안 되는 것**: 보안, 정합성, 가용성, 배포 속도, 데이터 손실 방지

이 문장이 완성되면 글의 범위도 함께 고정된다. 주변 시스템 설명은 이 문제를 이해하는 데 필요한 만큼만 남긴다.

## Canva 스타일에서 추출한 서사 구조

### 1. 제목과 부제목은 기술보다 긴장을 먼저 보여준다

좋은 제목은 시스템 이름보다 문제와 규모를 결합한다.

- `Session revocations at scale`
- `How Canva keeps hundreds of millions of user sessions fast and secure`
- `How we improved push processing on GitHub`
- `Scaling to count billions`

한국어로는 다음 패턴을 우선한다.

- `수억 세션을 빠르고 안전하게 폐기하는 방법`
- `배포 때 발생하던 세션 캐시 stampede를 없앤 과정`
- `수십억 사용량 이벤트를 몇 분 안에 집계하기까지`

제목에 내부 프로젝트명이나 기술 이름만 넣지 않는다. 부제목에서 독자가 얻을 결과와 규모를 약속한다.

### 2. 도입부: 시스템의 압력을 즉시 보여준다

첫 3~5문단 안에 답한다.

- 이 시스템은 사용자에게 어떤 역할을 하는가?
- 얼마나 자주 호출되는가?
- 왜 느리거나 실패하면 안 되는가?
- 어떤 규모에서 기존 방식이 한계에 도달했는가?

Canva 글은 보안 요구와 사용자 요청 빈도에서 시작해 gateway의 in-memory lookup으로 내려간다. 처음부터 S3, binary encoding, conditional PUT를 던지지 않는다.

권장 도입 템플릿:

> 우리 서비스는 [사용자/비즈니스 동작]을 처리할 때마다 [판단/조회]해야 한다. 현재 [규모]에서는 이 경로가 [SLO/보안/비용]에 직접 영향을 준다. 기존에는 [기존 설계]를 사용했고, 평소 요청에는 적합했다. 문제는 [특정 이벤트]가 발생할 때 [구체적 실패 모드]가 나타난다는 것이었다.

### 3. 기존 설계: 처음에는 왜 좋은 선택이었나

기존 설계를 바보 같은 선택으로 묘사하지 않는다. 정상 요청 경로, source of truth, cache·DB·worker·gateway의 책임, refresh/deploy 수명 주기, 기존 장점을 보여준다. 그 다음 “평소의 읽기 비용은 싸지만, seed 비용이 비싸다”처럼 **부하의 모양이 바뀌는 지점**을 드러낸다.

### 4. 요구사항: 해결책보다 먼저 불변조건을 쓴다

| 축 | 질문 |
|---|---|
| latency | hot path의 p50/p99 예산은 얼마인가? |
| availability | 어떤 의존성이 죽어도 무엇은 계속되어야 하는가? |
| correctness | 중복·누락·lost update를 허용하는가? |
| freshness | 데이터가 얼마나 늦어도 되는가? |
| rollout | zero downtime, rollback, mixed-version을 어떻게 보장하는가? |
| operations | 운영자가 무엇을 관측·재처리·복구할 수 있어야 하는가? |
| cost | 저장·네트워크·replica·compute 비용의 상한은 무엇인가? |

“빠르고 확장 가능해야 한다” 대신 수치와 허용 범위를 쓴다. 공개할 수 없는 값은 범위, 상대값, 순서라도 명시하고 추정치와 실측치를 구분한다.

### 5. 선택지와 탈락 이유

선택한 기술을 칭찬하는 대신 후보를 비교한다. 성능만이 아니라 비용·운영 부담·절대 지연·마이그레이션 위험을 함께 비교한다.

| 후보 | 얻는 것 | 잃는 것 | 탈락/선택 이유 |
|---|---|---|---|
| 기존 DB read replica 확대 | 빠른 단기 완화 | stampede 자체는 남음, 비용 증가 | 근본 원인 해결 아님 |
| 별도 streaming store | freshness/throughput | 운영 복잡도와 migration 비용 | 요구보다 큼 |
| object storage snapshot | 저렴한 대량 읽기, durable | moving window 갱신 설계 필요 | 최종 선택 |

각 후보의 “왜 안 했는가”를 적으면 글은 제품 발표가 아니라 판단 기록이 된다. 선택 기준이 바뀌면 결론도 바뀐다는 경계를 남긴다.

### 6. 핵심 설계: 데이터 흐름과 lifecycle

아키텍처를 박스 나열이 아니라 lifecycle로 쓴다.

1. 원천 데이터가 어디에 기록되는가
2. 누가 어떤 조건으로 읽는가
3. 어떤 형식으로 변환하는가
4. 어디에 저장하고 어떤 키로 찾는가
5. gateway/consumer가 언제 refresh하는가
6. 오래된 데이터는 어떻게 폐기하는가
7. 실패·재시도·중복·동시 갱신은 어떻게 처리하는가

Canva 사례에서 재사용할 수 있는 구체화 순서:

- sliding window를 30분 chunk로 나눈다.
- 각 revoke record를 principal과 cutoff timestamp를 담은 고정 길이 binary record로 표현한다.
- 정렬된 flat array를 만들고 binary search로 읽는다.
- 비동기 worker가 DB의 미업로드 항목을 batch로 처리한다.
- conditional PUT로 read-modify-write의 lost update를 막는다.
- gateway는 conditional GET으로 바뀐 chunk만 받는다.
- 12시간 window 밖의 chunk는 버린다.

이 수준의 설명은 기술 이름보다 재현 가능하다. 독자가 같은 문제를 다른 언어·클라우드에서 풀 수 있게 한다.

## 백엔드 코드 품질을 보여주는 방법

“코드 품질이 좋아졌다”고 쓰지 말고, 다음 경계 중 무엇이 좋아졌는지 보여준다.

### 계약과 책임

- hot path는 조회만 하고 변환·압축·DB 접근은 worker로 밀어냈는가?
- worker의 source DB 계약과 object store 갱신 계약이 분리되어 있는가?
- consumer가 저장소의 내부 표현 대신 안정적인 read contract만 의존하는가?
- retry 가능한 작업과 한 번만 수행되어야 하는 작업이 구분되는가?

### 자료구조와 비용

- object per record가 아니라 chunked array/map 등 접근 패턴에 맞는 구조인가?
- 메모리·네트워크·CPU 비용을 대략적인 식으로 설명했는가?
- `O(N)` 또는 `O(N^2)`가 실제 workload에서 무엇을 의미하는지 설명했는가?
- 객체 오버헤드, serialization, allocation, cache locality 같은 constant factor를 고려했는가?

Canva 글의 핵심 교훈처럼 점근적 복잡도만으로 결론 내리지 않는다. 실제 batch size, 네트워크 지연, dense array 처리량, 요구 throughput을 측정해 판단한다.

### 동시성과 정합성

각 실패를 한 문장으로 답할 수 있어야 한다.

- 두 worker가 같은 chunk를 읽고 동시에 쓸 때 누가 이기는가?
- 같은 revoke가 두 번 전달되면 결과가 달라지는가?
- worker가 업로드 후 ACK 전에 죽으면 재실행 가능한가?
- gateway가 오래된 chunk와 새 chunk를 섞어 읽어도 보안 요구를 위반하지 않는가?
- mixed-version deploy 중 구버전 consumer가 신버전 데이터를 읽을 수 있는가?

코드 예시는 전체 저장소가 아니라 **불변조건이 드러나는 작은 조각**으로 고른다. 예: interface/contract, atomic compare-and-set, retry boundary, state transition, query/index, architectural test.

### 테스트와 운영 가능성

코드 품질의 증거로 다음을 제시한다.

- unit: domain rule, binary encoding/decoding, ordering, idempotency
- property/invariant: 정렬 유지, duplicate 제거, monotonic append
- integration: 실제 object store/DB의 conditional write와 pagination
- load: 실제 batch 크기와 payload 분포
- rollout: shadow, canary, mixed-version, rollback
- operational: worker 재시작, 중복 처리, 부분 업로드, stale cache, downstream timeout

테스트 목록만 나열하지 말고 “이 테스트가 어떤 위험을 닫았는가”를 쓴다.

## 검증과 결과: 비교 가능한 기준

결과 섹션은 “성공했다”로 끝내지 않는다. 최소한 before/after 표를 만든다.

| 지표 | 이전 | 이후 | 측정 조건 |
|---|---:|---:|---|
| deploy cache seed time | ... | ... | 같은 pod 수, 같은 window |
| DB read replicas | ... | ... | redundancy 포함 |
| cache memory | ... | ... | payload와 heap overhead 포함 |
| p99 request latency | ... | ... | peak traffic |
| write throughput | ... | ... | batch size 명시 |
| monthly cost | ... | ... | 동일 사용량 기준 |

Canva 글처럼 설계 선택과 결과를 직접 연결한다. 예를 들어 binary representation이 메모리 footprint를 87.5% 줄였다는 식이다. 숫자에는 측정 조건을 붙인다.

- `measured`: production metric, load test, benchmark에서 직접 측정
- `estimated`: 비용 계산, capacity projection, 상한 추정
- `expected`: 설계상 기대한 효과
- `anecdotal`: 특정 incident 또는 관찰 사례

이 네 가지를 문장에서 구분한다.

## 한국어 기술 블로그 문체

한국 독자를 위한 글은 영어 기술 문서의 문장을 한국어 단어로 바꾼 것처럼 쓰지 않는다. 토스·LINE Engineering·Hyperconnect처럼, 글쓴이가 독자에게 실제로 설명하는 흐름을 만든다.

- 첫 문단에서 글쓴이와 시스템의 역할을 짧게 소개한다.
- 개념을 바로 정의하기보다 독자가 왜 필요한지 먼저 보여준다.
- 기존 방식이 왜 합리적이었는지 인정한 뒤 한계가 드러난 상황을 설명한다.
- `그런데`, `그래서`, `반면`, `이때`, `구체적으로 살펴보면` 같은 자연스러운 연결어를 사용한다.
- 한 문단에 한 가지 생각만 두고, 긴 추상 명사열보다 실제 요청·데이터·장애 상황을 쓴다.
- `~인데요`, `~했어요`, `~할 수 있었어요`는 말투를 만들기 위해 반복하지 말고 문맥에 맞을 때만 사용한다. 기본 서술은 `~했습니다`가 안전하다.
- 제목은 프로젝트명보다 독자가 겪는 문제와 얻는 결과를 앞에 둔다.
- 마지막에는 결과를 과장하지 말고, 이 선택이 유효한 조건과 배운 점으로 닫는다.

피해야 할 번역투 표현:

- `문제의 압력`, `핵심 축`, `경계를 선명하게 했다`, `정답은 아니었다`
- `독자에게 필요한 최소한의 조건`, `재사용 가능한 원칙`, `검증 가능한 결과`
- `~을 중심으로 재구성했다`, `~을 전면에 배치했다`, `~을 드러냈다`처럼 편집 과정을 설명하는 문장
- `고려한 선택지와 탈락 이유`, `불변조건`, `실패 경계`를 설명 없이 명사로만 나열하는 소제목

이런 개념이 필요하면 실제 상황으로 풀어 쓴다. 예를 들어 `실패 경계를 정했다` 대신 `세금 처리는 메시지가 늦게 도착해도 다시 실행할 수 있게 분리했고, 고객 잔액 갱신은 요청 안에서 끝나도록 남겼다`처럼 쓴다.

### 참고할 한국어 기술 글의 흐름

- 토스 `토스는 Gateway 이렇게 씁니다`: 개념 설명 → 공통 로직 사례 → 보안과 안정성 → 모니터링 → 마무리
- 토스 `은행 최초 코어뱅킹 MSA 전환기`: 기존 시스템의 장점과 한계 → 도메인 분리 → 동시성·비동기·캐시 → 검증 → 순차 전환
- 토스 `유연하고 안전하게 배포 Pipeline 운영하기`: 규모가 커지며 생긴 어려움을 하나씩 제시하고 Pipeline as Code, Template, Helm, CI로 단계별 해결
- LINE `사이드카 프록시로 구현한 서비스 인증`: 비유로 개념을 설명한 뒤 구현 코드와 배포 과정, 실제로 생긴 문제까지 연결
- Hyperconnect `Spring Session + Custom Session Repository 기반 세션 저장소의 메모리 누수 해결`: 지표에서 이상을 발견하고 원인을 재현한 뒤 동시성·직렬화·정리 작업으로 닫는 장애 해결 서사

이 참고 글들의 문체를 흉내 내는 것이 목적이 아니다. 독자가 배경을 이해하고, 선택의 이유를 따라가고, 구현을 재현할 수 있는 한국어 설명 방식을 가져온다.

## 문체: 깊지만 독자를 밀어내지 않기

### 권장

- 짧은 문단 하나에 한 주장만 둔다.
- 첫 등장 때 전문 용어를 평범한 문장으로 설명한다.
- `we chose`, `we rejected`, `we learned`처럼 판단의 주체를 드러낸다.
- “처음에는 이렇게 보였다”, “이론상으로는”, “실제로 측정해 보니”라는 전환으로 직관과 현실의 차이를 보여준다.
- 장애와 잘못된 가설을 숨기지 않는다.
- “이 설계는 모든 시스템에 맞지 않는다”는 적용 경계를 마지막에 쓴다.

### 피할 것

- `seamless`, `blazing fast`, `highly scalable` 같은 검증되지 않은 형용사
- 기술 스택을 먼저 나열하는 도입부
- 다이어그램을 설명하지 않고 삽입하는 것
- trade-off 없이 선택한 기술을 최선이라고 부르는 것
- 코드 전체를 붙이고 왜 중요한지 설명하지 않는 것
- 수치를 출처·측정 조건 없이 제시하는 것
- 팀과 제품의 자랑으로 결론을 닫는 것

## 권장 목차

```markdown
# [문제와 규모가 드러나는 제목]
> [독자가 얻을 결과와 시스템 규모를 담은 부제목]

## 배경: 이 시스템은 무엇을 하는가?
## 문제가 드러난 순간
## 기존 설계와 그 장점
## 요구사항과 불변조건
## 고려한 선택지와 트레이드오프
## 새 아키텍처
## 데이터 구조와 핵심 코드
## 실패·동시성·배포 처리
## 검증 방법
## 결과: before / after
## 실제로 배운 것
## 이 설계를 사용하지 않을 때
```

소제목은 “무엇을 만들었는가”보다 “어떤 질문에 답하는가” 형태가 좋다.

## 초안 전 증거 수집표

| 항목 | 기록할 내용 |
|---|---|
| trigger | 어떤 이벤트에서 문제가 발생했는가 |
| scope | 사용자·요청·데이터·인스턴스 규모 |
| old path | 기존 request/write/deploy 경로 |
| bottleneck | metric, trace, profile |
| invariant | 절대 깨지면 안 되는 보장 |
| alternatives | 최소 2개의 대안과 탈락 이유 |
| new path | 변경 후 데이터 흐름 |
| code boundary | module/interface/worker/adapter 경계 |
| failure matrix | timeout, retry, duplicate, concurrent update |
| rollout | shadow/canary/dual-read/rollback 절차 |
| validation | benchmark, load test, production metric |
| result | before/after와 측정 조건 |
| limitation | 남은 위험과 적용하지 말아야 할 경우 |

빈 칸이 많으면 초안을 쓰지 말고 사실을 더 수집한다.

## 엄선한 해외 참고 사례

회사가 유명해서가 아니라, 특정 글쓰기 동작을 잘 보여주는 글만 참고한다. 게시 전에 원문 링크를 다시 확인한다.

1. **Canva — Session revocations at scale**  
   <https://www.canva.dev/blog/engineering/session-revocations-at-scale/>  
   보안 요구와 hot-path 성능에서 시작해 deploy-time cache stampede로 좁힌다. 30분 chunk, 16-byte binary record, sorted array와 binary search, conditional PUT/GET, worker, O(N²) 우려와 실측 throughput까지 구현 수준으로 내려간다. 결론은 “이론적 최적”이 아니라 constant factor와 실제 요구량이 중요하다는 교훈이다.

2. **Canva — How Canva collects 25 billion events per day**  
   <https://www.canva.dev/blog/engineering/product-analytics-event-collection/>  
   Kinesis와 MSK를 비용·지연·운영 부담으로 비교하고 zstd batching으로 압축 효과와 비용을 연결한다. 기술 유행이 아니라 workload와 운영 인력으로 선택하는 방식을 배운다.

3. **Canva — Scaling to Count Billions**  
   <https://www.canva.dev/blog/engineering/scaling-to-count-billions/>  
   기존 MySQL worker pipeline의 round-trip, incident handling, storage 문제를 보이고 OLAP/SQL transformation으로 전환한다. 기존 구현의 장점과 한계를 함께 설명한다.

4. **Cloudflare — Over 700 million events/second**  
   <https://blog.cloudflare.com/how-we-make-sense-of-too-much-data/>  
   overload 시 adaptive sampling, buffer overflow, 해상도 저하로 서비스를 살리는 graceful degradation을 구체화한다.

5. **Cloudflare — Building Cloudflare on Cloudflare**  
   <https://blog.cloudflare.com/building-cloudflare-on-cloudflare/>  
   시스템을 한 번에 재작성하지 않고 separable component를 점진적으로 옮기며 테스트·관측·rollback을 둔다.

6. **Discord — Tracing Discord’s Elixir Systems**  
   <https://discord.com/blog/tracing-discords-elixir-systems-without-melting-everything>  
   Envelope primitive, mixed-version 호환, fanout sampling, tracing overhead를 코드와 rollout 관점에서 설명한다.

7. **Grab — Trident: Real-time Event Processing at Scale**  
   <https://engineering.grab.com/trident-real-time-event-processing-at-scale>  
   independence, exactly-once, scalability 목표를 세운 후 CPU·DB·downstream 최적화를 각각 분해한다.

8. **Grab — Migrating Counter Service storage**  
   <https://engineering.grab.com/counter-service-storage-migration>  
   storage facade, shadow read/write, deterministic traffic split, parity metric, gradual cutover를 보여주는 마이그레이션 사례다.

9. **Allegro — Hexagonal Architecture by example**  
   <https://blog.allegro.tech/2020/05/hexagonal-architecture-by-example.html>  
   domain·adapter·port를 실제 외부 연동과 모델 변환으로 보여준다. 인터페이스의 존재보다 domain이 HTTP, JSON, S3, broker를 몰라도 되는 이유를 설명한다.

10. **Spotify — In praise of “boring” technology**  
    <https://engineering.atspotify.com/2013/02/in-praise-of-boring-technology>  
    기술 선택을 maturity, 운영 비용, failure behavior, 조직의 유지 능력으로 판단하고 선택하지 않은 이유도 설계의 일부로 쓴다.

11. **GitHub — How we improved push processing on GitHub**  
    <https://github.blog/engineering/architecture-optimization/how-we-improved-push-processing-on-github/>  
    핵심 경로의 병목을 관측하고 변경 전후의 처리 흐름과 성능 결과를 연결한다.

12. **Shopify — Deconstructing the Monolith**  
    <https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity>  
    서비스 분리 여부를 유행이 아니라 code ownership, developer productivity, 결합도, 배포 경계로 판단한다.

## 작성 프로토콜

### Step 1: 문제 문장과 증거를 고정한다

한 문장으로 failure mode를 쓰고 metric·trace·profile·incident 기록 중 최소 하나를 연결한다.

완료 기준: 독자가 “언제, 무엇이, 왜 문제였는가”를 수치 또는 관찰로 답할 수 있다.

### Step 2: 기존 경로와 불변조건을 그린다

변경 전 다이어그램에서 request path, write path, refresh path, source of truth를 구분한다. consistency·freshness·latency·security 조건을 목록으로 만든다.

완료 기준: 대안 평가에 사용할 요구사항 표와 before 다이어그램이 있다.

### Step 3: 대안 2~4개를 탈락 이유와 함께 기록한다

latency, correctness, operations, cost, rollout으로 비교한다. “간단하다”면 무엇이 간단한지 정의한다.

완료 기준: 독자가 같은 제약에서 다른 결론을 내릴 수 있을 정도로 trade-off가 드러난다.

### Step 4: 새 경로를 lifecycle과 code boundary로 설명한다

생성·변환·저장·조회·갱신·폐기 순서로 쓰고 각 단계의 owner와 failure behavior를 적는다. 핵심 코드나 pseudo-code는 불변조건이 드러나는 부분만 보여준다.

완료 기준: 독자가 duplicate, lost update, stale data 처리 방식을 설명할 수 있다.

### Step 5: 롤아웃과 검증을 먼저 쓴 다음 결과를 쓴다

shadow, dual read/write, canary, feature flag, rollback 기준을 기록한다. production metric과 load test를 before/after 조건과 함께 표로 만든다.

완료 기준: 어떻게 안전하게 바꿨고 효과를 어떻게 측정했는지 재현 가능하다.

### Step 6: 한계와 일반화 범위를 적는다

맞지 않는 workload, 허용하지 않은 failure, 아직 수동인 절차, 미래의 병목을 적는다.

완료 기준: 독자가 적용하면 안 되는 조건을 최소 2개 말할 수 있다.

## Common Pitfalls

1. **시스템 전체를 설명한다.** 하나의 failure mode로 범위를 줄인다.
2. **해결책부터 등장한다.** 기존 방식의 장점과 병목을 먼저 보여준다.
3. **수치를 장식처럼 붙인다.** 숫자에 단위·시간·환경·측정 방법을 붙인다.
4. **trade-off를 숨긴다.** 선택한 구조의 비용과 복잡도를 명시한다.
5. **점근적 복잡도만 본다.** batch size, allocation, network, cache locality를 benchmark한다.
6. **코드 품질을 형용사로 평가한다.** 계약, 의존성 방향, idempotency, architectural test, rollback으로 증명한다.
7. **migration에서 mixed version을 빠뜨린다.** 구버전/신버전, 재시작, 중복 전달, 부분 배포를 failure matrix에 넣는다.
8. **실패를 지운다.** 잘못된 첫 가설과 되돌린 최적화는 공개한다.
9. **결론이 제품 홍보가 된다.** 어떤 상황에서 어떤 판단이 유효한지로 닫는다.
10. **사례를 복사한다.** Canva의 S3/chunk가 아니라 문제를 좁히고 요구사항과 실측으로 선택하는 과정을 재사용한다.

## Verification Checklist

- [ ] 제목과 부제목에 문제·규모·독자 가치가 드러난다.
- [ ] 도입부에서 사용자 영향, 규모, SLO, failure mode를 설명했다.
- [ ] 기존 설계가 왜 합리적이었는지 설명했다.
- [ ] before/after 데이터 흐름이 재현된다.
- [ ] latency, correctness, freshness, rollout, operations, cost를 다뤘다.
- [ ] 최소 2개의 대안과 탈락 이유가 있다.
- [ ] 자료구조, 접근 패턴, 비용, 동시성 보장이 설명된다.
- [ ] timeout, retry, duplicate, stale data, lost update, mixed version을 다뤘다.
- [ ] 핵심 코드가 책임 경계와 불변조건을 보여준다.
- [ ] 테스트가 위험과 연결되어 있다.
- [ ] rollout, rollback, 관측 지표가 있다.
- [ ] before/after 수치에 측정 조건과 출처가 있다.
- [ ] measured/estimated/expected를 구분했다.
- [ ] 실패한 가설 또는 되돌린 선택을 최소 하나 공개했다.
- [ ] 적용하지 말아야 할 조건과 남은 한계를 적었다.
- [ ] 전문 용어가 처음 등장할 때 설명되어 있다.
- [ ] 외부 사례와 인용은 원문 링크를 확인했다.
- [ ] 내부 경로, credential, 개인 식별 정보, 공개 불가 수치를 제거하거나 범위·상대값으로 바꿨다.
