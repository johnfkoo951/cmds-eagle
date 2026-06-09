# CMDS Eagle

Obsidian plugin — Eagle 자산 라이브러리를 볼트와 연결. 검색, 임베드, 클라우드 업로드(ImgHippo, R2, S3, WebDAV).

## Build

```bash
npm install
npm run dev          # watch mode
npm run build        # tsc + esbuild production
```

빌드 산출물 `main.js`를 볼트에 복사:
```bash
cp main.js manifest.json styles.css "/Users/yohankoo/Local Obsidian_MBP/CMDSPACE_Local_MBP/.obsidian/plugins/cmds-eagle/"
```

## Project Structure

```
src/
├── main.ts             # Plugin entry (CMDSEagle class)
├── api.ts              # Eagle REST API client
├── cloud-providers.ts  # ImgHippo, R2, S3, WebDAV upload
├── modals.ts           # Search/embed modals
├── settings.ts         # Settings tab
└── types.ts            # Interfaces, defaults
```

## Key Info

- **ID**: `cmds-eagle`
- **Version**: 1.6.0
- **Desktop only**: yes (Eagle REST API is local)
- **GitHub**: `johnfkoo951/cmds-eagle`
- **Naming rule**: all CMDS plugins use `cmds-` prefix

## Release Workflow

`obsidian-plugin-dev` 스킬 사용 (아무 Claude Code 세션에서 호출 가능).
1. `npm run build` — 빌드 확인
2. `manifest.json` + `versions.json` 버전 업데이트
3. GitHub release 생성 (`main.js`, `manifest.json`, `styles.css` 첨부)
4. Obsidian Community에서 Review Branch → Check for new release

## CMDS Plugin Family

| Plugin | DEV 경로 | 설명 |
|--------|----------|------|
| **cmds-eagle** | (here) | Eagle 자산 연동 |
| cmds-share | `/Users/yohankoo/DEV/cmds-share/` | 노트 웹 공유 |
| cmds-link-bookends | `/Users/yohankoo/DEV/cmds-link-bookends/` | Bookends 참고문헌 연동 |
| cmds-link-devonthink | `/Users/yohankoo/DEV/cmds-link-devonthink/` | DEVONthink 문서 연동 |
