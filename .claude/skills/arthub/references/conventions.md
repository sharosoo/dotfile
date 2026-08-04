# arthub 문서 작성 규약

발행 API가 규약 위반을 400으로 거부한다. 응답의 findings를 읽고 고쳐서 다시 부르면 된다.

## 형식

마크다운이 기본이다. 산문은 테마가 알아서 예쁘게 렌더하고, 인터랙티브한 부분만
라이브 블록으로 뺀다. 통짜 HTML은 슬라이드처럼 레이아웃을 완전히 장악해야 할 때만 쓴다.

**스타일을 직접 쓰지 마라.** 색·폰트·여백은 테마가 소유한다. 아래 컴포넌트로 표현하고,
컴포넌트로 표현할 수 없는 것만 라이브 블록으로 처리한다.

## 반드시 지킬 것 (어기면 발행이 거부된다)

1. 본문에 raw HTML을 쓰지 않는다.
   <div>, <br>, <details>, <img width> 전부 금지.
   파서가 편집 불가능한 덩어리로 삼켜서 나중에 사람이 고칠 수 없게 된다.
   강조는 마크다운으로, 레이아웃은 ::: 컴포넌트로, 인터랙티브는 라이브 블록으로.

2. # 제목은 문서당 정확히 하나. 섹션은 ##.

3. ::: 컴포넌트를 중첩할 때는 바깥 마커를 더 길게 쓴다.
   ::::grid 안에 :::card. 같은 길이면 첫 번째 닫는 마커에서 끊겨 조용히 깨진다.

4. 라이브 블록은 자체로 완결돼야 한다. 블록마다 별개 문서에서 실행되므로
   블록 간 변수 공유가 안 되고, 부모 문서(window.parent, top.)에 접근할 수 없다.

5. 차트는 ```chart 프리셋으로만 만든다. Charts.css <table>을 직접 쓰지 않는다.
   라벨 겹침 방지는 이 방식에서만 적용된다.

## 컴포넌트

사용 가능: grid, card, stat, compare, timeline, figure, details

::::grid{cols=2}
:::card{title="처리량"}
초당 1,200건.
:::
:::card{title="지연"}
p99 240ms.
:::
::::

:::stat{label="MAU" value="12.4k" delta="+8%" trend="up"}
:::

:::details{summary="원본 로그"}
접힌 내용.
:::

:::figure{caption="요청 흐름"}
![다이어그램](img.png)
:::

## 차트

```chart
type: column
caption: 월별 가입
x: [1월, 2월, 3월, 4월]
series:
  - { name: 가입, data: [120, 180, 240, 310] }
  - { name: 이탈, data: [20, 24, 31, 28] }
```

- type: column, bar, line, area, pie, radial, polar, radar
- 데이터만 주면 팔레트·다크모드·라벨 겹침은 자동으로 처리된다
- 라벨이 길거나 카테고리가 9개 이상이면 가로 막대로 자동 전환된다
- 데이터 포인트가 30개를 넘으면 표를 쓰는 편이 낫다

## 라이브 블록

```html render
<div id="c" style="height:280px"></div>
<script src="https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js"></script>
<script>echarts.init(document.getElementById('c')).setOption({ /* ... */ })</script>
```

- info string은 정확히 `html render`. render가 없으면 실행되지 않고 코드로 표시된다
- 높이는 자동 조절된다. position:fixed 는 금지다
- 외부 스크립트는 다음 도메인만 허용된다: cdn.jsdelivr.net, unpkg.com, cdnjs.cloudflare.com
- 문서당 20개, 블록당 64KB 상한
- 색은 var(--ah-c1)~var(--ah-c6), 글꼴은 지정하지 않는다 (테마 토큰이 주입돼 있다)

## 그 밖에 쓸 수 있는 것

- 콜아웃: > [!NOTE] > [!TIP] > [!WARNING] > [!CAUTION] > [!IMPORTANT]
- 코드: ```ts title="src/app.ts"
  변경 표시: // [!code ++]  // [!code --]  // [!code highlight]
- 표, 각주[^1], 체크박스 - [ ], mermaid 다이어그램

## 습관

- 나열형 데이터는 불릿 대신 표로
- 주의사항은 콜아웃으로
- 구조·흐름은 mermaid로
- 새로 만들기 전에 list_artifacts 로 같은 문서가 있는지 확인한다
- 갱신은 새로 만들지 말고 같은 slug로 update_artifact 를 쓴다 (링크가 유지된다)
- 갱신 전에 get_draft 로 사람이 편집 중인지 확인한다. 미발행 초안이 있으면 update_artifact 를 부르지 말고 멈춰서 사용자에게 충돌을 보고한다.

## 발행

원격 MCP: https://artifact.sharosoo.com/mcp  (툴: publish_artifact, update_artifact, get_draft, list_artifacts, read_artifact)
토큰 발급: https://artifact.sharosoo.com/settings/tokens
로컬 파일·이미지: arthub CLI
