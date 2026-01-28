# DAP (Debug Adapter Protocol) 사용 가이드

Neovim에서 DAP를 사용한 강력한 디버깅 환경을 제공합니다.

## 🚀 지원 언어

- **Python** - debugpy
- **Go** - delve (dlv)
- **JavaScript/TypeScript** - js-debug-adapter
- **Rust** - CodeLLDB
- **C/C++** - CodeLLDB

## 📋 필수 도구 설치

### Python
```bash
pip install debugpy
```

### Go
```bash
go install github.com/go-delve/delve/cmd/dlv@latest
```

### JavaScript/TypeScript
```bash
npm install -g js-debug-adapter
```

### Rust/C/C++
```bash
# macOS (Homebrew)
brew install llvm

# 또는 VS Code Extension에서 CodeLLDB 설치
```

## 🎯 기본 단축키

### 브레이크포인트 관리
| 단축키 | 기능 |
|--------|------|
| `<Space>db` | 브레이크포인트 토글 |
| `<Space>dB` | 조건부 브레이크포인트 |
| `<Space>dx` | 모든 브레이크포인트 제거 |

### 디버깅 제어
| 단축키 | 기능 |
|--------|------|
| `<Space>dc` | 계속 실행 (Continue) |
| `<Space>di` | 함수 안으로 들어가기 (Step Into) |
| `<Space>do` | 다음 줄로 넘어가기 (Step Over) |
| `<Space>dO` | 함수에서 나오기 (Step Out) |
| `<Space>dp` | 일시정지 (Pause) |
| `<Space>dt` | 디버깅 종료 (Terminate) |
| `<Space>dR` | 디버깅 재시작 (Restart) |

### UI 제어
| 단축키 | 기능 |
|--------|------|
| `<Space>du` | 디버그 UI 토글 |
| `<Space>dr` | REPL 토글 |
| `<Space>df` | 플로팅 창으로 요소 보기 |

### 변수 검사
| 단축키 | 기능 |
|--------|------|
| `<Space>de` | 표현식 평가 |
| `<Space>dh` | 변수 호버 |
| `<Space>dS` | 스코프 창 |
| `<Space>ds` | 현재 세션 정보 |

## 💡 사용법 예시

### 1. Python 디버깅

#### 기본 파일 디버깅
```python
# test.py
def hello(name):
    greeting = f"Hello, {name}!"  # 여기에 브레이크포인트
    return greeting

if __name__ == "__main__":
    result = hello("World")
    print(result)
```

1. `greeting = f"Hello, {name}!"` 줄에 커서를 놓고 `<Space>db`
2. `F5` 또는 `<Space>dc` 로 디버깅 시작
3. "Launch file" 선택
4. `<Space>di`로 단계별 실행

#### Django 디버깅
1. Django 프로젝트에서 `F5` 또는 `<Space>dc`
2. "Django" 구성 선택
3. 서버가 시작되면 브레이크포인트에서 멈춤

#### FastAPI 디버깅
1. FastAPI 프로젝트에서 `F5` 또는 `<Space>dc`
2. "FastAPI" 구성 선택
3. API 엔드포인트에 요청을 보내면 브레이크포인트에서 멈춤

### 2. Go 디버깅

```go
// main.go
package main

import "fmt"

func main() {
    name := "Go"
    message := fmt.Sprintf("Hello, %s!", name)  // 브레이크포인트
    fmt.Println(message)
}
```

1. 브레이크포인트 설정: `<Space>db`
2. 디버깅 시작: `<Space>dc`
3. "Debug" 구성 선택

### 3. JavaScript/TypeScript 디버깅

```javascript
// app.js
function greet(name) {
    const message = `Hello, ${name}!`;  // 브레이크포인트
    return message;
}

console.log(greet("JavaScript"));
```

1. 브레이크포인트 설정
2. `<Space>dc` → "Launch file" 선택

### 4. Rust 디버깅

```rust
// src/main.rs
fn main() {
    let name = "Rust";
    let message = format!("Hello, {}!", name);  // 브레이크포인트
    println!("{}", message);
}
```

1. `cargo build` 실행
2. 브레이크포인트 설정
3. `<Space>dc` → "Launch" 선택
4. 실행 파일 경로 입력 (보통 `target/debug/프로젝트명`)

## 🎮 고급 기능

### 조건부 브레이크포인트
```vim
" 특정 조건에서만 멈추기
<Space>dB
" 입력: x > 10
```

### 변수 감시
1. 변수 선택 (비주얼 모드)
2. `<Space>de` 로 값 평가
3. Watch 창에서 지속 모니터링

### REPL 사용
1. `<Space>dr` 로 REPL 열기
2. 실시간으로 코드 실행 및 변수 확인

### 멀티 세션 디버깅
- 여러 프로세스 동시 디버깅 가능
- `<Space>ds` 로 활성 세션 확인

## 🛠️ 디버그 UI 구성

### 왼쪽 패널
- **Scopes**: 현재 스코프의 변수들
- **Breakpoints**: 설정된 브레이크포인트 목록
- **Stacks**: 호출 스택
- **Watches**: 감시 중인 표현식

### 하단 패널
- **REPL**: 실시간 코드 실행
- **Console**: 프로그램 출력

### UI 조작
- `Enter`: 항목 펼치기/접기
- `o`: 파일 열기
- `d`: 항목 삭제
- `e`: 편집
- `r`: REPL에서 실행

## ⚙️ 설정 커스터마이징

### 새로운 언어 추가
```lua
-- init.lua에서
dap.adapters.your_language = {
  type = "executable",
  command = "your-debugger",
  args = { "debug", "${file}" },
}

dap.configurations.your_language = {
  {
    type = "your_language",
    request = "launch",
    name = "Launch file",
    program = "${file}",
  },
}
```

### 브레이크포인트 아이콘 변경
```lua
vim.fn.sign_define("DapBreakpoint", { text = "●", texthl = "DiagnosticError" })
```

## 🔧 문제 해결

### DAP 어댑터를 찾을 수 없음
```bash
# 설치 확인
which dlv        # Go
which debugpy    # Python (pip show debugpy)
```

### 포트 충돌
```vim
" Go 디버거 포트 변경
:lua require('dap').adapters.delve.port = 38697
```

### 실행 파일을 찾을 수 없음
- 올바른 빌드 후 디버깅 시작
- 절대 경로 사용
- 실행 권한 확인

## 💡 디버깅 팁

1. **로그 포인트 사용**: 브레이크포인트 대신 로그만 출력
2. **조건부 중단**: 특정 조건에서만 실행 중단
3. **핫 리로드**: 코드 변경 후 즉시 적용 (일부 언어)
4. **스택 프레임 탐색**: 호출 스택에서 다른 프레임으로 이동
5. **변수 편집**: 런타임에 변수 값 수정

## 🚦 상태 표시

- 🔴 일반 브레이크포인트
- 🟡 조건부 브레이크포인트  
- ⚪ 비활성화된 브레이크포인트
- ▶️ 현재 실행 위치
- 📝 로그 포인트

이제 Neovim에서 강력한 디버깅 기능을 활용할 수 있습니다! 🎉