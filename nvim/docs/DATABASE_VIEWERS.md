# Database Viewers 사용 가이드

Neovim에서 SQLite, PostgreSQL, MySQL 등 다양한 데이터베이스를 관리할 수 있는 강력한 도구들입니다.

## 🚀 지원 데이터베이스

- **SQLite** - 로컬 파일 기반 데이터베이스
- **MySQL** - MySQL/MariaDB 서버
- **PostgreSQL** - PostgreSQL 서버
- **MongoDB** - NoSQL 데이터베이스
- **Redis** - 인메모리 데이터베이스

## 📋 설치된 플러그인

### 1. vim-dadbod-ui
- 시각적 데이터베이스 인터페이스
- 테이블 탐색, 쿼리 실행, 결과 보기

### 2. vim-dadbod
- 코어 데이터베이스 연결 및 쿼리 엔진

### 3. vim-dadbod-completion
- SQL 자동완성 기능

### 4. sqls.nvim
- SQL LSP 지원 (포맷팅, 린팅)

## 🎯 기본 단축키

### 데이터베이스 UI
| 단축키 | 기능 |
|--------|------|
| `<Space>Db` | 데이터베이스 UI 토글 |
| `<Space>Df` | DB 버퍼 찾기 |
| `<Space>Dr` | DB 버퍼 이름 변경 |
| `<Space>Dq` | 마지막 쿼리 정보 |

### SQL 쿼리 실행 (SQL 파일에서)
| 단축키 | 기능 |
|--------|------|
| `<Space>De` | 현재 줄의 쿼리 실행 |
| `<Space>De` (Visual) | 선택한 쿼리 실행 |
| `<Space>DE` | 전체 파일 실행 |
| `<Space>Dw` | 저장 후 실행 |

### DBUI 내부 키맵
| 키 | 기능 |
|----|------|
| `<Enter>` | 연결/테이블 열기 |
| `o` | 새 탭에서 열기 |
| `S` | 수평 분할로 열기 |
| `V` | 수직 분할로 열기 |
| `d` | 연결/쿼리 삭제 |
| `R` | 새로고침 |
| `A` | 새 연결 추가 |

## 💾 데이터베이스 연결 설정

### SQLite
```vim
" DBUI에서 연결 추가
:DBUIAddConnection sqlite:///path/to/database.db

" 또는 vim-dadbod 직접 사용
:DB sqlite:///path/to/database.db
```

### MySQL
```vim
" 기본 연결
:DBUIAddConnection mysql://username:password@localhost:3306/database_name

" SSL 연결
:DBUIAddConnection mysql://username:password@localhost:3306/database_name?ssl-mode=required
```

### PostgreSQL
```vim
" 기본 연결
:DBUIAddConnection postgresql://username:password@localhost:5432/database_name

" 환경 변수 사용
:DBUIAddConnection postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME
```

### MongoDB
```vim
:DBUIAddConnection mongodb://username:password@localhost:27017/database_name
```

## 🔧 연결 설정 파일

`~/.local/share/db_ui/connections.json`에 연결 정보를 저장할 수 있습니다:

```json
{
  "my_sqlite": "sqlite:///home/user/projects/app.db",
  "dev_mysql": "mysql://dev:password@localhost:3306/dev_db",
  "prod_postgres": "postgresql://user:pass@prod-server:5432/main_db"
}
```

## 💡 사용법 예시

### 1. 데이터베이스 연결하기
```vim
1. <Space>Db 로 DBUI 열기
2. A 키로 새 연결 추가
3. 연결 문자열 입력:
   sqlite:///Users/username/myapp.db
4. Enter로 연결
```

### 2. 테이블 탐색
```vim
1. DBUI에서 데이터베이스 확장 (Enter)
2. Tables 확장
3. 테이블 선택 후 Enter
4. 테이블 스키마 확인
```

### 3. 쿼리 실행

#### 방법 1: DBUI 내부에서
```vim
1. DBUI에서 "New Query" 선택
2. SQL 쿼리 작성:
   SELECT * FROM users WHERE age > 18;
3. 쿼리 선택 후:
   - Visual mode로 쿼리 선택 → <Enter>
   - 또는 DBUI 창에서 <S>로 실행
```

#### 방법 2: SQL 파일에서 직접
```vim
1. test.sql 파일 생성 또는 열기
2. 쿼리 작성
3. 실행 방법:
   - <Space>De: 현재 줄의 쿼리 실행
   - Visual mode로 선택 → <Space>De: 선택한 쿼리만 실행
   - <Space>DE: 파일 전체 실행
```

#### 방법 3: 직접 명령어
```vim
" 현재 버퍼의 SQL 실행
:DB

" 특정 데이터베이스에 쿼리 실행
:DB sqlite:///path/to/db.db SELECT * FROM users;

" 선택한 쿼리 실행
:'<,'>DB
```

### 4. 결과 보기
```vim
" 쿼리 실행 후 결과창에서:
" - q: 닫기
" - R: 새로고침
" - <Tab>: 다음 탭으로
```

## 🎨 고급 기능

### 저장된 쿼리
```vim
1. 자주 사용하는 쿼리 작성
2. :w saved_queries/user_report.sql 로 저장
3. DBUI의 "Saved Queries"에서 재사용
```

### 트랜잭션 관리
```sql
-- 트랜잭션 시작
BEGIN;

-- 쿼리 실행
UPDATE users SET status = 'active' WHERE id = 1;

-- 커밋 또는 롤백
COMMIT;
-- 또는 ROLLBACK;
```

### 대량 데이터 처리
```sql
-- 페이징으로 대량 데이터 조회
SELECT * FROM large_table 
LIMIT 100 OFFSET 0;

-- 인덱스 정보 확인 (PostgreSQL)
SELECT * FROM pg_indexes WHERE tablename = 'my_table';
```

## 🔧 환경 변수 활용

Fish에서 데이터베이스 연결 정보 설정:

```fish
# 개발 환경
set -gx DEV_DB_URL "postgresql://dev:dev123@localhost:5432/dev_db"

# 테스트 환경
set -gx TEST_DB_URL "sqlite:///tmp/test.db"

# 프로덕션 (주의!)
set -gx PROD_DB_URL "postgresql://prod_user:$PROD_PASSWORD@prod-server:5432/prod_db"
```

Neovim에서 사용:
```vim
:DBUIAddConnection $DEV_DB_URL
```

## 🛡️ 보안 주의사항

1. **패스워드 관리**
   - 설정 파일에 평문 비밀번호 저장 금지
   - 환경 변수나 키링 사용 권장

2. **프로덕션 연결**
   - 읽기 전용 계정 사용
   - VPN 연결 필수
   - 쿼리 실행 전 충분한 검토

3. **백업**
   - 중요한 작업 전 백업 확인
   - 트랜잭션 사용으로 안전성 확보

## 📊 SQL 포맷팅

`sqls.nvim`이 제공하는 기능:

```vim
" SQL 파일에서 자동 포맷팅
:SqlsFormatBuffer

" 선택한 SQL 구문 포맷팅  
(Visual mode에서 선택 후)
:SqlsFormatQuery
```

## 🔍 문제 해결

### 연결 실패
```vim
" 연결 테스트
:echo system('mysql -u username -p -e "SELECT 1"')

" SQLite 파일 권한 확인
:!ls -la /path/to/database.db
```

### 성능 이슈
```sql
-- 쿼리 실행 계획 확인 (PostgreSQL)
EXPLAIN ANALYZE SELECT * FROM large_table WHERE condition;

-- MySQL
EXPLAIN FORMAT=JSON SELECT * FROM table;
```

### 인코딩 문제
```vim
" UTF-8 설정 확인
:set encoding?
:set fileencoding?
```

## 💡 팁과 트릭

1. **쿼리 히스토리**: DBUI는 실행한 쿼리를 자동 저장
2. **결과 내보내기**: 결과를 CSV로 복사 가능
3. **스키마 비교**: 여러 데이터베이스의 스키마 비교
4. **자동완성**: SQL 키워드와 테이블명 자동완성
5. **코드 스니펫**: 자주 사용하는 쿼리 템플릿 저장

## 🚦 상태 표시

- 🟢 연결됨
- 🔴 연결 실패
- 🟡 쿼리 실행 중
- ⚪ 비활성 연결

이제 Neovim에서 강력한 데이터베이스 관리 기능을 사용할 수 있습니다! 🎉
