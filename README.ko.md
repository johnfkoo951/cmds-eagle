[![English](https://img.shields.io/badge/English-README-134538)](README.md) [![한국어](https://img.shields.io/badge/한국어-README-E985A2)](README.ko.md)

# CMDS Eagle
Eagle 자료를 노트로 가져오고 로컬 원본, 휴대 가능한 미리보기, 클라우드 URL 중 필요한 형태를 선택합니다.

**버전 1.8.4 | 커뮤니티 플러그인에서 설치할 수 있습니다.**

Obsidian 1.6.6 이상 | 데스크톱 전용.

![CMDS Eagle storage choice](assets/CMDS-eagle3.png)
이미지를 저장할 위치를 고르는 화면입니다. 이전 UI이며 현재 버전의 표시 이름은 다를 수 있습니다.

## 주요 활용
- 현재 Eagle 라이브러리에서 이미지를 검색하고 메타데이터와 함께 삽입합니다.
- 붙여넣거나 드롭한 이미지를 선택한 라이브러리와 폴더에 가져옵니다.
- 저장 위치와 별개로 여섯 가지 링크 모드를 선택합니다.
- 설정한 클라우드로 업로드하거나 데스크톱 간 원본 경로를 매핑합니다.

## 설치와 첫 사용
**커뮤니티 설치:** 설정 → 커뮤니티 플러그인 → 탐색 → **CMDS Eagle** → 설치 → 활성화.

**수동 설치:** [1.8.4 릴리스](https://github.com/johnfkoo951/cmds-eagle/releases/tag/1.8.4)의 `main.js`, `manifest.json`, `styles.css`를 `<vault>/.obsidian/plugins/cmds-eagle/`에 넣고 다시 로드한 뒤 활성화합니다. 기존 설정을 백업하고 다른 사용자의 `data.json`을 복사하지 않습니다.

Eagle을 열어 설정에서 연결을 시험하고, 휴대 가능한 미리보기에는 `photo-info`를 선택한 뒤 예제 노트에서 **Search Eagle library and embed**를 실행합니다.

## 설명서
- [English user guide](docs/guide.md)
- [한국어 사용설명서](docs/guide.ko.md)
- [Web manual](https://apps.cmdspace.work/plugins/cmds-eagle/)
- [Product family](https://apps.cmdspace.work/plugins/)
- [Issues and support](https://github.com/johnfkoo951/cmds-eagle/issues)

## 개인정보와 한계
Eagle은 별도 라이선스의 데스크톱 앱입니다. 로컬 검색에 클라우드 계정은 필요 없습니다. 클라우드 업로드는 이미지 바이트를 제공업체에 보내며 이전 명령은 다른 노트와 원본을 수정/휴지통 이동할 수 있으므로 먼저 백업합니다.

## 개발
```sh
npm install
npm run build
```
로컬 개발용 플러그인 파일을 빌드합니다.
[기존 릴리스 이력](docs/guide.ko.md#부록-기존-릴리스-이력)은 설명서에 보존했습니다.

## 제작자와 라이선스
**Yohan Koo (CMDSPACE)**, https://cmdspace.work. **MIT**, [LICENSE](LICENSE).
