# 윈도우용 경량 마크다운 리더 설계 문서

## 목표
이 문서는 옵시디언과 유사한 사용성을 일부 참고하되, **편집 기능 없이 읽기 전용**에 집중한 윈도우용 경량 마크다운 리더의 기술 스택, 필요한 역량(skill), 그리고 개발/검증 하네스 구성을 정리한다. 구현 목표는 빠른 실행, 낮은 메모리 점유, 로컬 폴더 기반 탐색, 링크 이동, 이미지/코드블록/목차 렌더링, 검색, 그리고 안정적인 파일 감시까지 포함하는 것이다.

## 제품 범위
### 포함
- 로컬 폴더(vault 유사 개념) 열기
- `.md` 파일 목록/트리 보기
- 읽기 전용 렌더링
- 위키링크(`[[note]]`)와 표준 마크다운 링크 이동
- 코드 하이라이팅
- 이미지, 표, 체크리스트 렌더링
- 문서 내 TOC, 백링크/링크 패널(선택)
- 전체 텍스트 검색
- 파일 변경 감지 후 자동 새로고침
- 다크/라이트 테마

### 제외
- 편집기, 실시간 프리뷰 편집
- 동기화/계정 시스템
- 플러그인 마켓
- 협업 기능
- 모바일/웹 우선 대응

## 핵심 비기능 요구사항
- 실행 파일 기준 배포가 단순해야 한다.
- 콜드 스타트가 빨라야 한다.
- 수천 개 노트 규모에서도 탐색과 검색이 즉각적이어야 한다.
- 렌더링 엔진은 CommonMark + GFM + 위키링크 확장을 안정적으로 지원해야 한다.
- 메모리 사용량은 Electron 기반 풀 IDE형 앱보다 작아야 한다.

## 권장 기술 스택
가장 현실적인 기본안은 **Rust + Tauri + React** 조합이다. Rust가 파일 시스템 감시, 인덱싱, 링크 해석, 검색, 캐시 계층을 담당하고, Tauri가 가벼운 윈도우 데스크톱 셸을 제공하며, React는 리더 UI를 담당한다.

### 기본안: Rust + Tauri + React
| 계층 | 권장 스택 | 역할 |
|---|---|---|
| 데스크톱 셸 | Tauri v2 | 가벼운 윈도우 앱 패키징, IPC, 시스템 연동 |
| 코어 엔진 | Rust | 파일 스캔, 파서 연결, 링크 그래프, 검색 인덱스, 파일 감시 |
| UI | React + TypeScript + Vite | 좌측 트리, 본문 뷰어, 검색 패널, 설정 UI |
| 스타일 | Tailwind 또는 CSS Modules | 빠른 UI 구성, 테마 토큰 관리 |
| 마크다운 파싱 | markdown-it / unified 계열 또는 Rust parser 래핑 | CommonMark/GFM/위키링크 처리 |
| 코드 하이라이트 | Shiki 또는 highlight.js | 읽기 전용 코드블록 렌더링 |
| 검색 | tantivy(Rust) 또는 minisearch(JS) | 전체 텍스트 검색, 제목/태그 가중치 |
| 파일 감시 | notify(Rust) | 변경 감지 및 증분 인덱싱 |
| 설정 저장 | serde + 로컬 설정 파일 | 최근 폴더, 테마, UI 상태 |

이 조합의 장점은 성능 민감 영역을 Rust로 묶으면서도 UI 생산성을 유지할 수 있다는 점이다. 특히 사용자 특성상 Rust와 웹 스택 모두 익숙하므로 유지보수 비용도 낮다.

### 대안 1: Rust + native UI (egui / iced)
이 조합은 더 가벼울 수 있지만, 마크다운 렌더링 품질과 풍부한 레이아웃 처리에서 웹뷰 기반보다 구현 난도가 높다. 이미지, 표, 코드블록, 내부 링크, CSS 수준 테마 확장성까지 고려하면 초기 제품 완성 속도는 떨어질 가능성이 크다.

### 대안 2: .NET + WPF/WinUI 3
윈도우 친화성과 배포 경험은 좋지만, 크로스플랫폼 여지를 줄이고 마크다운 렌더링/프론트엔드 생태계 활용성이 상대적으로 약하다. 팀이 C# 중심이면 좋은 선택이지만, 현재 사용자 성향에는 Tauri/Rust가 더 자연스럽다.

## 추천 아키텍처
### 1. 앱 레이어
- `shell`: Tauri 명령, 파일 대화상자, 앱 라이프사이클
- `core`: vault 스캐너, 캐시, 링크 해석기, 인덱서, watcher
- `ui`: 탐색기, 문서 뷰, 검색 패널, 설정, 상태 표시

### 2. 데이터 흐름
1. 사용자가 폴더를 연다.
2. Rust 코어가 파일 목록과 메타데이터를 스캔한다.
3. 인덱서를 생성해 제목/헤더/본문/링크 정보를 저장한다.
4. UI는 파일 트리와 최근 문서를 표시한다.
5. 문서를 선택하면 코어가 원문과 메타를 전달한다.
6. 렌더 파이프라인이 HTML/AST를 만들고 UI에서 표시한다.
7. 파일 변경 이벤트가 들어오면 해당 노트만 증분 갱신한다.

### 3. 렌더 파이프라인
- 입력: markdown text
- 전처리: frontmatter 분리, wiki link 정규화, 상대경로 해석
- 파싱: CommonMark/GFM
- 확장: wikilink, callout, task list, footnote(선택)
- 출력: sanitized HTML 또는 React AST
- 후처리: heading anchor, TOC 추출, code highlight, image path resolve

## 모듈 구성 제안
### Rust core
- `vault` : 폴더 열기, 파일 스캔, 경로 정규화
- `watcher` : 파일 생성/수정/삭제 감지
- `indexer` : 제목, 헤더, 본문, 링크 역색인
- `resolver` : `[[note]]`, `![[embed]]`, 상대 링크 해석
- `search` : 검색 질의, 랭킹, 필터
- `cache` : 파싱 결과/썸네일/최근 문서 캐시
- `settings` : 앱 설정 로드/저장

### Frontend UI
- `sidebar-tree` : 폴더/파일 트리
- `reader-view` : 렌더링된 본문
- `outline-panel` : 문서 헤더 기반 TOC
- `search-panel` : 즉시 검색 결과
- `status-bar` : 현재 파일, 인덱싱 상태, watcher 상태
- `theme-system` : light/dark, 코드테마, 폰트 크기

## 필요한 skill 세트
### 필수 skill
- **Rust 시스템 프로그래밍**: 파일 I/O, watcher, 경로 처리, 캐시, IPC 경계 설계
- **Tauri 앱 구성**: command, event, window lifecycle, packaging, updater 배제/포함 판단
- **React/TypeScript UI 설계**: 상태 관리, 가상 리스트, 패널 레이아웃
- **Markdown parser 확장**: 위키링크, 콜아웃, 내부 앵커, frontmatter 처리
- **검색 엔진 설계**: 역색인, 토큰화, 한글/영문 혼합 검색 품질 조정
- **Windows 배포**: MSI/NSIS, 코드사인, 파일 연결(optional)

### 있으면 좋은 skill
- **성능 프로파일링**: 대형 vault 스캔 시간, re-render 최소화, 검색 latency 측정
- **보안/렌더 sanitization**: 로컬 HTML 렌더링 시 XSS/unsafe URL 차단
- **문서 UX 설계**: 키보드 네비게이션, 접근성, 긴 문서 스크롤 경험
- **테마 시스템 설계**: 다크모드, 코드테마, typography scale

## 하네스 구성
여기서 하네스는 개발 중 기능 검증을 자동화하고, 실제 노트 저장소에서 성능과 정확도를 반복 측정하는 구조를 뜻한다.

### 1. 테스트 하네스 레이어
| 하네스 | 목적 | 도구 |
|---|---|---|
| 단위 테스트 | 링크 해석, 경로 처리, 파서 확장 검증 | Rust test, Vitest |
| 스냅샷 테스트 | 마크다운 입력 대비 HTML/AST 출력 고정 검증 | insta, Vitest snapshot |
| 통합 테스트 | 폴더 열기, 인덱싱, 검색, watcher 이벤트 흐름 검증 | Rust integration test, Playwright |
| 성능 하네스 | 대규모 vault에서 초기 스캔/검색/렌더 시간 측정 | criterion, custom benchmark |
| 회귀 하네스 | 실제 샘플 vault로 주요 기능 재검증 | sample corpus + scripted run |

### 2. 샘플 코퍼스 구성
테스트용 `fixtures/` 아래에 다음을 둔다.
- `small-vault/`: 20~50개 노트, 기본 링크/이미지/표 포함
- `medium-vault/`: 1,000개 수준 문서, 폴더 구조 다양화
- `korean-vault/`: 한글 제목, 조사 포함 검색, 영문 혼합 문서
- `edge-cases/`: 깨진 링크, 순환 링크, 긴 코드블록, 대용량 이미지, 특수문자 파일명
- `obsidian-like/`: 위키링크, callout, embeds, frontmatter 중심 샘플

### 3. 자동 검증 포인트
- 링크 클릭 시 올바른 파일로 이동하는가
- 같은 제목의 노트가 여러 개일 때 우선순위가 일관적인가
- 파일 rename/delete 시 트리와 인덱스가 즉시 갱신되는가
- 한글 검색이 초성 미지원이어도 토큰 검색 품질이 acceptable 한가
- 10MB 이상 마크다운 파일도 UI freeze 없이 열리는가
- 이미지 상대경로와 URL 인코딩 케이스가 깨지지 않는가
- 위험한 HTML이 렌더될 때 sanitize 되는가

### 4. 개발 명령 체계 예시
- `cargo test` : core 단위/통합 테스트
- `pnpm test` : UI 단위 테스트
- `pnpm playwright test` : E2E 시나리오
- `cargo bench` : 인덱싱/검색 성능 측정
- `pnpm tauri dev` : 로컬 앱 실행

## 디렉터리 제안
```text
app/
  src-tauri/
    src/
      main.rs
      commands/
      core/
        vault/
        watcher/
        parser/
        resolver/
        search/
        cache/
        settings/
    Cargo.toml
    tauri.conf.json
  src/
    app/
    components/
    features/
      sidebar/
      reader/
      search/
      outline/
    lib/
    styles/
  fixtures/
    small-vault/
    medium-vault/
    korean-vault/
    edge-cases/
  tests/
    e2e/
    snapshots/
```

## 구현 우선순위
### Phase 1: MVP
- 폴더 열기
- 파일 트리
- 읽기 전용 렌더링
- 위키링크 이동
- 기본 검색
- 다크모드

### Phase 2: 실사용 강화
- 파일 watcher 증분 갱신
- TOC 패널
- 백링크
- 최근 문서/히스토리
- 코드 하이라이트 품질 개선
- 대형 vault 최적화

### Phase 3: 완성도
- 첨부파일 미리보기 개선
- 문서 캐시/프리페치
- 파일 연결(`.md`) 옵션
- 고급 검색 문법
- 세션 복원

## 라이브러리 선택 팁
### Rust
- `notify`: 파일 감시
- `tantivy`: 검색 인덱스
- `serde`, `serde_json`, `toml`: 설정 직렬화
- `rayon` 또는 `tokio`: 병렬 처리/백그라운드 작업
- `ammonia` 또는 유사 계열: HTML sanitize

### Frontend
- `react-router`는 필수는 아니다. 단일 창 앱이라 전역 상태 + 패널 전환으로 충분할 수 있다.
- `zustand` 정도의 경량 상태 관리가 적절하다.
- `react-virtual` 또는 유사 라이브러리로 긴 파일 트리 성능을 보완한다.
- 코드 하이라이트는 SSR보다 클라이언트 렌더 일관성이 더 중요하다.

## 최종 권고
가장 균형이 좋은 선택은 **Tauri + Rust core + React/TypeScript UI + Tantivy 검색 + Notify watcher** 조합이다. 이 구성은 경량성, 윈도우 배포성, 마크다운 확장성, 그리고 향후 검색/그래프/백링크 기능 확장까지 모두 무난하게 수용한다.

처음부터 “옵시디언 대체제” 전체를 노리기보다, **읽기 경험이 빠르고 안정적인 viewer**를 먼저 완성하는 편이 훨씬 성공 확률이 높다. 특히 에디터를 빼면 구조가 단순해지므로, 인덱싱/렌더링/링크 해석의 품질에 집중하는 것이 제품 차별화에 더 직접적이다.
