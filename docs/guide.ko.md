# CMDS Eagle 사용설명서
시각 자료 라이브러리를 노트와 연결하되, 원본과 미리보기와 공개 사본을 구분해 사용합니다.

## 배포 상태와 준비물
**2026-09-14**에 확인한 **1.8.4 소스** 기준입니다. 공개 릴리스 1.8.4에는 설치 파일 3종이 있으며 Obsidian Community Plugins 목록에도 등록되어 있습니다. 등록은 수동 보안 검토 완료를 뜻하지 않습니다. 목록에는 Obsidian 직원의 수동 검토를 받지 않았다는 고지가 있습니다.
- Eagle을 실행할 수 있는 컴퓨터와 **Obsidian 데스크톱 1.6.6 이상**. 모바일에서는 플러그인이 실행되지 않습니다.
- [Eagle](https://eagle.cool) 설치, 해당 제품 이용 조건에 맞는 라이선스, 열린 라이브러리. 플러그인은 MIT 라이선스이고 Eagle은 별도 제품입니다.
- 기본 로컬 API 주소는 `http://localhost:41595`. 로컬 검색과 가져오기에는 클라우드 계정이 필요 없습니다.
- 클라우드 기능은 ImgHippo, R2, S3, WebDAV 또는 사용자 서버의 계정과 저장/전송 비용을 별도로 고려합니다. 플러그인이 서버를 대신 개설하지는 않습니다.
- 백업한 테스트 노트와 비공개 정보가 없는 이미지 1개. 첫 작업으로 볼트 전체 이전을 실행하지 않습니다.

## 설치
1. Obsidian **설정 → 커뮤니티 플러그인 → 탐색**을 엽니다.
2. **CMDS Eagle**을 검색해 권한 안내를 확인한 뒤 설치하고 활성화합니다.
3. Eagle을 실행한 상태에서 **설정 → CMDS Eagle → Connection → Test Connection**으로 연결을 확인합니다.
수동 설치는 [1.8.4 릴리스](https://github.com/johnfkoo951/cmds-eagle/releases/tag/1.8.4)의 `main.js`, `manifest.json`, `styles.css`를 `<vault>/.obsidian/plugins/cmds-eagle/`에 함께 넣고 Obsidian을 다시 로드한 뒤 활성화합니다. 다른 컴퓨터의 `data.json`으로 기존 설정을 덮어쓰지 않습니다.

## 첫 성공: 노트 하나에 이미지 하나
1. Eagle에서 테스트 이미지가 있는 라이브러리를 엽니다.
2. 플러그인 설정의 **Where to store images → Import into Eagle (recommended)**을 선택합니다. 새 붙여넣기/가져오기의 저장 위치이며, 검색한 기존 자료의 위치를 바꾸는 설정은 아닙니다.
3. **What goes into the note → Photo + info — portable thumbnail** (`photo-info`)를 선택합니다. 다른 기기에서도 미리보기를 읽기 좋은 추천값입니다. 실제 기본값은 `cmds-eagle`입니다.
4. 연습용 Markdown 노트를 열고 이미지를 넣을 위치에 커서를 둡니다.
5. Ctrl/Cmd+P로 명령 팔레트를 열어 **Search Eagle library and embed**를 실행하고 알고 있는 이미지 이름을 검색해 선택합니다.
6. 이미지 미리보기, 한 줄 메타데이터 카드, **Open in Eagle** 링크가 의도한 자료를 가리키는지 확인합니다. 설정한 썸네일 폴더에는 미리보기 사본이 생깁니다.
노트와 썸네일을 동기화하면 다른 기기에서도 미리보기를 읽을 수 있습니다. 다만 `eagle://` 링크를 열려면 해당 기기에 Eagle과 관련 라이브러리가 필요합니다.

## 저장 위치와 링크 모드는 별개입니다
**Where to store images**는 Eagle/볼트/클라우드/매번 묻기 중 저장 위치를 정합니다. **What goes into the note**는 Eagle 자료를 노트에 어떻게 참조할지 정합니다. 기본값 변경만으로 기존 노트 전체가 이전되지는 않습니다.

| 모드 | 노트에 들어가는 내용 | 볼트 사본 | 적합한 용도와 한계 |
|---|---|---|---|
| `photo-info` | Eagle 링크가 걸린 썸네일과 한 줄 카드 | 썸네일 | 메타데이터를 포함한 휴대 가능한 미리보기 |
| `photo-only` | Eagle 링크가 걸린 썸네일 | 썸네일 | 간결한 미리보기 |
| `link-only` | Eagle 딥링크 | 없음 | 이미지 미리보기 없는 이동 링크; 수신자에게 Eagle 필요 |
| `cmds-eagle` 기본값 | 원본 `file://` 임베드와 카드 | 없음 | 라이브러리가 마운트된 등록 데스크톱 |
| `cmds-eagle-photo-only` | 원본 `file://` 임베드 | 없음 | 데스크톱에서 원본 화질로 보기 |
| `cmds-eagle-photo-link` | Eagle 링크가 걸린 원본 미리보기 | 없음 | 미리보기를 눌러 해당 Eagle 항목 열기 |

썸네일은 원본 백업이 아닙니다. Eagle이 썸네일을 만들지 않는 작은 이미지는 원본이 복사될 수 있습니다. 대기 시간 안에 이미지를 찾지 못하면 임시 파일 대신 Eagle 딥링크로 대체합니다. Eagle 원본을 삭제하면 원본 경로 모드는 깨집니다. 복사된 썸네일은 남을 수 있지만 Eagle 이동 링크는 더 이상 해당 항목을 열지 못합니다.

## 라이브러리, 폴더, 검색
검색 대상은 **현재 Eagle에 열린 라이브러리**입니다. 가져오기 대상 라이브러리를 바꾼다고 모든 라이브러리를 동시에 검색하지는 않습니다.
- **Detect libraries → Scan Eagle**은 열린 라이브러리와 Eagle이 기억하는 이력을 읽습니다.
- **Target library**: 현재 열린 라이브러리(기본), 지정 라이브러리, 매번 묻기. 지정 모드에서 **Default library**가 나타납니다.
- **Target folder**: 라이브러리별 기본 폴더, 매번 묻기, 루트. 폴더 ID는 라이브러리마다 다르므로 각각 지정합니다.
- 폴더 선택기는 전체 경로로 검색하고 가져오기 전에 새 폴더를 만들 수 있습니다. Eagle API는 가져오기 시 폴더를 배정하며, 이 설정으로 기존 항목을 사후 이동하는 것은 보장하지 않습니다.
- **Switch back after import**는 적절할 때 이전 라이브러리로 돌아갑니다. 진행 중 사용자가 직접 바꾼 라이브러리를 강제로 되돌리지 않습니다.
- 기억된 라이브러리 프로필을 지우면 저장한 기본 폴더도 제거됩니다. 디스크의 Eagle 라이브러리를 삭제하는 작업은 아니며 다음 검색에서 재발견될 수 있습니다.
- **Remove missing libraries on scan**은 기본 꺼짐입니다. Eagle 이력과 디스크 양쪽에서 사라진 경우만 Missing으로 봅니다. 연결 실패 자체를 삭제 증거로 삼지 않습니다.
- 검색 범위는 이름/태그/메모/폴더와 파일 형식으로 제한할 수 있습니다. **Items to pre-load for search**는 기본 5000이며 그 밖의 항목은 입력 중 Eagle 키워드 검색으로 보완합니다.

## 명령어 사전
명령 팔레트에는 CMDS Eagle 접두어가 붙습니다. 편집기 동작에는 활성 Markdown 편집기가 필요합니다.

| 실제 명령 이름 | 기능과 영향 |
|---|---|
| Search Eagle library and embed | 열린 라이브러리에서 찾아 삽입 |
| Switch Eagle library | Eagle에서 열린 라이브러리 변경 |
| Set default Eagle folder for the open library | 해당 라이브러리의 가져오기 폴더 저장 |
| Upload clipboard Eagle image to cloud | 클립보드 Eagle 참조를 읽어 이미지를 업로드하고 URL 삽입 |
| Embed Eagle image and upload to cloud | Eagle 항목 선택 후 업로드와 삽입 |
| Convert all images in note to cloud URLs | 현재 노트의 지원 이미지를 업로드하고 링크 수정 |
| Convert cross-platform image paths in current note | 등록한 루트 경로 매핑; 원문 수정 여부는 Conversion mode에 따름 |
| Move this note's local images into Eagle | 선택 노트의 로컬 이미지 이전; **다른 노트 수정과 원본 휴지통 이동 가능** |
| Move all local images in the vault into Eagle | 볼트 전체 이전; **파괴적 작업이며 첫 실습용 아님** |
| Verify Eagle references in current note | 파일/항목 누락 보고; 일시적 라이브러리 전환 가능; 노트 원문은 수정하지 않음 |

## 설정 사전
다음은 1.8.4 설정 코드에서 확인한 실제 표시 이름입니다.

| 구역 | 주요 설정 |
|---|---|
| Connection | Eagle API Base URL, Connection Timeout(밀리초), Test Connection |
| Eagle libraries | Target library/folder, 조건부 Default library, Switch back after import, Library switch timeout, Scan Eagle, 누락 프로필 정리 |
| Image paste/drop behavior | Where to store images, What goes into the note, Thumbnail folder(기본 `attachments/eagle`), Hidden tag prefixes in card |
| 썸네일 처리 | Thumbnail wait timeout(기본 10000 ms), Thumbnail size warning(기본 2048 KB), Remove staged copy after import |
| Search & embed | Include metadata card, Items to pre-load for search |
| Cloud storage provider | Active Cloud Provider와 해당 제공업체의 인증/URL |
| Cross-platform sync | Enable cross-platform path conversion, Conversion mode, Auto-convert paths on file open, Add current computer와 라이브러리 루트 |
| Excalidraw integration | Embed images in Excalidraw via cloud, Also add pasted screenshots to Eagle |

임시 `.eagle-temp/` 파일은 정리가 켜진 경우 Eagle에 복사한 원본의 전체 크기가 확인된 뒤 제거됩니다. 디버깅 목적으로 이 옵션을 끄면 사본이 더 남습니다.

## 클라우드 업로드와 Excalidraw
클라우드 명령을 사용하기 전에 제공업체를 설정합니다. 이름 선택만으로 인증 정보가 채워지지는 않습니다.

| 제공업체 | 준비할 것 |
|---|---|
| ImgHippo | 계정/API 키; 서비스 보관 정책과 제한 확인 |
| Cloudflare R2 | 호환 Worker 업로드 엔드포인트, Worker API 키, 공개 버킷 URL; 버킷만으로는 부족 |
| Amazon S3 | 엔드포인트, 리전, 버킷, 액세스 키 ID와 비밀키, 선택적 공개 URL |
| WebDAV | 서버 URL, 사용자명/암호, 업로드 경로, 외부에서 읽을 수 있는 공개 URL |
| Custom server | 플러그인 업로드 계약에 맞는 Upload URL과 Public URL |

비민감 이미지로 시험하고 로그인하지 않은 브라우저에서도 결과 URL이 열리는지 확인합니다. 업로드 성공과 공개 읽기 가능은 별개입니다. 요금, 접근 정책, 보관 기간은 해당 서비스가 결정합니다.
Excalidraw 연동에는 별도 Excalidraw 플러그인과 클라우드 설정이 필요합니다. Eagle 자료는 원본을 사용하고, 스크린샷은 업로드하면서 선택적으로 Eagle에도 가져옵니다. 그림은 외부 이미지 URL에 의존하게 됩니다. CMDS Eagle이 이 이미지를 암호화하지는 않습니다.

## 여러 기기에서 읽기
경로 변환은 **Eagle 라이브러리 동기화가 아니라 루트 매핑**입니다. 각 데스크톱에서 **Add current computer**를 실행하고 실제 마운트된 라이브러리 루트를 등록합니다. 로컬 볼륨, Windows 드라이브, UNC 공유 경로를 표현할 수 있습니다.
기본 **Render only**는 표시만 바꾸고 Markdown을 수정하지 않습니다. **Modify note source**는 파일 URL을 수정하며 마운트되지 않은 경로는 건너뜁니다. 여러 컴퓨터가 노트를 동기화한다면 render-only를 권장합니다. 휴대폰은 이 플러그인으로 데스크톱 `file://` 라이브러리를 마운트할 수 없으므로 동기화된 썸네일이나 공개 이미지를 사용합니다.

## 이전 명령 실행 전 주의
볼트와 Eagle 라이브러리를 모두 백업하고 다른 편집을 멈춥니다. 노트 단위 이전도 이미지 선택만 한 노트에서 할 뿐, **같은 이미지를 참조하는 다른 Markdown 노트까지 수정합니다**. 가져오기와 참조 수정이 성공한 뒤 볼트 원본을 Obsidian 삭제 설정에 따라 휴지통으로 보냅니다. 시스템 휴지통을 원하면 Obsidian에서 그 방식을 선택합니다.
생성 썸네일, 임시 파일, 참조되지 않은 자산은 제외됩니다. 실패한 항목의 원본은 남지만 **앞서 성공한 변경은 자동 롤백되지 않습니다**. 변경 파일과 실패 목록을 확인하고, 복원할 때 더 최근의 편집을 덮어쓰지 않습니다. 플러그인 설치나 설명서 열람만으로 이전은 실행되지 않습니다.

## 개인정보와 한계
- 로컬 검색은 Eagle API에 요청합니다. 명시적 가져오기는 Eagle과 지정한 볼트 위치에 쓰며 클라우드 동작은 이미지 바이트와 요청 정보를 해당 서비스에 보냅니다.
- `data.json`, 저장소 키, 라이브러리 경로, 진단 출력은 비공개로 취급합니다. 입력란이 가려져 있다고 저장 파일까지 암호화됐다는 뜻은 아닙니다.
- 공개 이미지 URL은 전달되거나 캐시될 수 있습니다. 노트 링크 삭제만으로 클라우드 자산 삭제가 보장되지는 않습니다.
- `file://`, `eagle://`는 공개 웹 이미지 URL이 아닙니다. Share 페이지가 수신자의 컴퓨터에 내 라이브러리를 마운트해 주지 않습니다.
- 데스크톱 지원은 모든 OS의 새 컴퓨터 시험 완료를 의미하지 않습니다. 이 설명서 작업에서는 소스와 릴리스 메타데이터를 확인했으며 가져오기, 이전, 클라우드 업로드를 실행하지 않았습니다.

## 문제 해결

| 증상 | 확인 순서 |
|---|---|
| 연결 실패 | Eagle 실행과 라이브러리 열기 → API 주소/시간 확인 → Test Connection |
| 알고 있는 자료가 안 나옴 | 열린 라이브러리 확인 → 검색 범위/형식 필터 해제 → 정확한 이름 검색 |
| Eagle 링크만 삽입됨 | 이미지 존재와 썸네일 대기 시간 확인; 임시 경로를 추측해 붙이지 않기 |
| 삭제한 이미지가 계속 보임 | Obsidian 창 다시 로드 후 Verify Eagle references 실행; 메모리 캐시 주의 |
| 다른 컴퓨터에서 안 보임 | 라이브러리 마운트와 컴퓨터 루트 등록 또는 photo-info 사용 |
| 업로드 성공 뒤 이미지가 안 열림 | 업로드 인증과 별도로 공개 URL/읽기 권한 확인 |
| 지운 라이브러리가 다시 나타남 | Eagle이 여전히 기억하는 항목인지 확인; 프로필 삭제는 디스크 삭제가 아님 |
| 이전이 일부만 완료됨 | 추가 일괄 실행 중단 → 알림/콘솔/백업 확인; 먼저 성공한 변경은 남음 |

## 업데이트, 지원, 제작자
업데이트 전에 설정을 백업하고 커뮤니티 플러그인 업데이트 또는 같은 릴리스의 파일 3종을 사용합니다. 노트 하나로 재확인하고 버전이 다른 파일을 섞지 않습니다.
[제품과 웹 설명서](https://apps.cmdspace.work/plugins/cmds-eagle/) | [릴리스](https://github.com/johnfkoo951/cmds-eagle/releases) | [문제 신고](https://github.com/johnfkoo951/cmds-eagle/issues).
신고에는 플러그인/Obsidian/Eagle 버전, OS, 링크 모드, 제공업체 종류, 비민감 재현 절차를 포함합니다. 인증 정보나 개인 라이브러리, 전체 설정 파일을 첨부하지 않습니다.
**Yohan Koo (CMDSPACE)**, https://cmdspace.work. MIT, [LICENSE](https://github.com/johnfkoo951/cmds-eagle/blob/main/LICENSE) 참조.

## 소스와 검증 기준
`manifest.json`, `src/main.ts`, `src/settings.ts`, `src/types.ts`, `src/canonical.ts`, `src/api.ts`, `src/cloud-providers.ts`를 대조했습니다. [소스 저장소](https://github.com/johnfkoo951/cmds-eagle). 아래 기존 스크린샷은 저장 위치 선택을 보여주며 1.8.4 전체 UI를 보증하지 않습니다. 화면의 비공개 정보 노출 여부를 확인했습니다.
![기존 Eagle 저장 위치 선택 화면](https://raw.githubusercontent.com/johnfkoo951/cmds-eagle/main/assets/CMDS-eagle3.png)

## 부록: 기존 릴리스 이력
이전 README의 1.8.0–1.8.4 설명을 보존합니다. 역사적 표현은 당시 기록이며 현재 사용 절차와 한계는 위 설명서를 우선합니다.
### 1.8.4의 변경 사항
**이름을 바꾸거나 지운 라이브러리가 목록에 영원히 남았습니다.** 감지는 프로필을 추가하기만 했기 때문에,
Eagle에서 이름을 바꾼 라이브러리는 존재하지 않는 경로를 가리키는 예전 항목으로 설정에 남았고 지울 방법도
없었습니다. 이제 모든 라이브러리 줄에 제거 버튼이 있고, Eagle이 더 이상 알지 못하면서 디스크에서도 사라진
라이브러리는 `Missing`으로 표시되며 목록 위에 `Remove all missing` 버튼이 나타납니다.

프로필에는 저장해둔 기본 폴더가 들어 있으므로 삭제는 기본적으로 사용자가 직접 하도록 두었습니다. 두 신호가
**모두** 일치할 때만 missing으로 판정합니다. Eagle이 목록에서 뺐고 *동시에* 디스크에서도 사라진 경우입니다.
마운트만 해제된 외장·네트워크 볼륨은 Eagle이 계속 기억하므로 목록에 남고 설정도 유지됩니다. Eagle이 실행
중이 아니면 아무것도 판정하지 않습니다. `Scan Eagle`이 알아서 정리하기를 원하면
`Remove missing libraries on scan`을 켜면 됩니다.

### 1.8.2의 변경 사항
**검색이 라이브러리의 일부만 보고 있었습니다.** Eagle은 limit을 주지 않으면 200개만 반환하는데, 검색
창이 limit을 넘기지 않았습니다. 항목이 2,400개인 라이브러리에서는 8%만 대상으로 퍼지 매칭한 셈이고,
나머지는 존재하지 않는 것처럼 동작했습니다. 이제 `Items to pre-load for search`(기본값 5000)만큼 미리
불러오고, 그 상한을 넘으면 입력에 맞춰 Eagle의 keyword 검색 결과를 합칩니다. 라이브러리 크기와 무관하게
모든 항목에 도달할 수 있습니다.

**검색 필터가 아예 그려지지 않았습니다.** 검색 범위 필터(`Name` / `Tags` / `Notes` / `Folders`), 파일
유형 필터, 라이브러리 항목 수 헤더가 모두 빠져 있었습니다. 이를 삽입하는 코드가 잘못된 요소를 찾고
있었기 때문입니다. 이제 정상적으로 표시됩니다.

**볼트 루트에서 첨부 파일 경로가 깨지지 않습니다.** Obsidian의 *Default location for new attachments*를
`Vault folder`로 둔 상태에서 이미지를 로컬에 저장하면 `//파일명.png` 경로가 만들어져 Obsidian이 해석하지
못했습니다. [@nancyel](https://github.com/nancyel) 님이 [#1](https://github.com/johnfkoo951/cmds-eagle/pull/1)
에서 보고하고 수정해 주었고, 인접한 경우까지 확장해 반영했습니다.

### 1.8.0의 새로운 기능
#### 여러 Eagle 라이브러리
Eagle은 한 번에 하나의 라이브러리만 엽니다. 다른 라이브러리로 가져오려면 해당 라이브러리로
전환한 뒤 돌아와야 하며, 각 전환에는 약 1초가 걸립니다. **Settings → Eagle libraries**에서 설정합니다.

| Target library | 동작 |
|---|---|
| Currently open library (기본값) | 전환하지 않습니다. 1.7.x와 동일하게 동작합니다. |
| Always a specific library | 필요할 때 지정한 라이브러리로 전환하고, `Switch back after import`가 켜져 있으면 돌아옵니다. |
| Ask every time | 가져올 때마다 선택하므로 한 노트에 여러 라이브러리의 에셋을 담을 수 있습니다. |

가져오는 도중 Eagle에서 직접 다른 라이브러리로 전환하면 사용자의 선택을 우선합니다.
플러그인이 복귀 전에 현재 라이브러리를 확인하므로 사용자가 선택한 상태를 유지합니다.

#### 라이브러리별 폴더
라이브러리 루트 대신 폴더로 가져올 수 있습니다. 폴더 ID는 해당 라이브러리에 속하므로
라이브러리마다 기본 폴더를 따로 저장합니다. **Target folder**를 *Ask every time*으로 설정하면
전체 폴더 경로를 검색하는 선택 창이 열립니다. 예를 들어 `proj/jazz`로 `Projects/Jazz Blend`를
찾을 수 있으며, `Inbox/2026`을 입력하면 `Inbox` 아래에 `2026` 폴더를 바로 만들 수 있습니다.

Eagle은 가져올 때만 폴더를 지정합니다. API로 기존 항목을 다른 폴더로 이동할 수 없으므로
대상 폴더를 먼저 선택하며, 다시 분류하려면 재가져오기가 필요합니다.

#### 저장 방식과 링크 모드
이전에는 Eagle로 붙여넣어도 볼트에 사본이 남았고, 삽입한 참조가 재동기화나 다른 컴퓨터로의
이동 후에는 유지되지 않았습니다. 이번 버전에서는 다음 세 가지가 바뀌었습니다.

| 항목 | 이전 | 현재 |
|---|---|---|
| `.eagle-temp/`의 임시 사본 | 붙여넣을 때마다 기록하고 삭제하지 않아 Eagle과 볼트 양쪽에 원본이 남았습니다. | Eagle에서 가져오기를 확인하면 삭제합니다. |
| 삽입 경로 | 대안 없이 Eagle 라이브러리의 절대 `file://` 경로를 사용했습니다. | 기본값은 여전히 `cmds-eagle`이지만, `photo-info`는 볼트 상대 경로 썸네일과 `eagle://` 딥 링크를 사용하므로 재동기화 후에도 유지되고 다른 기기에서도 표시됩니다. |
| 썸네일 대기 | 고정된 `delay(1000)`을 사용했으며, 큰 파일은 임시 파일 링크로 대체되어 나중에 연결이 끊겼습니다. | 대기 간격을 지수적으로 늘리며 확인하고, 실패하면 딥 링크를 사용합니다. 컴퓨터에 종속된 경로로 대체하지 않습니다. |

기존 설치의 동작은 유지됩니다. `linkMode` 기본값은 `cmds-eagle`이므로 다른 모드를 선택하기
전까지는 바뀌지 않습니다.

> **Eagle에서 삭제하면 노트에서도 이미지가 사라집니다.** Eagle을 원본 저장소로 사용하는
> `cmds-eagle` 계열 모드의 의도된 동작입니다. 다만 Obsidian이 창을 다시 불러올 때까지
> 메모리에서 이미지를 제공하므로 삭제 직후에도 잠시 표시될 수 있습니다.
> 실제 상태는 `Verify Eagle references in current note`로 확인합니다.
> Eagle에서 삭제한 뒤에도 노트에 이미지를 남기려면 `photo-info`를 선택합니다.

#### 링크 모드
**파일 저장 위치**(Eagle / 볼트 / 클라우드 / 매번 선택)와 **노트에 삽입할 형식**은 서로 독립적인
설정입니다. 두 번째 설정이 `linkMode`입니다.

| 모드 | 노트에 삽입되는 내용 | 볼트 사본 | 다른 기기 |
|---|---|---|---|
| **`photo-info`** | 썸네일 + 한 줄 카드 | 썸네일 1개 | 가능 |
| `photo-only` | 썸네일 | 썸네일 1개 | 가능 |
| `link-only` | `eagle://` 링크 | 없음 | 가능 |
| **`cmds-eagle`** (기본값) | 절대 `file://` 임베드 + 카드 | 없음 | 등록한 데스크톱만 지원 |
| `cmds-eagle-photo-only` | 절대 `file://` 임베드 | 없음 | 등록한 데스크톱만 지원 |
| `cmds-eagle-photo-link` | `eagle://` 항목 링크가 연결된 원본 이미지 | 없음 | 등록한 데스크톱만 지원 |

```markdown
# photo-info
[![hero shot](attachments/eagle/KXYZ01.png)](eagle://item/KXYZ01)
> `png` · 4.2 MB · 1920×1080 · #ui #ref · [Open in Eagle](eagle://item/KXYZ01)

# photo-only
[![hero shot](attachments/eagle/KXYZ01.png)](eagle://item/KXYZ01)

# link-only
[hero shot](eagle://item/KXYZ01)

```

`cmds-eagle*` 세 모드는 볼트 썸네일 대신 원본 이미지를 사용하며, 출력 구성은 표와 같습니다.
예시에는 컴퓨터별 파일 위치를 넣지 않았습니다.

썸네일은 Eagle 항목 ID를 기준으로 저장하므로 이름을 바꾸거나 다시 삽입해도 중복 생성되지
않습니다. 이미지 경로는 노트 기준 상대 경로이므로 볼트 전체를 동기화할 수 있으며, 카드는
정확히 한 줄입니다. `cmds-eagle*` 모드는 원본 자체를 임베드하므로 라이브러리가 마운트되어
있어야 합니다. 여러 데스크톱에서 같은 라이브러리를 사용하는 방법은
[크로스 플랫폼 동기화](#여러-기기에서-읽기)를 참조합니다.
이식 가능한 사진 모드는 썸네일을 얻지 못하면 일반 `eagle://` 링크로 대체합니다.
원본 모드도 원본을 찾지 못하면 같은 방식으로 대체하며, 임시 파일 참조는 사용하지 않습니다.
`cmds-eagle-photo-link`에서는 표시된 원본을 클릭하면 Eagle의 해당 항목이 열립니다.

`photo-*` 출력 형식은 계약 테스트로 검증합니다. `src/canonical.ts`와
`tests/canonical.test.ts`를 참조하며, 표시 형식을 변경할 때 두 파일도 일치시켜야 합니다.

#### 기존 볼트의 이미지 이전
`Move all local images in the vault into Eagle`은 참조된 이미지를 가져오고, 모든 참조를
표준 형식으로 바꾼 뒤 볼트 사본을 휴지통으로 보냅니다.
`Move this note's local images into Eagle`은 한 노트에서 대상 이미지를 선택하므로 먼저
시험하기에 적합합니다. 다른 노트에 있는 동일 이미지의 참조도 함께 바뀝니다.
두 명령 모두 확인을 요청하고 처리 결과를 알립니다. 볼트 전체 이전은 원본을 제거하는 작업이며
큰 볼트에서는 오래 걸릴 수 있으므로 먼저 백업합니다. 시스템 휴지통으로 보내려면 Obsidian에서
해당 옵션을 선택합니다. 플러그인은 Obsidian의 삭제 설정을 따릅니다.
