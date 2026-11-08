# 릴리스 절차

맥과 윈도우는 `main` 하나에서 같은 버전 번호로 함께 출시합니다. 맥은 Apple Silicon만 지원합니다.

## 1. 버전 올리기

`X.Y.Z`를 새 버전으로 바꿔 실행합니다.

```bash
npm version X.Y.Z --no-git-tag-version
```

`src-tauri/tauri.conf.json`과 `src-tauri/Cargo.toml`의 `version`을 같은 값으로 고친 뒤 `Cargo.lock`을 갱신합니다.

```bash
cd src-tauri && cargo update -p heymark --offline
```

다섯 곳(`package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`)이 모두 같은 버전인지 확인하고 `main`에 올립니다. 맥·윈도우 CI가 통과해야 다음 단계로 넘어갑니다.

## 2. Draft 빌드

```bash
gh workflow run release.yml --ref main
```

GitHub Actions의 **Release** 워크플로를 웹에서 직접 실행해도 됩니다. [Releases](https://github.com/marushin/heymark/releases)에 Draft가 만들어지고 다음 파일이 올라갑니다. 이 시점에는 공개되지 않고 태그도 생기지 않습니다.

| 파일 | 대상 |
|---|---|
| `hey.mark._X.Y.Z_aarch64.dmg` | 맥 설치 파일 |
| `hey.mark._X.Y.Z_aarch64.app.tar.gz` | 맥 앱 압축본 |
| `hey.mark._X.Y.Z_x64-setup.exe` | 윈도우 설치 파일 |
| `heymark_X.Y.Z_portable.exe` | 윈도우 포터블 |

문제가 있으면 코드를 고쳐 `main`에 올리고 워크플로를 다시 실행합니다. 같은 Draft의 파일과 대상 커밋이 새 빌드로 바뀝니다.

## 3. 출시 전 점검

Draft의 파일을 받아 맥과 윈도우에서 각각 확인합니다. CI는 빌드와 자동 테스트만 검증하므로 실제 동작은 직접 봐야 합니다.

| 항목 | 맥 | 윈도우 |
|---|---|---|
| 앱이 설치되고 실행된다 | [ ] | [ ] |
| 포터블 exe가 실행된다 | 해당 없음 | [ ] |
| Settings에 표시되는 내용과 저장된 설정이 유지된다 | [ ] | [ ] |
| `.md` 파일을 더블클릭하면 앱에서 열린다 | [ ] | [ ] |
| 파일을 수정해 저장하고 다시 열면 내용이 유지된다 | [ ] | [ ] |
| 하단 상태가 초록색 `CONNECTED`로 표시된다 | [ ] | [ ] |
| 로컬 LLM: 문장을 선택해 Translate하면 결과가 반영된다 | [ ] | [ ] |
| 클라우드 AI: API 키가 있는 서비스 하나로 Translate가 동작한다 | [ ] | [ ] |

로컬 LLM은 LM Studio의 **Enable CORS를 끈 상태**로 확인합니다. AI 메뉴는 편집 모드(`Cmd/Ctrl+E`)에서 텍스트를 선택하면 나타납니다.

## 4. Publish

1. Draft의 **Edit**에서 릴리스 노트를 작성합니다.
2. **Set as the latest release**를 켭니다.
3. **Publish release**를 누릅니다. 이때 `vX.Y.Z` 태그가 Draft 빌드의 커밋에 만들어집니다.

## 참고

- **Tauri 패키지 버전:** npm 패키지와 Rust 크레이트의 major.minor가 다르면 `tauri build`가 실패합니다. CI의 `Check Tauri package versions` 단계에서 잡히며, 플러그인을 추가할 때는 `@tauri-apps/api` 버전이 함께 올라가지 않는지 확인합니다.
- **코드 서명:** 정식 서명이 없어 처음 실행할 때 OS 경고가 나올 수 있습니다. 맥은 시스템 설정 → 개인정보 보호 및 보안의 **그래도 열기**, 윈도우는 SmartScreen의 **추가 정보 → 실행**으로 엽니다.
- **OS별 코드:** 설정은 `tauri.<os>.conf.json`, Rust는 `#[cfg(target_os)]`에 둡니다. 프론트엔드 분기는 최소한으로 유지합니다.
- **로컬 빌드:** `build.sh`, `build.bat`, `dist_deploy.*`는 로컬 테스트용이며, 배포 파일은 Release 워크플로로 만듭니다.
