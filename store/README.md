# Chrome 웹스토어 등록 준비 안내

준비 기준: **v0.4.0**, 공식 문서 확인일: **2026-10-15**.

소개·이미지·개인정보 문서는 준비했지만, 개발자 계정 등록·결제·약관 동의·실제 웹스토어 업로드/심사 제출은 수행하지 않았습니다. 이 폴더 전체 ZIP을 확장 설치 패키지로 업로드하지 마세요.

## 비용과 난이도

- 신규 개발자/게시자 등록비는 **미화 5달러, 일회성**입니다. 이미 등록한 계정인지 먼저 확인하세요. 최종 원화 결제액은 카드 환율·부과 항목에 따라 달라질 수 있으므로 결제 화면에서 확인합니다. Google의 [2026-04-30 안내](https://developer.chrome.com/blog/cws-role-expansion-developer-dashboard)와 [등록 문서](https://developer.chrome.com/docs/webstore/register)가 근거입니다.
- 현재 앱은 자체 서버·유료 API가 필요 없는 구조입니다. 무료 확장 배포를 위해 별도 서버나 유료 도메인을 구매할 필요는 없습니다. 공개 GitHub의 개인정보 문서 URL을 사용할 수 있습니다. 나중에 유료 서비스를 추가한다면 비용·신고 항목을 다시 검토해야 합니다.
- 제 판단으로 업로드·문안 입력 자체는 어렵지 않습니다. 실제로 시간이 드는 부분은 계정 확인, 정확한 개인정보 공개, 권한 최소화, 심사 보완 요청 대응입니다. 승인이나 특정 완료일은 보장할 수 없습니다.
- Google의 일반 [심사 안내](https://developer.chrome.com/docs/webstore/review-process)는 보통 수일, 경우에 따라 수주가 걸릴 수 있다고 설명합니다. [2026-08-20 변경 안내](https://developer.chrome.com/blog/cws-review-updates-2026)는 설치 사전 검사와 심사 과정 개선을 알렸으나 개별 제출의 고정 처리 시간을 약속하지 않습니다.

## 준비된 파일

| 파일 | 입력/사용 위치 |
| --- | --- |
| [listing-ko.md](listing-ko.md) | 이름·짧은 설명·상세 설명, 단일 목적, 권한·원격 코드·심사 테스트 안내 |
| [개인정보처리방침](../PRIVACY.md) | 공개 URL에 게시한 뒤 Privacy practices의 정책 URL에 입력 |
| [01-select-1280x800.png](assets/01-select-1280x800.png) | 스크린샷 1: 사진 선택 |
| [02-folders-1280x800.png](assets/02-folders-1280x800.png) | 스크린샷 2: 경로·진행/완료 표시 |
| [03-dark-1280x800.png](assets/03-dark-1280x800.png) | 스크린샷 3: 다크모드 |
| [04-iu-1280x800.png](assets/04-iu-1280x800.png) | 스크린샷 4: 제목 조건의 IU 테마 |
| [05-open-source-1280x800.png](assets/05-open-source-1280x800.png) | 스크린샷 5: 오픈소스 안내 |
| [promo-small-440x280.png](assets/promo-small-440x280.png) | 작은 홍보 이미지 |
| [promo-marquee-1400x560.png](assets/promo-marquee-1400x560.png) | 선택 홍보 이미지 |
| [icon-current-128.png](assets/icon-current-128.png) | 현행 패키지 아이콘 사본. 브랜드 오인 여부를 검토한 뒤 사용 |
| [asset-manifest.json](assets/asset-manifest.json) | 생성 버전·해상도·샘플 데이터 사용 여부 |

Google [이미지 안내](https://developer.chrome.com/docs/webstore/images)에 맞춰 스크린샷은 **1280×800 5장**, 작은 홍보 이미지는 **440×280**, 선택 홍보 이미지는 **1400×560**, 아이콘은 **128×128 PNG**로 준비했습니다. 스크린샷 바깥 캔버스는 사각형이며 투명 여백이 없습니다. 파일명의 숫자 순서대로 등록하시면 됩니다.

스크린샷은 실제 v0.4.0 HTML/CSS/JS를 브라우저에서 렌더링하고 기능 설명을 곁들인 이미지입니다. 사진은 직접 작성한 합성 풍경이며 Chrome API·완료 경로 데이터는 예시용으로 모의했습니다. 실제 사진 저장 결과를 입증하는 자료가 아닙니다. 최종 제출본 UI가 달라지면 이미지를 다시 생성해야 합니다.

## 제출 전에 해결/확인할 사항

1. **중복 권한 정리:** v0.4.0에는 `activeTab`이 남아 있지만 현재 기능은 기본 탭 ID 조회·`tabs.sendMessage`·기존 정적 콘텐츠 스크립트를 사용합니다. Google은 이 두 탭 API 사용만으로 `activeTab`이 필요하지 않다고 [과다 권한 안내](https://developer.chrome.com/docs/webstore/troubleshooting#excessive-permissions)에 명시합니다. 필요성을 꾸며 쓰지 말고 제출용 다음 버전에서 이 권한을 제거한 뒤 패키지·문안을 맞추세요. [검토용 패치](remove-unused-activeTab.patch)는 해당 선언만 제거합니다. 버전 증가·ZIP 재생성·회귀 검증은 별도로 필요합니다.
2. **공개 개인정보 URL:** 후보 URL은 `https://github.com/hsofficial/nblogdl-chrome/blob/main/PRIVACY.md`입니다. 게시 후 로그인하지 않은 창에서도 열리는지 확인하고 대시보드에 입력합니다. 로컬 파일 경로를 입력하지 않습니다.
3. **브랜드 표시:** 현재 N 아이콘과 IU 응원봉 테마의 사용 권한·공식 앱 오인 여부를 검토하세요. 독립 개발 도구이며 NAVER·아이유·EDAM의 공식 제품/제휴가 아니라는 문구를 준비했습니다. 이 문구만으로 권리 문제가 자동 해결되는 것은 아닙니다. 권리 침해나 심사 거절이 확정됐다는 판단은 아닙니다. [공식 정책](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property)을 확인하고 필요하면 자체 일반 사진 아이콘으로 변경하세요.
4. **실제 저장 확인:** 최종 업로드 ZIP을 Chrome에서 로드하고 한국어 중첩 폴더의 실제 파일 저장·폴더 열기·중지·재시작 복구를 직접 확인하세요. 기존 자동화는 모의 API 검사였고 실제 네이티브 저장 자동화에는 시간 초과 한계가 있었습니다. 사용자는 기능이 잘 동작한다고 보고했으나 이를 모든 시나리오의 검사 완료로 대신하지 않습니다.
5. **계정의 연락처·사업자 상태:** 게시자 이름 `hsofficial`은 제안입니다. 검증할 연락 이메일은 본인이 관리하는 주소를 입력하세요. 주소/사업자 관련 항목이 표시되면 실제 상황에 맞게 답하고, 확인되지 않은 신원 정보를 문서에서 가져오지 마세요.

## 대시보드 입력 순서

1. 사용할 Google 계정으로 [개발자 대시보드](https://chrome.google.com/webstore/devconsole)에 접속합니다. 새 등록이면 약관을 읽고 일회성 등록비를 직접 결제합니다.
2. 계정의 **2단계 인증**을 사용하고 게시자 이름·연락 이메일을 설정/검증합니다. [계정 설정](https://developer.chrome.com/docs/webstore/set-up-account), [2단계 인증 정책](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification)을 참고합니다. 약관 동의·결제·본인 확인은 계정 소유자가 직접 완료합니다.
3. **새 항목 추가/New item**에서 최종 확장 ZIP을 올립니다. `manifest.json`이 ZIP 최상위에 있어야 합니다. GitHub Source code ZIP이나 이 자료 묶음 ZIP은 올리지 않습니다. 현행 0.4.0 배포본은 `dist/nblogdl-chrome-0.4.0.zip`이지만 앞서 적은 중복 권한 정리 후 최종 패키지를 확정해야 합니다.
4. **스토어 등록정보/Store listing:** 한국어를 선택하고 [listing-ko.md](listing-ko.md)의 설명을 입력합니다. 기능과 맞는 생산성/도구 계열 카테고리를 선택하고 준비한 아이콘·스크린샷·홍보 이미지를 올립니다. 대시보드의 현재 카테고리 이름을 우선합니다.
5. **개인정보 처리/Privacy practices:** 단일 목적, 실제 남은 권한, 원격 코드 사용 여부, 데이터 유형과 정책 URL을 입력합니다. 로컬 처리도 공개 대상이며, '개발자 서버 전송 없음'을 '데이터 처리 없음'으로 잘못 기재하지 않습니다. 상세 판단 근거는 listing 문서를 확인합니다.
6. **배포/Distribution:** 무료 여부·배포 국가·공개 범위를 실제 의도에 맞게 선택합니다. 처음에는 비공개/신뢰된 테스터로 확인할 수 있으나 해당 배포도 심사가 면제된다는 뜻은 아닙니다.
7. **테스트 안내/Test instructions:** 로그인 불필요, 지원 게시글 주소, 선택 저장·경로·모드·IU 제목 조건 확인 방법을 붙여 넣습니다. 로그인용 개인정보나 없는 테스트 계정을 만들지 않습니다.
8. 업로드 사전 검사와 누락 항목을 확인하고 **심사 제출/Submit for review**를 누릅니다. 자동 게시 여부를 선택할 수 있습니다. 원하면 승인 후 직접 게시하도록 설정합니다. 정확한 버튼 이름은 대시보드 언어/갱신에 따라 다를 수 있습니다.
9. 이메일과 대시보드에서 승인·보완 요청을 확인합니다. 승인 후 실제 스토어 링크를 README에 추가합니다. 현재 문서에는 존재하지 않는 스토어 링크를 넣지 않았습니다.

전체 흐름은 Google [게시 안내](https://developer.chrome.com/docs/webstore/publish), 개인정보 입력은 [대시보드 설명](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)을 근거로 정리했습니다. 이 준비 자료는 Google의 심사 결과를 대신하지 않습니다.

## 이미지 재생성

선택 개발 도구 Playwright와 설치된 Chrome이 필요합니다. 확장 프로그램 실행 의존성은 아닙니다.

```powershell
$env:PLAYWRIGHT_PATH = '사용 가능한 playwright 패키지의 절대 경로'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node store/generate-assets.cjs
```

스크립트는 `extension/`을 읽고 `store/assets/`만 생성합니다. 원본 앱·실제 OS 화면 모드·다운로드 폴더·사용자 Chrome 프로필을 수정하지 않습니다.
