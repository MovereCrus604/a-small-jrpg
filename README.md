# A SMALL JRPG — 웹(모바일) 버전

Unity PC 빌드(`A Assignment`)를 분석해 **게임 내용(흐름·규칙·수치·문구·이미지)은 그대로** 두고, 브라우저(iOS/Android/PC)에서 실행되도록 다시 구현한 버전입니다.
빌드 파일 없이 정적 파일(HTML/CSS/JS)만으로 동작하므로 GitHub Pages에 그대로 올릴 수 있습니다.

- 게임 진행과 플레이어 행동 정리: [`GAME_SPEC.md`](GAME_SPEC.md)
- 가로 화면 기준입니다. 휴대폰을 세로로 들면 "화면을 가로로 돌려주세요" 안내가 뜹니다.

## GitHub Pages로 올리기

1. GitHub에서 새 저장소를 만듭니다 (예: `a-small-jrpg`, Public).
2. 이 폴더의 **내용물**(`index.html`이 저장소 맨 위에 오도록)을 올립니다.
   - 웹에서: 저장소 → *Add file → Upload files* → 폴더 안의 파일·폴더 전부 드래그. (`.nojekyll`은 숨김 파일이라 안 보여도 괜찮지만, 같이 올리면 더 좋습니다.)
   - 또는 명령어:
     ```bash
     cd <이 폴더>
     git init -b main
     git add .
     git commit -m "A SMALL JRPG web build"
     git remote add origin https://github.com/<아이디>/<저장소>.git
     git push -u origin main
     ```
3. 저장소 *Settings → Pages* → **Build and deployment** 의 Source를 `Deploy from a branch`, Branch를 `main` / `(root)` 로 선택하고 Save.
4. 1~2분 뒤 `https://<아이디>.github.io/<저장소>/` 로 접속됩니다. 이 링크를 공유하면 됩니다.

### 폰에서 앱처럼 쓰기 (선택)
- iPhone/iPad: Safari → 공유 버튼 → **홈 화면에 추가**
- Android: Chrome 메뉴 → **홈 화면에 추가 / 앱 설치**

## 폴더 구성

```
index.html            진입 파일
style.css             스타일 (버튼 색 반응, 세로 방향 안내)
js/core.js            전투 계산·장비·적 데이터 (원본 DamageCalculator 등 이식)
js/ui.js              Unity uGUI(anchor 비율 배치, 글자 크기 보정) 모방 헬퍼
js/game.js            모든 화면과 게임 흐름
assets/*.png          원본 텍스처 7장 (수정 없이 추출)
icons/, manifest.webmanifest   홈 화면 아이콘
GAME_SPEC.md          게임 진행·행동 정리
```

## 원본과 달라진 점 (게임 내용은 동일)

- **게임 종료하기 / 해상도 선택**: PC 전용 기능이라 웹에서는 표시하지 않습니다. 전체 화면 토글은 지원하는 브라우저에서만 보입니다(iPhone Safari는 미지원).
- **저장 위치**: Unity `PlayerPrefs` 대신 브라우저 `localStorage`를 씁니다. PC 빌드의 저장 데이터와는 별개이고, 브라우저/기기마다 따로 저장됩니다. 사이트 데이터를 지우면 영구 골드도 초기화됩니다.
- **화면 배치**: 원본과 같은 비율(anchor) 값으로 배치합니다. 작은 화면에서도 읽히도록 글자는 최소 크기를 보장하고, 상자를 넘치는 글자는 자동으로 줄입니다.
- **터치**: 마우스 호버 효과(휴식하기 설명 등)는 터치 기기에서 항상 보이도록 했습니다.
- **원본의 특이 동작**(첫 공격 전 적 패널 직접 클릭 등)은 그대로 유지했습니다. 목록은 `GAME_SPEC.md` 7번 참고.

## 로컬에서 확인

```bash
python3 -m http.server 8000     # 이 폴더에서 실행 후 http://localhost:8000
```
`index.html`을 더블클릭해서 열어도 동작합니다.

## 검증한 내용

Chromium(Playwright)에서 1920×1080 · 1280×720 · 844×390 · 667×375 크기로, 타이틀 → 무기 선택 → 전투 → 이벤트 → 휴식(강화/휴식) → 어려운 전투 → 상점(구매·장착) → 보스 → 정산, 보스전 패배, 환생 상점(구매·초기화 화면)을 끝까지 진행해 콘솔 오류와 글자 넘침이 없는지 확인했고, 피해 계산은 원본 IL에서 읽은 공식(float32 연산 순서 포함)과 대조했습니다. 실제 iPhone/Android 기기에서의 확인은 아직 하지 못했습니다.
