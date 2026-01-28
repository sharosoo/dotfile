# Claude Code Neovim Integration

Claude Code와 Neovim의 완벽한 통합을 제공하는 플러그인입니다.

## 🚀 설치 확인

플러그인은 이미 설치되어 있습니다. Neovim을 재시작하면 자동으로 로드됩니다:

```bash
# Neovim 재시작
vi

# 플러그인 상태 확인
:Lazy
# claude-code.nvim이 로드되었는지 확인
```

## 📋 필수 요구사항

1. **Claude Code CLI 설치**
   ```bash
   # Claude Code가 설치되어 있어야 합니다
   # 터미널에서 확인:
   claude --version
   ```

2. **환경 설정**
   - Claude Code가 PATH에 있어야 함
   - API 키가 설정되어 있어야 함

## 🎯 주요 기능 및 단축키

### 기본 단축키

| 단축키 | 기능 | 설명 |
|--------|------|------|
| `<Leader>cc` | Open Chat | Claude와 대화 창 열기 |
| `<Leader>cs` | Send Selection | 선택한 텍스트를 Claude에게 전송 |
| `<Leader>cb` | Send Buffer | 현재 버퍼 전체를 Claude에게 전송 |
| `<Leader>ca` | Apply Suggestion | Claude의 제안을 현재 버퍼에 적용 |

### 사용 예시

#### 1. 코드 리뷰 요청
```vim
" 1. 리뷰받고 싶은 코드를 비주얼 모드로 선택 (V 또는 v)
" 2. <Leader>cs 를 눌러 Claude에게 전송
" 3. "이 코드를 리뷰해줘" 같은 메시지 입력
```

#### 2. 전체 파일 분석
```vim
" 1. 분석하고 싶은 파일 열기
" 2. <Leader>cb 를 눌러 전체 버퍼 전송
" 3. "이 파일의 구조를 설명해줘" 같은 요청
```

#### 3. 대화형 코딩
```vim
" 1. <Leader>cc 를 눌러 Claude 채팅 창 열기
" 2. 질문이나 요청 입력
" 3. Claude의 답변을 받고 필요시 <Leader>ca로 적용
```

#### 4. 코드 생성
```vim
" 1. 주석으로 원하는 기능 설명 작성
" 2. 주석 선택 후 <Leader>cs
" 3. "이 주석대로 코드를 작성해줘" 요청
" 4. <Leader>ca 로 생성된 코드 적용
```

## 🛠️ 고급 사용법

### 커스텀 명령어

```vim
" Claude에게 현재 파일 설명 요청
:ClaudeExplain

" Claude에게 코드 최적화 요청
:ClaudeOptimize

" Claude에게 테스트 작성 요청
:ClaudeTest
```

### 워크플로우 예시

#### 버그 수정 워크플로우
1. 에러가 있는 코드로 이동
2. 에러 메시지와 함께 코드 선택
3. `<Leader>cs` 로 Claude에게 전송
4. "이 에러를 어떻게 해결할 수 있을까?" 질문
5. Claude의 해결책 확인
6. `<Leader>ca` 로 수정 사항 적용

#### 리팩토링 워크플로우
1. 리팩토링이 필요한 함수 선택
2. `<Leader>cs` 로 전송
3. "이 함수를 더 깔끔하게 리팩토링해줘" 요청
4. 제안된 코드 검토
5. `<Leader>ca` 로 적용

## ⚙️ 설정 커스터마이징

`~/.config/nvim/init.lua`에서 설정을 변경할 수 있습니다:

```lua
require("claude-code").setup({
  -- Claude 실행 파일 경로
  claude_code_path = "claude",
  
  -- 사용할 모델
  model = "claude-3-opus-20240229",
  
  -- 창 설정
  window = {
    width = 80,      -- 창 너비
    height = 20,     -- 창 높이
    border = "rounded", -- 테두리 스타일
  },
  
  -- 키맵 (false로 설정하면 비활성화)
  keymaps = {
    send_selection = "<leader>cs",
    send_buffer = "<leader>cb",
    open_chat = "<leader>cc",
    apply_suggestion = "<leader>ca",
  },
  
  -- 전송 전 자동 저장
  auto_save = true,
  
  -- 알림 표시
  notify = true,
})
```

## 🔧 문제 해결

### Claude 명령을 찾을 수 없음
```bash
# PATH 확인
echo $PATH

# Claude 위치 확인
which claude

# 필요시 PATH에 추가
export PATH="$PATH:/path/to/claude"
```

### API 키 문제
```bash
# API 키 설정 확인
echo $ANTHROPIC_API_KEY

# 키 설정
export ANTHROPIC_API_KEY="your-api-key"
```

### 플러그인이 로드되지 않음
```vim
" Neovim에서 확인
:Lazy
" claude-code.nvim 상태 확인

" 수동으로 로드
:Lazy load claude-code.nvim
```

## 💡 팁과 트릭

1. **컨텍스트 제공**: Claude에게 더 나은 답변을 받으려면 충분한 컨텍스트를 제공하세요
2. **명확한 요청**: "이 함수를 TypeScript로 변환해줘" 같은 명확한 요청이 좋습니다
3. **점진적 작업**: 큰 변경사항은 작은 단위로 나누어 요청하세요
4. **검토 필수**: Claude의 제안을 적용하기 전에 항상 검토하세요

## 🎨 통합 예시

### Python 개발
```python
# 함수 선택 후 <Leader>cs
# "이 함수에 타입 힌트를 추가하고 docstring을 작성해줘"
```

### TypeScript 개발
```typescript
// 인터페이스 선택 후 <Leader>cs
// "이 인터페이스를 기반으로 구현 클래스를 만들어줘"
```

### Go 개발
```go
// 구조체 선택 후 <Leader>cs
// "이 구조체에 대한 유닛 테스트를 작성해줘"
```

## 🚦 상태 표시

- 창 하단에 Claude 연결 상태 표시
- 처리 중일 때 로딩 인디케이터
- 에러 발생 시 알림 표시

이제 Neovim에서 Claude Code의 강력한 기능을 직접 사용할 수 있습니다! 🎉