# Naver Blog Image Downloader 연구노트

최신 작업은 **2026-10-15 작업 턴 006**, 현재 확장 버전은 **0.4.0**입니다. Chrome 웹스토어용 소개·개인정보 문서·규격 이미지와 등록 절차·비용 안내를 준비했습니다. 실제 개발자 계정 등록·결제·심사 제출은 하지 않았습니다. 기존 GitHub 공개 배포와 버전 태그는 유지하며, 제출 전 조치와 검증은 턴 006을 확인합니다.

현재 요구사항은 **작업 턴 002**를 우선합니다. 자동 저장 기능은 제거하고 사용자가 누르는 다운로드만 실행하며, 품질은 w3840 우선으로 고정합니다. 작업 턴 001의 자동 실행·품질 선택 설명은 당시 구현의 이력입니다.

이 문서는 에이전트 교체 및 문맥 초기화 후 가장 먼저 읽는 작업 이력입니다. 과거 기록은 삭제하지 않고, 계획과 실제 검증 결과를 구분하여 기록합니다. 날짜 기준은 Asia/Seoul입니다.

## 프로젝트 목적

- 사용자가 제공한 https://github.com/hsofficial/nblog-img-downloder 코드를 조사하고 네이버 블로그 이미지 다운로드 로직을 크롬 확장프로그램으로 이식합니다.
- 네이버 블로그 개별 게시글에 접근하면 고해상도 이미지 다운로드를 자동 실행하고, GUI에서 이미지 확인·선택 다운로드·자동 다운로드 설정·진행 상태 확인을 지원합니다.
- 작업 폴더에 매 작업 턴의 요청, 조사 근거, 변경 파일, 검증, 미해결 사항을 연구노트로 남깁니다.

## 2026-10-15 / 작업 턴 006 / Chrome 웹스토어 등록 자료 준비

### 요청·시작 상태·계획

- 사용자는 Chrome 웹스토어에도 등록하고 싶다며 필요한 소개 문구·스크린샷을 준비하고 절차·난이도·비용을 안내해 달라고 요청했습니다. 이번 턴은 자료 준비와 안내이며, 개발자 계정 생성·결제·약관 동의·실제 심사 제출은 요청하지 않았습니다.
- 시작 버전 0.4.0, 공개 GitHub 저장소와 릴리스가 존재하며 직전 로직 테스트 64개 통과. 기존 screenshots는 420px 폭 팝업 캡처여서 웹스토어 제출 규격으로 새로 준비해야 합니다.
- Google 공식 등록·이미지·개인정보·심사 문서를 최신 확인하고 한국어 소개·권한 설명·심사 테스트 안내·개인정보 문서 초안과 규격 이미지를 로컬에 준비합니다. 실행 코드나 현재 배포 버전은 변경하지 않습니다.
- 주 에이전트는 현재 UI를 이용한 규격 이미지 생성과 통합 검증을 담당합니다. 서브에이전트는 현 소스에 근거한 등록 문구·권한 및 개인정보 안내 초안, 실제 심사 준비에서 빠진 사항 검토를 병렬로 담당합니다. 예시 사진과 모의 실행은 실제 사용 데이터/다운로드 증거로 표시하지 않습니다.

### 공식 조사와 판단

- Google의 개발자 등록 문서는 신규 계정 등록비가 일회성이라고 설명하며, 2026-04-30 게시자 역할 확대 글은 새 게시자에 **USD 5** 등록비가 필요함을 명시합니다. 확인일 2026-10-15, https://developer.chrome.com/docs/webstore/register 및 https://developer.chrome.com/blog/cws-role-expansion-developer-dashboard. 최종 원화 금액·결제 가능 수단·사용자의 기존 등록 여부는 확인하지 않았습니다.
- Google 이미지 안내(확인 2026-10-15, https://developer.chrome.com/docs/webstore/images?authuser=110): 스크린샷 1280×800 또는 640×400, 1~5장, 사각 외곽·외부 여백 없음, 작은 홍보 이미지 440×280, 선택 marquee 1400×560, 확장 아이콘 PNG 128×128. 이에 맞춘 자료를 생성했습니다.
- Google의 심사 안내는 일반적으로 수일에서 수주까지 변동 가능하다고 설명합니다(https://developer.chrome.com/docs/webstore/review-process). 2026-08-20 Kevin Bay의 공식 개선 발표(https://developer.chrome.com/blog/cws-review-updates-2026)도 확인했고, 개선 사실을 특정 승인 기한 보장으로 바꾸지 않았습니다. 계정 설정·2단계 인증·게시·개인정보 입력의 공식 링크는 store/README.md에 있습니다.
- explorer / Bacon이 실제 API 사용과 Google 과다 권한 지침을 읽기 전용으로 대조했습니다. 현재 activeTab은 기본 탭 ID 조회와 tabs.sendMessage에 필요하지 않은 중복 선언임을 확인했습니다. 근거: popup.js의 초기 tabs.query 및 재스캔 전송, manifest의 정적 대상 호스트, https://developer.chrome.com/docs/webstore/troubleshooting#excessive-permissions (Google, 확인 2026-10-15).
- 이번 요청은 등록 자료 준비이므로 배포된 0.4.0을 조용히 변경하지 않았습니다. `store/remove-unused-activeTab.patch`에 선언 제거의 검토용 변경을 준비하고 `git apply --check`를 통과했습니다. 실제 제출 전 새 버전 번호·패키지·회귀 검증으로 확정해야 하며, 현재 ZIP을 제출 준비 완료라고 표시하지 않습니다.
- 로컬 전용 처리를 데이터 처리 없음으로 잘못 공개하지 않습니다. Website content 및 대상 게시글 URL의 Web history 공개를 소스에 근거한 분류 권고로 작성했습니다. 최종 대시보드 정의·실제 후보와 대조해야 합니다. 네이버 사진 요청은 원격 코드 실행이 아니며 외부 통신이 없다는 주장도 하지 않습니다.
- N 아이콘·IU 팬 테마에는 독립 개발/비제휴 문구를 준비하고 브랜드 오인·사용 권한 검토를 남겼습니다. 심사 거절이나 침해를 확정한 것은 아닙니다. 전체 기능을 숨기지 않도록 제목 기반 테마 조건을 소개와 심사자 안내에 설명했습니다.

### 준비 파일과 검증

- worker / Carver는 `store/listing-ko.md`, `PRIVACY.md`만 작성했습니다. 이름·48자 짧은 설명은 실제 manifest와 일치합니다. 상세 소개·단일 목적·권한/호스트별 설명·원격 코드 미사용 근거·데이터 공개 권고·심사 테스트 순서, 기기의 세션/로컬 보관·작업 30개/로그 60개·전체 경로·외부 요청·삭제 범위·Limited Use·지원 창구를 작성했습니다. 부모가 실제 버튼 이름 및 공개 문서 문안을 정리했습니다.
- `store/README.md`는 준비물 매핑, 비용·난이도, 계정/2단계 인증/ZIP/등록정보/개인정보/배포/심사 순서와 제출 전 조치를 정리합니다. 루트 README에는 개인정보 문서와 준비 자료 링크를 추가하고 기존 activeTab 필요성 설명도 수정했습니다.
- `store/generate-assets.cjs`: 변하지 않은 0.4.0 HTML/CSS/JS를 Chrome에서 렌더링하고 모의 Chrome API·합성 풍경 6장·샘플 작업 상태로 이미지 자료를 생성합니다. 실제 파일 저장을 하지 않고 실제 블로그 사진이나 사용자 경로를 사용하지 않습니다. 각 이미지 하단에 실제 UI/샘플 데이터 예시 표시가 있습니다.
- 스크린샷 PNG 5장(선택·경로/진행·다크·IU·오픈소스) 모두 1280×800. 홍보 이미지 440×280, 1400×560, 현행 아이콘 사본 128×128도 포함합니다. 이미지 생성 도구에는 원격 페이지/사용자 Chrome 프로필을 조작하는 실행 경로가 없습니다.
- 초기 팝업 전체 페이지 캡처는 1100px 테스트 뷰포트의 빈 하단까지 포함하여 UI가 작게 보였습니다. 실제 body 요소 캡처로 조정하고 5장을 다시 생성했습니다. 최종 선택·다크·홍보 이미지와 앞선 각 기능 이미지를 직접 열어 레이아웃을 확인했습니다. 아이콘의 alpha>20 영역은 100×96px였으며 패키지 아이콘은 수정하지 않았습니다.
- `store/verify-assets.cjs`: 이미지 8개의 PNG 서명·실제 가로/세로·8비트 RGB(아이콘만 alpha 허용), 스크린샷 수, 문서 상대 링크를 검사하고 자산별 SHA-256 목록을 생성했습니다. 검사 통과. 생성 스크립트 pageerror 0개, JS 구문 검사 통과, 검토용 패치 적용 가능 검사 통과, extension/ 및 package.json의 Git diff 없음도 확인했습니다.
- 앱 실행 코드는 변경하지 않아 기존 로직 테스트를 이유 없이 반복하지 않았습니다. 직전 64개 통과 기록은 보존하며 이번 이미지 생성 검증을 네이티브 다운로드 성공으로 표현하지 않습니다. 사용자 보고의 정상 작동은 인정하지만 최종 제출 ZIP의 소량 실제 파일 저장/중지/복구 검증 기록은 별도로 필요합니다.
- 두 서브에이전트의 결과를 취합 후 종료했습니다. 개인정보 문서를 기존 공개 저장소에 반영해 사용할 URL을 준비하며 계정 가입·결제·약관 동의·웹스토어 업로드/제출은 실행하지 않습니다. 게시와 묶음 검증 결과는 아래에 덧붙입니다.

### 최종 준비 결과

- `0207344` 커밋으로 기존 공개 main에 문서·개인정보처리방침·규격 이미지·생성/검증 도구를 push했습니다. 안내: https://github.com/hsofficial/nblogdl-chrome/blob/main/store/README.md , 문안: 같은 저장소의 `store/listing-ko.md`, 정책: https://github.com/hsofficial/nblogdl-chrome/blob/main/PRIVACY.md . GitHub API에서 문서 존재를 확인했고 인증 헤더 없는 raw 정책 HTTP 요청도 **200**을 반환했습니다.
- 자료 묶음 `dist/nblogdl-chrome-webstore-kit-0.4.0.zip`: **2,405,598 bytes**, SHA-256 **`0F338E161D32ADD3225DEF34266A878A184B26B06D56A9DF44F7A5A73944EF0E`**. ZIP 16개 항목과 `PRIVACY.md`, `store/README.md`, 등록 문안·이미지 포함을 확인했습니다. 이 ZIP은 **등록 자료 묶음이며 확장 실행 패키지가 아닙니다**.
- `git diff v0.4.0 HEAD -- extension package.json`이 비어 있어 이미 배포한 앱·버전은 바뀌지 않았습니다. 현재 제출 전 남은 항목은 중복 activeTab 권한을 정리한 실제 제출 후보 확정/검증, 브랜드 표시 확인, 개발자 계정 소유자의 등록·연락처/2단계 인증·결제와 최종 폼 확인입니다. 실제 Chrome 웹스토어 등록·심사 제출·승인 상태는 만들어내지 않았습니다.
- 이 기록을 문서 후속 커밋으로 보존합니다. 실제 업로드를 진행할 다음 턴에는 준비 문서의 당시 최신 공식 요건과 실제 제출 패키지를 다시 대조해야 합니다.

## 2026-10-15 / 작업 턴 005 / 공개 GitHub 저장소·버전 이력 복원·배포

### 요청·시작 상태·계획

- 사용자가 hsofficial 계정의 공개 저장소 신규 생성, 배포, 0.1.0부터 순서대로 커밋하여 로컬 작업 이력을 보존하고 친절한 설치 README를 포함하도록 명시적으로 요청했습니다. 공개 업로드와 GitHub Release 생성은 이 요청의 승인 범위입니다.
- 시작 버전 0.4.0, 직전 64개 테스트 통과. 현재 폴더는 아직 Git 저장소가 아닙니다. GitHub 연결 도구가 인증 계정 hsofficial(ID 32590044)을 확인했습니다. 기존 Python 원본 저장소는 수정하지 않고 신규 이름 `nblogdl-chrome`을 우선 사용합니다.
- 보존된 배포 ZIP 0.1.0, 0.2.0, 0.2.1, 0.3.0, 0.4.0을 발견했습니다. 각 ZIP을 근거로 정확한 확장 소스 체크포인트를 순차 복원할 계획입니다. 원래 Git 커밋은 존재하지 않았으므로 과거 커밋 시각/중간 편집 상태를 꾸미지 않고, 현재 시각에 복원한 이력임을 공개 문서에 표시합니다.
- 주 에이전트는 저장소 준비·소스 복원·검증·게시를 담당합니다. 서브에이전트는 공개용 설치 README와 보존 ZIP의 버전/변경 근거 점검을 병렬로 담당합니다. 공개 대상은 소스·필요 문서·안전한 합성 스크린샷·배포 ZIP이며 로컬 프로필/토큰/임시 파일은 포함하지 않습니다.

### 게시 전 준비·검증

- GitHub 연결과 네트워크 접근이 가능한 gh CLI 모두 hsofficial(ID 32590044, 표시명 HyeonSu Na)을 확인했습니다. 기본 sandbox의 gh는 네트워크 제한 때문에 인증 실패처럼 표시했지만 확장된 네트워크에서 정상 계정을 확인했으므로 새 토큰 발급이나 재로그인을 하지 않았습니다. `hsofficial/nblogdl-chrome`은 조회 시 존재하지 않았습니다.
- 신규 로컬 `.git`을 만들고 작성자는 인증 계정의 이름과 GitHub noreply 주소를 이 저장소에만 설정했습니다. 전역 Git 사용자·safe.directory는 수정하지 않습니다. 이 파일시스템의 소유권 판단 때문에 각 명령에 해당 작업 폴더의 safe.directory만 명시합니다. `.git` 쓰기는 요청 범위의 로컬 커밋 작업으로 실행 권한을 받아 수행했습니다.
- explorer / Peirce가 5개 ZIP의 manifest·파일 수·크기·SHA-256과 버전별 변경 파일을 독립 점검했습니다. 0.4.0의 실제 확장 21개 파일은 ZIP과 모두 같고 추가/누락도 없습니다. 이전 버전별 테스트·README 사본은 발견되지 않았으므로 현재 테스트를 과거 파일처럼 넣지 않습니다.
- `.release-work/`의 임시 복원 도구로 현재 작업 폴더를 덮어쓰지 않고 별도의 새 스냅샷 폴더에서 0.1.0 → 0.2.0 → 0.2.1 → 0.3.0 커밋과 태그를 생성했습니다. Git 객체의 각 extension 파일 blob을 원본 파일의 필터 없는 hash-object와 비교했습니다. 각 복원본 JavaScript 구문도 검사했습니다.
- 첫 커밋 후 임시 복원 도구의 `[IO.Path]::GetRelativePath` 호출이 Windows PowerShell 5.1에서 지원되지 않아 검증이 중단되었습니다. 루트 내부 파일의 상대 경로를 Substring으로 구하는 방식으로 수정했습니다. 이미 만든 첫 커밋은 다시 쓰지 않았고 해당 소스 검증과 태그부터 재개했습니다. 나머지 체크포인트도 정상 검증했습니다.
- worker / Kuhn이 `README.md`만 편집하여 설치용 ZIP과 Source code ZIP의 폴더 차이, Chrome 개발자 모드 설치·고정·탭 새로고침, 사용법·저장 경로·업데이트/삭제·문제 해결·권한·개인정보·라이선스·이력 복원 설명을 작성했습니다. 주 에이전트가 manifest와 실행 소스에 대조했습니다. Google의 공식 설치 안내도 확인했습니다(2026-10-15, https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).
- `HISTORY.md`에 보존 ZIP의 5개 SHA-256과 복원 범위·불가능한 중간 편집 이력, 현재 시각 커밋 원칙을 기록하고 `CHANGELOG.md`에 버전별 변경을 정리했습니다. 루트 GPL 전문과 합성 팝업 라이트/다크 이미지 2개도 추가했습니다. 제품 참고 사진과 임시 작업·다운로드·아티팩트는 Git 제외 대상입니다.
- 확장 실행 코드는 이번 턴에서 변경하지 않았습니다. 다시 실행한 `npm test`: **64개 통과, 실패 0개**. 최신 설치 ZIP은 기존 검증된 64,008 bytes / SHA-256 `F6B045ED507420CC6619049CF1F1A6C08ED9A6630EF398A91D466A4CCE711DBE`를 사용하며 체크섬 파일도 준비했습니다.
- 이 단계에서 원격 저장소 생성·push·Release 게시 결과는 아직 미확정이며, 실제 반환 결과와 원격 대조 후 아래에 추가합니다.

### 최종 게시 결과·원격 검증

- `gh repo create hsofficial/nblogdl-chrome --public` 및 main/태그 push 완료. 저장소: **https://github.com/hsofficial/nblogdl-chrome**. 원격 조회는 `visibility: PUBLIC`, `isPrivate: false`, 기본 브랜치 main, 루트 라이선스 GNU GPLv3를 반환했습니다. 원본 `hsofficial/nblog-img-downloder`는 수정하지 않았습니다.
- 복원 커밋과 주제: `7b2e7f0` v0.1.0 초기 다운로더 → `aa7ae43` v0.2.0 수동·폴더·아이콘 → `1dd411a` v0.2.1 스티커 제외 → `1a42fc1` v0.3.0 출처·IU 테마 → `f555d3d` v0.4.0 화면 모드·현재 개발 자료·공개 문서. 각 태그 v0.1.0, v0.2.0, v0.2.1, v0.3.0, v0.4.0이 동일 커밋을 가리키는 것을 `git ls-remote`로 대조했습니다. 작성 시각은 모두 실제 복원 시각입니다.
- 모든 extension 소스의 Git blob이 대응 체크포인트 ZIP 파일의 원본 바이트와 같은 것을 확인했습니다. 공개 대상 스테이징에는 흔한 토큰/개인 키 서명이 없음을 검사했으며, 임시 복원 도구·로컬 다운로드·제품 참고 사진은 포함하지 않았습니다. 유일한 공개 화면 이미지는 합성 팝업 라이트/다크 캡처입니다.
- `gh release create v0.4.0 ... --verify-tag --latest` 완료. 공개 주소: **https://github.com/hsofficial/nblogdl-chrome/releases/tag/v0.4.0**. 원격에서 `isDraft: false`, `isPrerelease: false`와 첨부 파일 2개를 확인했습니다.
- 설치 파일: https://github.com/hsofficial/nblogdl-chrome/releases/download/v0.4.0/nblogdl-chrome-0.4.0.zip (64,008 bytes). 체크섬: 같은 릴리스의 `SHA256SUMS.txt` (92 bytes). 원격 asset digest도 `sha256:f6b045ed507420cc6619049cf1f1a6c08ed9a6630ef398a91d466a4cce711dbe`로 일치합니다.
- `gh release download`로 공개 릴리스의 실제 ZIP을 `.release-work/download-check/`에 다시 내려받았습니다. 원격 ZIP SHA-256과 기존 로컬 0.4.0 ZIP SHA-256이 일치합니다. 설치 README는 최신 릴리스 다운로드 링크·Source code ZIP의 `extension/` 선택 차이를 설명합니다.
- 앱 실행 변경은 없으며 이번 턴의 로직 테스트 64개 통과를 재확인했습니다. Chrome 웹 스토어에 등록한 것은 아니며 README와 릴리스에도 GitHub ZIP/압축해제 설치 방식임을 표시했습니다. 네이티브 다운로드 검증의 기존 한계는 이전 턴을 유지합니다.
- 서브에이전트 2명을 취합 후 종료했습니다. 게시 결과 연구노트 변경은 후속 문서 커밋으로 보존하며 v0.4.0 태그의 프로그램 소스는 다시 쓰지 않습니다. 다음 에이전트는 이 기록을 먼저 읽고 공개 Git 저장소의 다음 커밋으로 작업을 이어갑니다.

## 2026-10-15 / 작업 턴 004 / 응원봉 보정·아이콘 링크·화면 모드

### 요청·시작 상태·계획

- 사용자 요청: IU LIGHT 장식 문구 제거, 응원봉 하트 안에 IU가 보이도록 도형 수정, GitHub 영문 버튼을 아이콘 링크로 교체, 다크모드와 라이트/다크 선택 UI 추가 및 기본값은 시스템 설정 따르기.
- 시작 버전 0.3.0, 직전 로직 테스트 55개와 합성 GUI smoke 통과. 스티커 제외·수동 다운로드·w3840 우선 등 기존 동작을 유지합니다.
- 화면 모드는 시스템/라이트/다크 세 선택으로 구현하여 기본 자동 동작과 명시적인 사용자 선택을 모두 제공합니다. 다운로드 설정과 별도 저장 키를 사용하고 팝업·로컬 안내 페이지가 같은 선택을 공유하도록 합니다. 운영체제 색상 변경도 시스템 모드일 때 반영할 계획입니다.
- 주 에이전트는 공통 모드 처리·팝업·로컬 SVG 및 검증을 담당합니다. 서브에이전트는 안내 페이지의 다크 팔레트·동일 선택 UI·프로필 아이콘을 담당합니다. 완료 결과는 아래에 덧붙입니다.

### 구현·조사 기록

- `extension/popup.html`, `popup.css`, `iu-lightstick.svg`: IU LIGHT 텍스트와 관련 스타일을 제거하고 하트 내부를 별도의 I 세로획과 U 곡선으로 다시 그렸습니다. 문구는 유지하고 응원봉 표시 크기를 62×94px로 조정했습니다. 헤더는 34px 정사각 아이콘 링크와 버전만 표시합니다. 링크에는 한국어 접근성 이름과 툴팁을 부여했습니다.
- `extension/theme.js`, `theme-controls.css`: 공통 화면 모드 처리와 세 선택 버튼을 추가했습니다. 기본값은 `system`, 실제 적용색은 `matchMedia('(prefers-color-scheme: dark)')`로 정합니다. `change` 이벤트를 구독하여 시스템 모드에서만 운영체제 색상 변경을 따릅니다. 수동 선택은 `chrome.storage.local`의 **uiColorMode**에 저장하고 다운로드의 `state` 키와 분리합니다. 열린 페이지는 local 저장 변경을 구독합니다.
- 최초 저장값 읽기가 늦게 끝나도 새로운 클릭/저장 이벤트를 덮어쓰지 않도록 revision을 확인합니다. 빠른 연속 클릭은 쓰기 순서를 직렬화하며, 저장 오류는 화면 상태 메시지와 ASCII 오류 코드로 표시합니다. 비허용 저장값은 system으로 해석합니다. 화면 모드와 제목 기반 IU 팔레트는 독립적으로 적용합니다.
- `popup.css`: 기본·IU 각각 라이트/다크 팔레트를 작성하여 헤더, 배경, 카드, 체크박스, 버튼, 입력, 진행 로그, 경로와 오류 텍스트를 처리했습니다. 다크 IU 배너는 빛을 줄인 라임·보라 배경을 사용합니다.
- worker / Plato는 소유 파일 `about.html`, `about.css`만 수정했습니다. 동일 선택 UI·공통 스크립트 연결, 기본/IU 다크 팔레트, 카드·라이선스 전문·초점·모바일 대응, 프로필 아이콘과 동봉 Octicons 크레딧을 추가했습니다. 주 에이전트가 결과와 화면을 취합하고 종료했습니다.
- 프로필 그림은 GitHub Inc.의 공식 Primer Octicons `mark-github-16.svg`를 `icons/github.svg`로 동봉했습니다. 라이선스 전문은 `icons/OCTICONS-LICENSE.txt`입니다. 파일 blob **0e55a8ef2db1913cb35f81ae09ffdb58b5422319**, 라이선스 blob **aa1fa80ed83cf856fb31c22ba56557c42ca84488**. 공식 출처: GitHub Inc., 2026-10-15 확인, https://github.com/primer/octicons/blob/main/icons/mark-github-16.svg 및 https://github.com/primer/octicons/blob/main/LICENSE. PowerShell 네트워크 요청은 DNS 제한으로 실패했고, GitHub 연결 도구의 파일 읽기로 실제 SVG·MIT 전문을 확보했습니다. 라이브러리 실행 코드는 가져오지 않았습니다.
- 최초 CSS mask 방식은 file:// GUI 캡처에서 아이콘이 비어 보였습니다. 시각 검증에서 발견하여 로컬 SVG의 일반 img 로딩으로 수정하고, 팝업 다크/안내 페이지 버튼 색상에 맞게 invert를 적용했습니다. 아이콘 자연 크기와 최종 화면을 다시 확인했습니다.
- API 근거: Google, 확인 2026-10-15, https://developer.chrome.com/docs/extensions/reference/api/storage (로컬 저장과 onChanged). MDN 기여자, 확인 2026-10-15, https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/change_event (색상 미디어 질의 변경 이벤트). 연구노트는 구현의 로컬 증거와 외부 API 근거를 구분합니다.

### 검증 결과

- worker / Franklin이 `tests/theme.test.cjs`만 새로 작성했습니다. 의존성 없는 VM 테스트 9개는 시스템 초기/변경, 수동 저장, 잘못된 값, 느린 초기 읽기 경쟁, 페이지 간 변경 이벤트, 연속 저장 순서, 실패 상태·ASCII 로그를 검증합니다. 해당 파일 9개 모두 통과 후 주 에이전트가 전체 테스트와 함께 실행했습니다. 결과 취합 후 종료했습니다.
- `npm test`: 최상위 **51개** + 하위 사례 **13개** = **총 64개 통과, 실패 0개**. 모든 `extension/*.js`의 `node --check` 통과.
- `npm run smoke`: 최종 종료 코드 0. 기존 저장 경로 전달/유효성 검사·37사진 회귀·제목의 HTML 비실행 검증을 유지했습니다. 기본 시스템 선택, 에뮬레이트한 시스템 다크 전환과 다시 라이트 전환, 강제 라이트 우선, 새로고침 후 선택 보존을 확인했습니다. 이는 OS 설정 자체를 변경한 검증이 아니라 브라우저 미디어 질의 에뮬레이션입니다.
- 팝업에서 저장한 다크 선택이 이미 열린 안내 페이지에 반영되고, 안내 페이지의 라이트 선택이 팝업에 반영됨을 확인했습니다. IU 팔레트와 다크모드가 함께 동작하며 일반 글로 바뀌어도 화면 모드는 유지됩니다. GitHub 버튼의 텍스트 없음·href·아이콘 로드를 검증했습니다. IU LIGHT가 배너에 없고 요청 문구는 남아 있는 것을 확인했습니다.
- 안내 페이지의 기존 GPL 전문 전체 일치/펼치기·4개 프로젝트 카드·버전·허용된 IU 쿼리·390px 가로 넘침 없음을 확인했습니다. Chrome runtime과 확장 저장소는 GUI smoke에서 모의했고, 로컬 HTML/CSS/SVG와 실제 브라우저 DOM 렌더링을 사용했습니다. Chrome에 설치한 확장의 네이티브 다운로드 검증으로 해석하지 않습니다.
- 캡처: `artifacts/iu-theme-preview.png`, `iu-theme-dark-preview.png`, `popup-dark-preview.png`, `about-iu-dark-preview.png`, `about-dark-preview.png`. 최종 팝업의 라이트/다크를 직접 열어 응원봉·아이콘·선택 UI·경로·본문·배너가 표시되는 것을 확인했습니다. 미리보기 썸네일은 합성 풍경입니다.
- `README.md`와 `extension/NOTICE.txt`, manifest/package 버전을 0.4.0으로 갱신했습니다. 기존 버전 ZIP과 과거 기록은 보존합니다. 최종 패키지 정보는 아래에 추가합니다.

### 최종 패키지·적용

- `npm run package` 및 ZIP 바이트 대조 검증 종료 코드 0. 최종 `dist/nblogdl-chrome-0.4.0.zip`은 **64,008 bytes**, SHA-256 **`F6B045ED507420CC6619049CF1F1A6C08ED9A6630EF398A91D466A4CCE711DBE`**입니다.
- ZIP 21개 항목의 모든 파일이 현재 확장 소스와 해시가 같으며 공통 테마 JS/CSS·GitHub SVG·MIT 전문·안내 페이지·응원봉 SVG·GPL 전문 포함을 확인했습니다.
- 기존 확장과 블로그 탭을 새로고침하여 적용합니다. 별도 선택 기록이 없는 설치는 시스템 모드이며 사용자가 라이트/다크를 선택하면 다음 실행에도 유지합니다. 시스템 선택으로 되돌리면 자동 추종을 다시 사용합니다.
- 담당 서브에이전트 2명의 결과를 취합하고 종료했습니다. 사용자 Chrome 프로필의 OS 설정이나 확장 설치 상태는 변경하지 않았습니다. 다음 에이전트는 본 기록부터 읽고 새로운 턴을 추가해야 합니다.

## 2026-10-14 / 작업 턴 001 / 초기 조사 및 구현

### 사용자 요청

기존 GitHub 프로젝트를 바탕으로 Chrome에서 사용할 GUI 확장프로그램을 개발하고, 매 턴 상세 작업 이력을 Markdown에 기록하며 후속 에이전트가 이를 먼저 읽도록 설정해 달라는 요청입니다.

### 시작 상태와 확인된 사실

- 작업 경로: `D:\codexproj\nblogdl-chrome`.
- `rg --files`는 파일을 반환하지 않았고 `git status --short`는 Git 저장소가 아니라고 반환했습니다. 이 시점에 기존 구현 파일은 발견되지 않았습니다.
- 제공된 GitHub URL을 웹 도구로 열었으나 `Cache miss`로 본문을 가져오지 못했습니다. 저장소의 구현 내용 및 라이선스는 아직 확인되지 않았습니다.
- `ponytail` 스킬을 읽었습니다. 기본 방향은 빌드 단계 없이 Chrome의 기본 API와 JavaScript로 구현하는 것입니다.

### 구현 전 가정 및 조사 계획

- '접근하면 자동'은 개별 게시글을 열었을 때 자동 다운로드한다는 의미로 해석합니다. 목록 페이지에서 모든 게시글을 수집하는 기능은 현재 요청 범위에 포함하지 않습니다.
- 같은 게시글을 새로고침할 때마다 반복 저장하지 않도록 자동 다운로드 이력을 남기는 방향을 검토합니다.
- 고해상도 후보 URL은 원본 저장소의 실제 로직 및 네이버 이미지 URL을 확인한 후 결정합니다. URL 변환만으로 실제 원본 해상도 확보가 보장된다고 단정하지 않습니다.
- Manifest V3, 팝업 GUI, 게시글 본문 이미지 추출, Chrome 다운로드 API, 자동 다운로드 옵션을 검토합니다.

### 현재 변경

- `AGENTS.md`: 작업 전에 이 문서를 먼저 읽고 매 턴 이력을 보완하도록 지침을 작성했습니다.
- `RESEARCH_NOTES.md`: 프로젝트 목표, 초기 상태, 조사 실패와 구현 가정을 기록했습니다.

### 검증 및 완료 상태

진행 중입니다. 구현 및 최종 검증 결과는 같은 턴의 후속 기록에 추가합니다.

### 추가 사용자 지시 (구현 진행 중 수신)

- 제공한 저장소 외에 더 나은 도구나 코드도 참고할 수 있습니다.
- 사전에 구성된 서브에이전트 역할을 적극 사용하도록 요청했습니다.
- 즉시 수행할 핵심 작업은 주 에이전트가 다운로드 큐와 GUI를 구현하는 것입니다. 병렬 작업은 본문 추출 구현, 대안 조사, 후속 QA/코드 리뷰로 분리하고 각 변경 파일의 소유권을 구분합니다.

### 원본 조사 후 확인

- 로컬 `git clone`은 `Could not resolve host: github.com`으로 실패했습니다. GitHub 연결 도구로 원본 파일을 읽었고 `upstream/`에 참조용 사본을 보존했습니다.
- 조사한 기본 브랜치: `main`; 조사 시 최신 커밋: `0ebe1f83a9f6c8ae9cdbf72485f734c7472451bf` (HyeonSu Na, 2026-04-27).
- Selenium 버전은 `mainFrame`, 이미지 링크 `data-linkdata`, 뷰어 네트워크 응답 분석을 사용합니다. requests 버전은 `data-linkdata`를 읽고 `?type=w3840`로 변환합니다.
- 원본의 `LICENSE`는 GNU GPL version 3 전문이며 사본을 `extension/LICENSE`에도 보존했습니다.
- 출처: hsofficial, 확인일 2026-10-14, https://github.com/hsofficial/nblog-img-downloder 및 그 저장소의 두 Python 파일.
- Chrome 공식 문서 확인: downloads API는 다운로드 시작과 실제 완료를 구분하며 서비스 워커의 전역 상태는 종료 후 보존되지 않습니다. 큐 및 완료 이력은 저장소에 보존하는 설계를 적용합니다. Google, 확인일 2026-10-14, https://developer.chrome.com/docs/extensions/reference/api/downloads 및 https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle.

### 서브에이전트 분담 및 대안 조사

사용자가 서브에이전트 활용을 명시적으로 승인했고 컨텍스트에 등록된 역할을 사용했습니다. 모델을 별도로 지정하지 않았습니다. 공용 연구노트는 주 에이전트가 취합하여 동시 편집 충돌을 피합니다.

| 역할 / 에이전트 | 소유 파일 또는 질문 | 결과 |
| --- | --- | --- |
| worker / Anscombe | `extension/core.js`, `extension/content.js`, `tests/core.test.cjs` | 게시글 식별, 이미지 수집, URL/파일명 처리, 스캔 및 기본 테스트 작성 완료 |
| explorer / Noether | 다른 Naver Blog 추출기와 MV3 접근 비교 (읽기 전용) | gallery-dl 및 Playwright 기반 구현, 기존 스토어 확장과 Chrome 공식 API 문서 조사 완료 |
| qa-expert / Archimedes | `tests/background.test.cjs` | 다운로드 상태/재시작/취소/입력 검증 테스트 작성; 선택 ID 검증 결함 발견 |
| code-reviewer / Euclid | 큐, 프레임, GUI, 권한 및 수명주기 읽기 전용 리뷰 | 결과 통합 중 |

추가 비교의 근거 (확인일 2026-10-14):

- Mike Fährmann 및 gallery-dl 기여자, https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/naverblog.py : `data-lazy-src`, 호스트 교체 및 쿼리 제거를 사용하는 코드. 원본 후보 우선 접근의 참고 근거이며 코드를 복사하거나 의존성을 추가하지 않았습니다. 호스트 교체에 실제 해상도 이점이 있는지는 확인하지 못해 채택하지 않았습니다.
- leoho0722, https://github.com/leoho0722/naver-blog-image-downloader/blob/main/apps/backend/src/routes/photos.py : Playwright로 `mainFrame` 및 lazy 이미지 주소를 읽고 `w3840`을 사용하는 구현. 본 프로젝트의 확장 실행에 별도 서버/Playwright 런타임은 추가하지 않았습니다.
- One-Click Image Downloader, Chrome Web Store, 표시 개발자 이메일 `hanjm0211@gmail.com`, 표시 업데이트 2025-12-10, https://chromewebstore.google.com/detail/one-click-image-downloade/eldfifpmkngfgflhemangmljjmdkadek : 기능 설명은 조사했으나 공개 구현 코드는 확보하지 못했습니다. 고해상도 전략과 성능은 확인할 수 없습니다.
- Google, https://developer.chrome.com/docs/extensions/reference/api/webRequest 및 https://developer.chrome.com/docs/extensions/reference/api/debugger : 뷰어 클릭+네트워크 분석은 추가 권한/세션 관리가 필요합니다. 현재 요청에 충분한 DOM 추출을 우선하고 이 권한은 요청하지 않습니다.

### 채택한 구현 및 변경 파일

- `extension/manifest.json`: Manifest V3, Chrome 120 이상, 네이버 블로그 두 호스트 및 일치하는 모든 프레임에 정적 content script 실행. 권한은 `storage`, `downloads`, `alarms`, `activeTab`입니다.
- `extension/core.js`: 모호하지 않은 개별 게시글 식별, `.se-main-container`/`#postViewArea`/`.post_ct` 본문 추출, `data-linkdata`/lazy 주소 처리, 프로필·댓글 제외, 이미지 중복 병합, Windows 안전 파일명 및 상대 저장 경로 검증.
- URL 전략: `type`만 제거한 원본 후보와 `type=w3840` 후보를 생성합니다. 다른 쿼리의 바이트 표기와 순서를 보존합니다. 원본 우선이 기본이며 GUI에서 w3840 우선으로 바꿀 수 있습니다.
- `extension/content.js`: 초기 스캔, DOM 및 lazy 속성 관찰, 800ms 디바운스 및 연속 변경 시 최대 3초 대기, SPA URL 확인, 동일 스캔 중복 억제, 설정 변경/수동 다시 찾기 재전송, 무효화된 확장 문맥 정리.
- `extension/background.js`: 로컬 저장소 큐, 전역 동시 다운로드 3개, 실제 완료 및 이미지 MIME 확인, 서버/네트워크 실패 후보 전환, 사용자 취소 및 파일 오류 재시도 제외, alarm 기반 복구, 시작 ID 저장 전후 경쟁 처리, 자동 완료 이력 및 진행 배지. 저장 이력 최근 2,000개/완료 작업 30개/로그 60개 보관.
- 자동 저장은 사용자 요청의 '접근하면 자동'을 반영하여 기본값 `true`입니다. 스위치는 다음 자동 실행을 바꾸며 진행 중인 작업은 별도 중지 버튼으로 멈춥니다.
- `extension/popup.html`, `popup.css`, `popup.js`: 한국어 팝업 GUI, 이미지 미리보기와 선택, 진행 카드, 설정, 이력 초기화 및 ASCII 진단 로그. 페이지 제목은 `textContent`로 표시해 HTML을 실행하지 않습니다.
- `extension/LICENSE`, `NOTICE.txt`: 원본 라이선스 전문, 출처와 이식/변경 내역, 압축본 설치 방법 포함.
- `README.md`: 설치, 사용, 자동 실행 기본값, 해상도 및 검증 한계, 구조와 출처 설명.
- `package.json`, `scripts/package.ps1`: 실행 의존성 없는 테스트/ZIP 명령. `scripts/browser-smoke.cjs`는 개발 검증용으로만 선택적인 Playwright를 사용합니다.
- `AGENTS.md`, `RESEARCH_NOTES.md`: 에이전트 교체 시 우선 읽기/매 턴 이력 규칙.

### 중간 검증 및 수정 근거

- 초기 `node --check`는 `background.js`, `popup.js` 구문 오류 없이 종료했습니다.
- worker의 core/content 테스트 12개가 통과했습니다.
- 주 에이전트의 브라우저 smoke: 설치된 Chrome 154.0.8037.98을 별도의 headless 세션으로 실행했습니다. 실제 DOM으로 SmartEditor 메타데이터, lazy 주소, 중복 제거, 댓글/프로필 제외, 구형 본문 추출을 검증했습니다. GUI 전체/개별 선택, 요청 ID 수, 자동 설정 저장, 악성 제목을 텍스트로 표시, 빈 상태와 렌더링을 확인했습니다. `artifacts/popup-preview.png`, `artifacts/popup-empty.png`는 합성 미리보기 이미지로 만든 GUI 검증 캡처입니다.
- 위 smoke는 Chrome API를 모의했고 네이버/CDN 이미지 요청도 합성 응답으로 대체했습니다. 확장프로그램을 Chrome에 설치하여 실제 네이버 파일을 다운로드한 검증으로 해석하면 안 됩니다.
- QA 테스트에서 현재 스캔에 없는 선택 ID 및 비문자열 ID를 성공 응답으로 조용히 무시하는 문제가 발견되었습니다. 요청 ID를 현재 목록과 모두 비교하여 하나라도 잘못된 경우 전체 거부하도록 수정했습니다.
- 중지한 자동 작업이 같은 문서의 DOM 변경 때문에 다시 시작될 수 있는 문제를 보강했습니다. 동일 문서의 실패/중지/완료 작업은 자동 재등록하지 않습니다.
- `SITE_CLEAR`를 추가했습니다. SPA에서 본문이 사라지면 저장된 스캔의 문서·프레임이 발신자와 일치할 때만 제거하므로 부모 wrapper가 자식 본문 미리보기를 지우지 않습니다.
- Node 기본 spec 출력에 비ASCII 체크 기호가 포함되어 프로젝트 test 명령을 `--test-reporter=tap`으로 변경했습니다. 직접 작성한 런타임 로그는 ASCII만 출력합니다.

### 실환경 검증 범위의 한계

- 로컬 shell 네트워크는 GitHub DNS 확인이 실패했고, Playwright에 필요한 별도 Chromium 실행파일은 설치되어 있지 않습니다.
- 설치된 Chrome/Edge의 자동 확장 side-load 플래그가 제거되어 설치된 Chrome에 단순 실행 인자로 확장을 로드한 통합 테스트를 완료했다고 주장할 수 없습니다. Microsoft Playwright, 확인일 2026-10-14, https://playwright.dev/docs/chrome-extensions.
- 실제 네이버의 현재 DOM 및 저장된 파일 픽셀 크기를 아직 비교하지 않았습니다. 팝업 크기는 게시글 메타데이터/DOM 표시 크기입니다. 실제 최적 원본이나 항상 3840px 확보는 보장하지 않습니다.
- Chrome이 이미지가 아닌 응답을 저장한 뒤 MIME 검증에서 실패하면 오류로 기록하고 그 파일을 자동 삭제하지 않습니다.
- ZIP 생성 및 최종 테스트/리뷰 결과는 다음 후속 기록에 추가합니다.

### 최종 검증 기록 (리뷰 후속 결과 취합 전)

- `npm test`: TAP 집계 기준 core/content 12개 + background 21개 = **총 33개 통과, 실패 0개**. 최상위 테스트 제목은 26개이며 일부 background 테스트의 하위 사례 7개가 합산되어 33개입니다.
- background 테스트의 21개에는 사용자 취소/디스크 오류 재시도 제외, 비이미지 MIME 처리, 동시 스캔 중복 방지, 선택 ID 전체 검증, 동시 다운로드 상한 3개, 큐 취소, 같은 문서 중지 후 재자동실행 방지, `SITE_CLEAR` 문서/프레임 소유권, 재시작 시 확장 ID 일치 다운로드만 복구, 설정 영속화가 포함됩니다.
- `node scripts/browser-smoke.cjs`: 종료 코드 0. 별도 Chrome headless 실행에서 GUI 선택/설정 및 실제 DOM fixture 검증 통과. 폴더 초안이 `../invalid-draft`이어도 자동 스위치만 마지막 유효 설정에 적용되고 폴더 초안을 보존하는 사례를 추가하여 통과했습니다.
- 모든 확장 JS를 `node --check`로 검사했고 manifest가 참조하는 실행 파일이 존재하는지 검사했습니다. 모두 통과했습니다.
- 추가 보강: 큐 복구 alarm을 다운로드 시작 **전**에 설정하여 Chrome 다운로드 ID 저장 전 워커가 종료되어도 복구 알람이 남도록 했습니다.
- `npm run package`: 종료 코드 0, `dist/nblogdl-chrome-0.1.0.zip` 생성. ZIP 안에 manifest, core/content/background, popup HTML/CSS/JS, LICENSE, NOTICE가 포함되는 것을 확인했습니다. 압축을 풀면 manifest가 최상위에 있으므로 해당 폴더를 바로 로드할 수 있습니다.
- 위 시점 ZIP 크기: 31,176 bytes. SHA-256: `E03BCBBEA8033E5DC8959AF21D39FA4D4083FD627B0B13676BDBED86B90D7197`. 이후 구현 변경 시 `npm run package`를 재실행하고 해시도 다시 기록해야 합니다.
- 실행 로그와 테스트 reporter는 ASCII만 출력하도록 구성했습니다. 원본 참고 사본과 한국어 UI/문서는 이 제한의 대상이 아닙니다.

### 후속 에이전트의 시작점

1. 이 문서 및 `AGENTS.md`를 읽고 다음 작업 턴을 추가합니다.
2. 현재 코드는 빌드 없이 `extension/`을 Chrome 개발자 모드에서 로드하는 구현입니다. 설치/운영에 Python/서버/Node.js가 필요하지 않습니다.
3. 실제 네이버 게시글 검증 시 게시글 URL, 프레임 주소, 이미지 추출 수, Chrome 완료 상태, 저장 파일 MIME·픽셀 크기를 근거로 기록합니다. 자동 저장 기본값이 켜져 있으므로 검증 시 이를 고려합니다.
4. 새 네이버 본문 구조에서 누락된다면 `core.js` 선택자와 metadata fallback을 먼저 확인하고 재현 가능한 fixture를 추가합니다. 원본 뷰어+네트워크 분석 이식은 실제 원본 후보 실패의 증거가 있을 때 검토합니다.
5. 코드 수정 후 `npm test` 및 필요한 smoke를 실행하고 ZIP을 재생성합니다. 이미 설치한 확장은 `chrome://extensions`에서 다시 로드한 뒤 기존 게시글을 새로고침합니다.

### 최종 코드 리뷰에 따른 추가 수정 (앞선 압축본 이후)

Euclid의 읽기 전용 리뷰에서 다음 3개 사례가 확인되어 패키징 전 보강했습니다. 이전 기록의 ZIP 해시는 이 변경 전 산출물에 해당하므로 최종 해시를 후속 기록으로 갱신합니다.

1. **다운로드 시작과 보조 API 실패의 구분**: 기존 `pump()`의 `try` 범위에 상태 저장과 다운로드 조회가 포함되어, 다운로드는 정상 시작했지만 조회만 실패해도 ID를 버리고 다른 후보를 시작할 수 있었습니다. `downloads.download()` 실패 처리와 시작 이후 저장/조회 오류 처리를 분리했습니다. 시작 후 보조 오류는 ID와 진행 상태를 유지하고 복구 알람에 맡깁니다.
2. **취소와 완료의 경합**: 기존 중지 처리는 먼저 취소로 집계해 이미 저장된 파일의 완료를 놓칠 수 있었습니다. `canceling` 상태와 `cancelRequested`를 저장한 뒤 native cancel 및 최종 다운로드 상태를 확인합니다. 실제 이미지 완료면 완료 이력을 남기고, 실제 중단이면 취소로 확정합니다. 재시작 시에도 취소 의도를 복구합니다.
3. **HTML 오류 파일의 정리**: 이전 설계의 '비이미지 파일은 자동 삭제하지 않음'을 제한적으로 변경했습니다. HTML/JSON/plain text/XML의 명확한 비이미지 MIME이며 `byExtensionId`가 본 확장과 일치하는 다운로드만 `downloads.removeFile(id)`로 정리한 뒤 fallback을 진행합니다. `conflictAction: uniquify`로 기존 사용자 파일을 덮어쓰지 않습니다. 파일 정리 실패, MIME 없음 또는 octet-stream이면 자동 삭제/추가 후보 저장을 하지 않고 실패 상태를 표시합니다.

위 수정은 리뷰에서 제안한 정확한 Chrome 다운로드 API 동작과 일치시키기 위한 조치입니다. 확장 전체가 생성하지 않은 임의 파일을 삭제하는 기능은 없습니다. API 근거: Google, 확인일 2026-10-14, https://developer.chrome.com/docs/extensions/reference/api/downloads.

QA 에이전트 Archimedes를 재개하여 위 경쟁 상태의 회귀 테스트를 추가하도록 요청했습니다. 최종 테스트 숫자와 ZIP 해시는 이 후속 작업이 끝난 후 기록합니다.

### 작업 턴 001 최종 결과

- QA 회귀 사례 추가 후 `npm test` 종료 코드 0: core/content **12개** + background **33개** = **45개 통과, 실패 0개**. TAP의 최상위 테스트 32개와 하위 사례 13개를 합산한 집계입니다.
- 시작 후 `downloads.search()`/상태 체크포인트 일시 실패, 워커 재시작, 완료 직전 취소, HTML 오류 파일 정리 완료 전 fallback 금지, 정리 실패 종료, 모호한 MIME 보존, 정리 직후 워커 종료 후 재삭제 없이 복구를 추가 검증했습니다.
- 브라우저 합성 GUI/DOM smoke 및 전체 JavaScript 구문 검사는 추가 운영 코드 변경 후에도 종료 코드 0으로 통과했습니다. 실제 네이버 다운로드에 대한 검증 한계는 그대로 남아 있습니다.
- 최종 `npm run package` 종료 코드 0. 산출물 `dist/nblogdl-chrome-0.1.0.zip`, 크기 **31,800 bytes**, SHA-256 **`90DF9206233C953B2918D6D860547DA177A3F58B6916027D3FA9A7693DF7506B`**. 앞서 기록한 해시를 대체하는 최종 산출물입니다.
- 서브에이전트 worker/explorer/qa-expert/code-reviewer 4개 역할을 사용했고, 코드 리뷰의 구체적인 결함 3개를 반영했습니다. 병렬 작업과 후속 재검증이 끝난 에이전트는 종료했습니다.
- 현재 상태: 설치 가능한 GUI 확장 첫 버전 및 ZIP/설치 안내/연구노트 인계 규칙 작성 완료. 실제 사용자 Chrome에 확장을 설치하거나 Chrome Web Store에 게시하지는 않았습니다.
- 다음 검증 항목: 실게시글 데스크톱 mainFrame/모바일, 늦게 로드되는 이미지, 원본과 w3840 파일의 실제 픽셀 비교, 워커 종료와 Chrome 파일 삭제/취소의 실제 타이밍. 재현 결과를 다음 작업 턴에 추가하고 변경이 있으면 ZIP을 재생성합니다.

## 2026-10-14 / 작업 턴 002 / 수동 저장 및 w3840 고정, 저장 경로 수정

### 사용자 요청 및 시작 상태

- 품질 설정에서 고해상도 w3840 우선만 남깁니다.
- '다운로드 폴더 안의 저장 경로'가 동작하지 않는다고 보고했습니다. 실제 Chrome 설정/다른 확장에 의한 경로 변경 여부는 아직 확인되지 않았습니다.
- '게시글을 열면 자동 저장' 기능을 제거합니다. 단순 UI 숨김이 아니라 사이트 스캔으로 다운로드가 시작되는 실행 경로도 제거할 계획입니다.
- 시작 버전 0.1.0, 앞선 최종 테스트 45개 통과. 기존 자동 저장은 스캔 시 즉시 대기열을 만들고, 작업 생성 당시 폴더·품질을 고정하므로 사용자가 나중에 입력한 설정이 이미 시작된 작업에는 적용되지 않는 구조입니다.

### 계획

주 에이전트는 백그라운드·팝업·본문의 기능 제거 및 경로 전달을 수정하고, 서브에이전트는 새로운 요구사항에 맞춘 다운로드 회귀 테스트를 담당합니다. 기존 저장된 auto/original 설정을 마이그레이션하여 새 설치뿐 아니라 기존 설치 업데이트에도 적용합니다. GUI에는 저장할 상대 경로와 실제 저장 결과를 명확히 표시하고, 다운로드 요청의 filename 및 브라우저 파일명 결정 이벤트를 검증합니다. 연구노트 과거 기록은 유지하고 README/ZIP은 최신 동작으로 갱신합니다.

### 진행 및 검증

진행 중입니다. 결과는 이 항목 아래에 추가합니다.

### 작업 중 추가 요청

- 사용자가 `imagegen` 스킬을 명시하여 확장 아이콘을 요청했습니다. 네이버의 초록색 N을 액자 안에 넣고 왼쪽 하단에 다운로드 아이콘을 배치하는 구도입니다.
- imagegen 스킬을 읽고 새 래스터 아이콘을 생성한 뒤 Chrome 아이콘 크기 16/32/48/128px를 준비하여 manifest와 팝업에 적용합니다. 기능 수정 작업은 계속 진행합니다.

### 조사 근거 및 수정

- explorer / Sartre가 확인한 구버전 경로 문제: 게시글 스캔이 기본 설정으로 자동 큐를 만들고 `job.folder`에 당시 폴더를 복사합니다. 이후 경로를 바꾸어도 이미 생성된 작업에는 적용되지 않습니다. 같은 이미지가 진행 중이면 수동 요청도 중복으로 억제되므로 새 경로로 저장 요청을 해도 이전 작업만 진행할 수 있었습니다. 이는 코드로 확인한 흐름이며 사용자 환경의 다른 확장 개입은 확인되지 않았습니다.
- `DOWNLOAD`의 선택 목록 검증과 입력 폴더 검증·설정 저장·대기열 생성이 한 트랜잭션에서 실행되도록 변경했습니다. 팝업이 클릭 순간의 `folder`를 전달하므로 별도 설정 메시지와 다운로드 메시지 사이의 경합을 제거합니다.
- 품질은 모든 새 작업에 `w3840` 우선으로 고정합니다. GUI의 선택 드롭다운은 제거하고 고정 안내만 남깁니다. helper의 원본 후보 계산은 이미지 중복 제거 및 w3840 실패 후 fallback에 사용하므로 유지합니다.
- 사이트 스캔은 이미지 목록만 저장합니다. 자동 저장 스위치·이력 UI·실행 분기·content script 설정 변경 listener를 제거했습니다.
- schemaVersion 2 마이그레이션은 저장 설정을 `{folder}`로 축소하고 구버전 자동 저장 이력을 제거합니다. 구버전의 남은 자동 작업은 대기 상태부터 중지하며, 이미 진행 중이면 취소 의도를 저장하고 Chrome 상태를 확인합니다. 수동 작업의 경로는 기존 요청을 유지합니다.
- Chrome `onDeterminingFilename`에서 이 확장이 만든 파일에만 작업의 상대 경로를 제안합니다. 아직 download ID가 저장되기 전인 `starting` 상태는 요청 URL로 식별하며, 워커 초기 읽기는 다운로드 트랜잭션 lock과 분리해 교착을 피합니다. 모든 분기에서 `suggest()`를 1회 호출하고 비동기 읽기에서는 `true`를 반환합니다.
- Chrome의 `filename` 이벤트 및 실제 완료 결과를 `task.savedFilename`에 보존합니다. 팝업에 요청 경로·실제 저장 경로·저장 폴더 열기를 표시하고, 입력 경로가 절대 경로나 `..`이면 명확한 한국어 오류를 표시합니다.
- 공식 근거: Google, 2026-10-04 문서 갱신 / 2026-10-14 확인, https://developer.chrome.com/docs/extensions/reference/api/downloads#event-onDeterminingFilename. 상대 경로, suggest 호출 규약 및 다른 확장과 충돌 시 마지막 설치 확장의 제안이 우선할 수 있다는 제한을 확인했습니다.

### 아이콘 생성 및 적용

- 생성 도구: 내장 `image_gen.imagegen` (`transparent_background: true`). CLI/API fallback은 사용하지 않았습니다.
- 원본 생성 위치: `C:\Users\ADMIN\.codex\generated_images\01a138ef-210d-77d3-a5b0-d79d455fb560\exec-da2cc25d-8a67-4c53-b011-24d8a5cb0f8d.png`.
- 프로젝트 사본: `assets/nblog-icon-source.png` (1254 × 1254 PNG, alpha 확인). 원본 생성 파일은 유지했습니다.
- Sharp는 생성 이미지의 크기 변환에만 사용했습니다. `scripts/prepare-icons.cjs`로 `extension/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`를 준비했습니다. 실행 확장의 의존성에는 Sharp를 추가하지 않았습니다.
- manifest의 `icons` 및 `action.default_icon`, 팝업 헤더의 이미지에 적용했습니다. 생성 이미지와 실제 팝업 캡처를 시각적으로 확인했습니다.
- 최종 생성 프롬프트:

```text
Use case: logo-brand. Asset type: Chrome extension app icon, one square icon intended to be legible at 16, 32, 48, and 128 pixels. Primary request: the Naver green N logo inside a picture frame, with a download icon overlapping the bottom-left corner. Create one polished clean flat app icon on a truly transparent background. Composition: straight-on chunky square photo frame with modest rounded corners in deep forest green, white/off-white interior, a large bold geometric N in vivid Naver green (#03C75A) centered and easily recognized. A prominent circular green download badge at the LOWER LEFT overlaps the frame edge, containing a thick white downward arrow landing in a short horizontal tray. The badge is roughly one third of the frame width, should not obscure the N. Sharp clean shapes, high contrast, crisp silhouette, minimal very subtle depth, generous solid strokes for tiny toolbar size, tasteful professional finish. Make artwork fill approximately 88 percent of the square canvas; equal clear outer padding so nothing is clipped. Only the single letter N; no other lettering, no slogans, no extra icons, no watermark, no presentation board, no external background, no checkerboard drawn into the art.
```

### 중간 검증

- QA / Copernicus가 `tests/background.test.cjs`, `tests/core.test.cjs`만 수정하여 새로운 수동 실행 계약을 반영했습니다. 기존 실패·취소·재시작 경쟁 상태의 검증은 유지했고, 자동 실행 제거, 구버전 마이그레이션, w3840 고정, 한국어·중첩 경로 및 작업별 폴더 스냅샷, filename 이벤트, 실제 저장 경로 추적 사례를 추가했습니다.
- `npm test`: 최상위 40개 + 하위 사례 13개 = 총 **53개 통과, 실패 0개**. core/content 12개 + background 41개입니다.
- GUI/실제 DOM 합성 smoke: 저장 버튼 클릭 때 아직 저장하지 않은 경로 `Photos\\Trip`이 `Photos/Trip`으로 다운로드 요청에 전달되며, 잘못된 경로로는 요청이 발생하지 않는 것을 확인했습니다. 자동 스위치·품질 드롭다운·자동 이력 버튼이 없고 실제 저장 경로 및 폴더 열기 요청이 표시되는 것을 검증했습니다.
- manifest가 참조하는 JS/팝업/모든 PNG의 존재 및 전체 확장 JS 구문 검사를 통과했습니다.
- 새 캡처 `artifacts/popup-preview.png`와 `artifacts/popup-empty.png`에 변경 GUI 및 생성 아이콘을 반영했습니다. 본문 미리보기 사진은 합성 이미지입니다.

실제 Chrome 테스트와 패키지 결과는 후속 기록으로 확정합니다.

### 별도 Chrome 통합 검증 시도 및 한계

- 앞선 턴의 '--load-extension 플래그를 사용할 수 없음'과 별개로, Chromium의 공식 CDP `Extensions.loadUnpacked`는 `--remote-debugging-pipe` 및 `--enable-unsafe-extension-debugging` 조건에서 사용할 수 있다는 근거를 추가 확인했습니다. 출처: Oliver Dunk (Chrome Extensions DevRel), 2025-04-02 / 2026-10-14 확인, https://groups.google.com/a/chromium.org/g/chromium-extensions/c/aEHdhDZ-V0E 및 https://chromedevtools.github.io/devtools-protocol/tot/Extensions/.
- 설치된 Chrome을 임시 격리 프로필로 실행하여 실제 확장 로드 명령은 성공했습니다. 일반 사용자 Chrome 프로필에는 확장을 설치하거나 설정을 변경하지 않았습니다.
- 로컬 PNG 서버와 임시 다운로드 폴더로 한국어/중첩 경로의 실제 파일을 검증하는 프로토타입을 시도했으나, 확장 페이지의 runtime 메시지 대기와 워커 평가가 각각 20초 내 완료되지 않았습니다. `timeout_read_native_settings`, `timeout_inspect_worker`가 발생했습니다. 디버거 시작 대기 해제 및 대상 워커 URL 일치 검사 후에도 같은 평가 시간 초과가 재현되었습니다.
- 이 응답 시간 초과가 테스트 자동화 연결 문제인지 확장 런타임 문제인지 현재 증거로는 구분할 수 없습니다. 실제 파일 저장 성공으로 기록하지 않습니다. 작업 중지/CIM 프로세스 조회도 시도했지만 해당 CIM 조회는 접근 제한으로 실패했으며, 이후 실행 도구의 Ctrl+C로 해당 작업만 종료했습니다. 후속 시도는 제한 시간과 context 정리로 정상 종료했습니다.
- 성공하지 않은 개발용 `native-smoke` 프로토타입과 package 명령은 제거했습니다. 제품 실행 코드와 통과한 Node/GUI 검증 도구는 유지합니다.
- 실제 사용자 Chrome에서 새로 로드한 0.2.0 버전으로 `사진/네이버` 경로를 입력하고 완료 카드의 실제 저장 위치를 확인하는 검증이 남아 있습니다. 같은 시간 초과나 경로 문제가 재현되면 확장 서비스 워커 콘솔, 실제 filename, 다른 파일명 변경 확장 여부를 근거로 조사해야 합니다.

### 작업 턴 002 최종 결과 및 인계

- 현재 버전 **0.2.0**. 게시글 자동 다운로드 제거, w3840 우선 품질 고정, 다운로드 클릭 순간의 저장 경로 원자적 전달, 파일명 결정 이벤트 제안, 실제 경로 표시 및 폴더 열기 구현 완료.
- 새 설치뿐 아니라 기존 0.1.0 저장 설정·자동 작업도 마이그레이션하는 코드와 테스트를 포함했습니다.
- 생성 아이콘의 16/32/48/128px PNG, manifest 및 팝업 연동, 생성 원본 및 재생성 준비 스크립트를 보존했습니다.
- 주 에이전트가 다시 실행한 `npm test`: **53개 통과, 실패 0개**. GUI/DOM smoke 및 manifest/icon/JS 검증 통과. 실제 사용자 Chrome의 파일 쓰기 검증은 앞서 명시한 한계 때문에 완료로 주장하지 않습니다.
- `README.md`, `extension/NOTICE.txt`를 0.2.0의 수동 저장·품질 고정·경로 설정·아이콘 및 업데이트 절차로 수정했습니다. 원본 저장소/이전 작업 기록은 유지합니다.
- 최종 `npm run package`: 종료 코드 0. `dist/nblogdl-chrome-0.2.0.zip` 크기 **50,069 bytes**, SHA-256 **`FF197CDF83BE586199DAC3D193B080954D43F0EC9D96ACC9D33643F3C395DC2B`**. 0.1.0 ZIP은 과거 산출물로 보존하며 설치·업데이트 안내는 0.2.0만 가리킵니다.
- 최종 ZIP의 실행 파일 및 4개 아이콘 존재, ZIP의 background.js 바이트와 현재 소스 일치, PNG 헤더의 각 아이콘 가로·세로 크기 일치를 확인했습니다.
- 이 턴의 explorer / Sartre와 qa-expert / Copernicus는 결과를 취합한 뒤 종료했습니다.
- 사용자 적용 절차: `chrome://extensions`에서 기존 확장을 새로고침하고, 네이버 블로그 탭도 새로고침합니다. ZIP을 쓰는 경우 0.2.0 압축을 풀고 manifest가 있는 폴더를 로드합니다. 하위 경로를 입력한 뒤 저장 버튼을 누르면 해당 작업에 적용되며 완료 카드에서 실제 파일 위치를 확인할 수 있습니다.

## 2026-10-15 / 작업 턴 003 / 네이버 사진 뷰어와 이미지 목록 일치

### 사용자 요청

장식처럼 보이는 이미지가 수집되는 문제를 https://blog.naver.com/edament/224426042469 기준으로 재현하고, 사진을 클릭했을 때 네이버 미리보기에 표시되는 숫자와 수집 개수가 같도록 수정합니다. 사용자는 그 외 기능이 잘 동작한다고 보고했습니다.

### 시작 상태 및 계획

- 시작 버전 0.2.0, 직전 테스트 53개 통과. 수동 저장, w3840 우선, 하위 경로 처리, 액자 N 아이콘은 유지합니다.
- 기존 `collectImages()`는 본문의 `[data-linkdata], img`를 모두 순회하고, 이미지가 포함된 노드에서는 `data-linktype`이 img가 아니어도 허용하는 조건이 있습니다. 스티커 링크와 내부 img가 모두 후보로 들어갈 수 있습니다.
- 실제 뷰어의 표시와 DOM의 사진 링크·비사진 링크를 비교한 뒤, 소스 호스트/파일 확장자/작은 해상도로 일괄 제외하는 추정 대신 네이버 사진 뷰어의 의미를 반영해 수정합니다.
- 주 에이전트는 브라우저 재현과 운영 코드 수정을 담당하고, 서브에이전트는 테스트 및 누락 위험 검토를 담당합니다. 과거 연구 기록은 유지합니다.

### 직접 관찰한 재현 결과

- 일반 웹 열기 도구는 URL 접근에 실패했으나, 연결된 Codex In-app Browser에서 실제 게시글 및 mainFrame을 열었습니다. 브라우저 제어는 `cua_repl`을 사용합니다.
- 게시글 작성자 표시는 EDAM Ent, 표시 작성일 2026-09-29 16:00이며, 제목은 '[아이유] 주문하신 아이유 무대인사 비하인드 나왔습니다'입니다. 확인일은 2026-10-15입니다.
- `.se-main-container` 안의 `img`는 **38개**, `a[data-linktype="img"]`는 **37개**, `[data-linktype="sticker"]`는 **1개**입니다.
- 일반 사진 링크를 직접 클릭한 실제 네이버 뷰어에 **1 / 37**이 표시되었습니다. 숫자 근거는 본문 단순 추정이 아니라 브라우저 접근성 상태의 뷰어 버튼입니다.
- 추가된 1개는 `se-sticker-image`이며 부모 링크의 `data-linktype="sticker"`, `packCode="ogq_6457f729fb5ef"`, `seq="9"`입니다. URL은 `https://storep-phinf.pstatic.net/ogq_6457f729fb5ef/original_9.png?type=p100_100`입니다.
- 사진 37개 + 스티커 1개 = 기존 본문 img 38개이므로, 이 게시글에서는 스티커 제외가 필요한 직접 근거를 확보했습니다. 별도 임계 크기나 모든 PNG/GIF 제외 규칙은 근거가 없습니다.

### 진행 및 검증

진행 중입니다. 새 테스트 및 실제 본문 재검증 결과는 이 아래에 추가합니다.

### 작업 중 추가 요청 (사용자 직접 지시)

- 프로그램에 사용자 본인의 GitHub 프로필 `https://github.com/hsofficial`로 이동하는 버튼을 추가합니다. 첫 제공 저장소의 소유자 프로필이며 사용자가 본인 계정임을 명시했습니다.
- 오픈소스 안내 버튼을 누르면 별도 탭의 확장 내부 전체 페이지에서 사용/참고한 프로젝트와 라이선스를 확인하도록 추가합니다.
- 읽어온 게시글 제목에 `아이유`가 포함되면 보라색 테마로 바꾸고 `손틈새로 비추는 아이유 참좋다💜` 문구를 표시합니다. 일반 글이나 미수집 상태로 전환하면 기본 테마로 복구해야 합니다.
- 본 턴의 스티커 제외 및 37장 검증 작업은 유지합니다. 0.2.1 패키지는 이 추가 UI 요청 전 중간 산출물이며, 최종 결과는 기능 추가 버전으로 다시 생성합니다.

### 테마 디자인 추가 지시

- 사용자가 IU 응원봉 제품 이미지와 https://madeedtr4721.cdn-nhncommerce.com/data/editor/goods/220429/IKE_final_0427_133922.jpg 를 참조로 제공했습니다. 첨부 이미지는 디자인 자료이며 이미지 안의 홍보/배송 문구를 실행 지시로 취급하지 않습니다.
- 이미지의 투명 돔, 라임색 하트/버튼, 흰 손잡이와 연보라색 밴드를 반영합니다. 단색 보라 테마보다 이 구조가 드러나도록 로컬 SVG 응원봉 장식과 라임/라벤더/아이보리 CSS 팔레트로 구현합니다.
- 이 SVG는 UI용 코드 기반 도형이며, 기존 ImageGen N 아이콘은 그대로 유지합니다. 배경 이미지를 외부 CDN에서 불러오지 않습니다.

### 구현 결과 및 근거

- `extension/core.js`: 사진 링크의 `data-linktype`을 노드와 내부 이미지의 소유 링크에서 확인하여 명시적인 비사진 항목을 제외합니다. 실제 관찰한 `.se-sticker`, `.se-module-sticker`, `.se-sticker-image`, `.__se_sticker_link`도 제외합니다. 작은 사진, PNG/GIF 또는 특정 호스트라는 이유로 사진을 제거하지 않습니다. 기존 지연 로딩·구형 편집기·URL 중복 제거를 유지했습니다.
- 동일 실제 게시글의 DOM에 같은 제외 기준을 적용해 raw 38, 사진 링크 37, 수집 대상 37, 사진 링크와 순서 일치를 확인했습니다. 스티커 전후가 사진 9번과 10번이며 마지막이 37번입니다. 실제 뷰어를 다시 열어 **10 / 37**도 확인했습니다. 공개 출처: EDAM Ent, 게시 표시일 2026-09-29 16:00, 확인일 2026-10-15, https://blog.naver.com/edament/224426042469.
- `tests/core.test.cjs`: qa-expert / Godel이 37사진+중간 스티커와 비사진 의미 구분 회귀 테스트를 추가했습니다. 수정 전 53개 통과·2개 실패를 확인했고 수정 후 총 55개 통과입니다. explorer / Maxwell이 제외 조건을 독립 검토했습니다. 이들은 결과 취합 후 종료했습니다.
- `extension/popup.html`, `popup.js`, `popup.css`: hsofficial GitHub 프로필 버튼과 로컬 안내 페이지 열기 버튼을 추가했습니다. 제목의 `아이유` 포함 여부로 테마를 계산하며 저장 설정에 남기지 않습니다. 다른 제목 또는 null scan이면 복원합니다. 제목은 계속 textContent로 넣어 HTML을 실행하지 않습니다. 안내 탭은 `chrome.runtime.getURL('about.html')`을 사용하고 현재 IU 테마일 때만 고정 쿼리 `?theme=iu`를 추가합니다.
- `extension/iu-lightstick.svg`: 돔·라임 하트·흰 손잡이·라벤더 밴드·라임 버튼을 로컬 SVG로 작성했습니다. 팝업에는 라벤더 버튼·체크박스·선택 테두리, 라임 빛 배경과 요청 문구를 적용했습니다. 문구의 보라색 하트는 HTML 문자 참조로 표현합니다. 참고 첨부의 프로젝트 보관본은 `assets/iu-lightstick-reference.png`이며 확장 ZIP에 제품 사진을 동봉하지 않습니다.
- worker / Popper가 소유 범위를 `extension/about.html`, `about.css`, `about.js` 3개로 한정하여 로컬 전체 페이지를 구현했습니다. 원본 GPLv3 이식, gallery-dl 참고(소스 복사 없음), 개발 전용 Playwright·Sharp를 구분합니다. Chrome API는 플랫폼 기능으로 설명하며 동봉 라이브러리로 잘못 나열하지 않습니다. GPL 전문은 동봉 LICENSE에서 로드하고 실패 안내 및 파일 직접 열기를 제공합니다. 취합 후 에이전트를 종료했습니다.
- 라이선스 확인 근거: `upstream/LICENSE`와 `extension/LICENSE` 해시 동일. 개발 환경 `C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules`의 Playwright 1.62.1, Sharp 0.35.5 package.json은 Apache-2.0을 표시합니다. gallery-dl은 Mike Fährmann 및 기여자의 공식 https://github.com/mikf/gallery-dl/blob/master/LICENSE 및 추출기 파일을 Popper가 확인했습니다(2026-10-15). 개발 도구의 라이브러리 파일을 확장에 동봉하지 않습니다.

### 최종 검증

- `npm test`: **총 55개 통과, 실패 0개** (최상위 42개 + 하위 사례 13개).
- `npm run smoke`: 저장 경로 전달, 유효하지 않은 경로의 요청 차단, 실제 경로 표시/폴더 열기 기존 검증 통과. 실 브라우저 DOM의 37사진+중간 스티커 합성 fixture에서 raw 38 → 수집 37, 9→10→37 순서 및 팝업 37장 전체 선택을 확인했습니다.
- 추가 GUI smoke: GitHub href, 일반/IU 안내 탭 URL, 제목만 변경 시 IU 테마 활성화·선택 보존, 응원봉 SVG 로드, 보라색 저장 버튼 계산 색상, 요청 문구, 일반 제목/미수집 전환 복원, 악성 HTML 형태 제목의 비실행을 확인했습니다.
- 로컬 오픈소스 페이지 GUI smoke: manifest 버전, 4개 크레딧 카드, LICENSE 텍스트 전체 일치와 펼치기, 일반/IU/미허용 쿼리 팔레트, 390px에서 가로 넘침 없음을 확인했습니다. 이 smoke는 Chrome runtime과 LICENSE fetch를 모의하며 실제 확장 설치 검증은 아닙니다.
- `artifacts/iu-theme-preview.png`, `artifacts/about-iu-preview.png`를 직접 열어 시각 확인했습니다. 썸네일은 검증용 합성 풍경이며 실제 아이유 사진이 아닙니다. `artifacts/gallery-count-regression.png`도 합성 사진 37장 GUI입니다.
- 실제 공개 네이버 글의 뷰어 및 DOM은 직접 확인했지만, 이번 턴에서 37개 실제 파일을 내려받지는 않았습니다. 기존 Chrome 네이티브 다운로드 자동화 시간 초과 한계는 턴 002 기록을 유지합니다. URL 중복 제거와 네이버의 사진 발생 횟수가 모든 글에서 항상 일치한다는 일반 보장은 하지 않습니다.
- 중간 산출물 `dist/nblogdl-chrome-0.2.1.zip`은 추가 UI 요청 전 패키지이며 크기 50,431 bytes, SHA-256 `8AC40226D1BA6AEF186FE96FBC92E70F58F26129826B716376B0E2F3F0F28EFE`였습니다. 최종 사용 안내는 0.3.0으로 교체합니다.

### 최종 패키지 및 인계

- `README.md`, `extension/NOTICE.txt`, manifest 및 package 버전을 **0.3.0**으로 맞췄습니다. README는 새 프로필/오픈소스 페이지·조건부 테마·디자인 참고 출처와 설치 절차를 설명합니다.
- `npm run package`: 종료 코드 0. `dist/nblogdl-chrome-0.3.0.zip` 크기 **58,885 bytes**, SHA-256 **`02EA464027A0E1A53F786DFD0ECC6A006717D0331C3B28C0ECBF8C832276B9DA`**.
- ZIP 17개 항목을 확인하고 모든 파일의 바이트 해시가 현재 `extension/` 소스와 같은 것을 검증했습니다. about HTML/CSS/JS, 응원봉 SVG, LICENSE, popup, manifest 포함을 별도로 확인했습니다. 모든 확장 JavaScript의 `node --check`를 통과했습니다.
- 실제 네이버 검증용으로 생성한 임시 브라우저 탭을 닫았으며, 모든 담당 서브에이전트 결과 취합과 종료를 완료했습니다.
- 사용자 적용: `chrome://extensions`의 기존 확장 새로고침 후 네이버 블로그 탭도 새로고침합니다. ZIP 사용자는 압축을 풀고 manifest가 있는 폴더를 로드합니다. 제목에 아이유가 있는 테스트 글에서 응원봉 테마를 확인할 수 있습니다.
- 후속 에이전트는 이 문서를 먼저 읽고 다음 턴 기록을 추가합니다. 실제 네이티브 파일 쓰기 자동화의 미검증 한계와 일반적인 URL 중복/뷰어 발생 횟수 차이는 앞선 기록을 확인합니다. 이미 통과한 검증을 이유 없이 반복하거나 과거 기록을 덮어쓰지 않습니다.
