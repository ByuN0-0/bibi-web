# 비비봇 웹사이트

**비비봇 웹사이트**는 디스코드 봇 "비비봇"의 기능 및 사용법을 소개하고, 사용자들이 봇에 대한 정보를 쉽게 확인할 수 있도록 만든 단일 페이지 웹사이트 프로젝트
이 프로젝트는 **Next.js (App Router)** 와 **Tailwind CSS**를 사용하여 구축되었으며, 깔끔한 디자인과 부드러운 스크롤 애니메이션 효과를 제공

## 주요 기능

- **반응형 디자인**: 다양한 화면 크기에 최적화된 레이아웃
- **부드러운 스크롤**: 네비게이션 메뉴를 클릭하면 해당 섹션으로 부드럽게 이동
- **애니메이션 효과**: 그라데이션 배경 애니메이션 적용
- **섹션 구성**: 히어로 섹션, 소개, 명령어 목록, FAQ 등 비비봇의 핵심 기능 소개
- **LoL 내전 관리**: `/lol-statics`에서 선수, 전적 갱신, 팀 편성, 확정 기록 관리
- **공개 LoL 팀 편성**: `/lol-member`에서 로그인 없이 등록 선수 10명의 팀 편성 및 재편성
- **공개 LoL 내전 기록**: `/lol-history`에서 경기 목록과 아이콘 점수판 조회

## LoL 관리 화면

`/` 소개 페이지는 공개 상태로 유지되고 `/lol-statics/login`을 제외한
`/lol-statics/**` 페이지와 API는 8시간 HMAC 세션으로 보호됩니다.
브라우저는 Oracle SODA에 직접 연결하지 않으며 모든 데이터 요청은
Next.js Route Handler를 통합니다.

`/lol-member`는 공개 페이지이며 팀 편성 결과를 관리자 초안이나 확정 기록에
저장하지 않습니다. 공개 팀 편성 API는 동일 출처 요청만 허용하고 IP별 분당
10회로 제한합니다. 선수 관리 화면의 롤 계정 갱신은 웹 서버가 Riot API를
직접 호출하며 Discord 봇이 소비하는 `REQUESTED` 상태를 생성하지 않습니다.
동일 계정의 중복 호출을 막기 위해 웹이 `SYNCING` 상태를 선점한 경우에만
처리하며 Discord 명령과 동일하게 15분 제한이 적용됩니다. 최초 갱신만
Riot ID로 계정을 찾고, 이후에는 이름 변경과 무관한 PUUID로 조회한 뒤
최신 게임 이름과 태그를 계정 정보에 반영합니다.

Vercel Hobby의 함수 실행 제한에 맞춰 웹 갱신 함수는 최대 60초로 설정하고,
솔로 랭크와 자유 랭크에서 최근 경기 최대 16개를 수집합니다.

### 내전 결과 스크린샷 수집

표준 클라이언트 경기 종료 `점수판` 한 장을 프로젝트 스킬
`.agents/skills/bibi-ingest-lol-match`로 구조화한 뒤
`POST /api/internal/lol-match-results`로 전송합니다. 스크린샷 파일은 API나
Oracle SODA에 저장하지 않습니다.

- `Authorization: Bearer <BIBI_INGEST_TOKEN>` 헤더가 반드시 필요합니다.
- `action: "validate"`로 선수·게스트·최근 7일 내 확정 팀 연결을 먼저 확인합니다.
- 사용자가 분석 결과를 확인한 뒤 같은 `ingestionId`와 본문으로
  `action: "commit"`을 보내야 실제 저장됩니다.
- 숫자는 날짜·진행 시간, 팀 K/D/A·골드·목표물 6종, 개인 레벨·K/D/A·CS·골드만 저장합니다.
- 에셋은 챔피언, 핵심 룬, 소환사 주문, 아이템 6칸, 장신구, 퀘스트 슬롯, 밴 5칸만 저장합니다.
- 아이콘 에셋은 `{id,name,iconPath}`로 보내며 서버가 지정된 한국어 Data Dragon 버전과 대조합니다.
- 1팀/청록색 영역은 `BLUE`, 2팀/붉은색 영역은 `RED`로 기록합니다.
- 개인 K/D/A·골드 합계가 팀 합계와 다르거나 에셋이 카탈로그와 다르면 저장을 거절합니다.
- 최근 7일 내 등록 선수 8명 이상이 유일하게 일치하는 확정 팀에만 연결합니다.

요청 본문의 핵심 구조는 다음과 같습니다.

```json
{
  "action": "validate",
  "ingestionId": "고유한-요청-ID",
  "playedOn": "2026-08-01",
  "winner": "RED",
  "durationSeconds": 1970,
  "ddragonVersion": "16.15.1",
  "teamStats": [
    {
      "team": "BLUE",
      "kills": 36,
      "deaths": 46,
      "assists": 57,
      "goldTotal": 63584,
      "bans": [null, null, null, null, null],
      "objectives": {
        "turretsDestroyed": 3,
        "inhibitorsDestroyed": 0,
        "baronKills": 0,
        "dragonKills": 2,
        "riftHeraldKills": 0,
        "voidGrubKills": 0
      }
    },
    {
      "team": "RED",
      "kills": 46,
      "deaths": 36,
      "assists": 41,
      "goldTotal": 72745,
      "bans": [null, null, null, null, null],
      "objectives": {
        "turretsDestroyed": 11,
        "inhibitorsDestroyed": 2,
        "baronKills": 0,
        "dragonKills": 2,
        "riftHeraldKills": 1,
        "voidGrubKills": 3
      }
    }
  ],
  "participants": [
    {
      "team": "BLUE",
      "observedName": "화면에 보이는 닉네임",
      "champion": {"id": "Ahri", "name": "아리", "iconPath": "img/champion/Ahri.png"},
      "primaryPerk": {"id": "8112", "name": "감전", "iconPath": "perk-images/Styles/Domination/Electrocute/Electrocute.png"},
      "summonerSpells": [
        {"id": "SummonerFlash", "name": "점멸", "iconPath": "img/spell/SummonerFlash.png"},
        {"id": "SummonerTeleport", "name": "순간이동", "iconPath": "img/spell/SummonerTeleport.png"}
      ],
      "kills": 8,
      "deaths": 8,
      "assists": 7,
      "cs": 201,
      "level": 17,
      "goldEarned": 12507,
      "items": [null, null, null, null, null, null],
      "trinket": null,
      "questSlot": null
    }
  ]
}
```

실제 요청에는 `participants`를 BLUE 5명, RED 5명으로 정확히 10명 포함해야
합니다. 공개 결과는 `/lol-history`, 관리자 연결·수정 화면은 `/lol-statics/history`에서 확인합니다.

Vercel 프로젝트에 다음 환경변수를 등록합니다. 실제 비밀번호와 비밀키는
저장소에 커밋하지 않습니다.

| 변수 | 설명 |
| --- | --- |
| `ADMIN_USERNAME` | 관리자 아이디(기본 운영값 `bibi`) |
| `ADMIN_PASSWORD` | 10자 이상의 강한 관리자 비밀번호 |
| `SESSION_SECRET` | 32자 이상의 무작위 세션 서명 키 |
| `BIBI_INGEST_TOKEN` | 스크린샷 결과 수집 API용 32자 이상의 Bearer 토큰 |
| `BIBI_WEB_BASE_URL` | 로컬 Codex 스킬이 호출할 배포된 bibi-web HTTPS 주소(서버 런타임에는 불필요) |
| `SODA_BASE_URL` | Oracle SODA REST `/soda/latest` URL |
| `SODA_USERNAME` | Oracle SODA 사용자 이름 |
| `SODA_PASSWORD` | Oracle SODA 비밀번호 |
| `SODA_TIMEOUT_SECONDS` | SODA 요청 제한시간(1~60초, 기본 10초) |
| `RIOT_API_KEY` | 웹 계정 갱신에 사용하는 Riot API 키 |
| `RIOT_PLATFORM` | Riot 플랫폼 라우팅 값(현재 `kr`만 지원) |
| `RIOT_REGION` | Riot 지역 라우팅 값(현재 `asia`만 지원) |
| `RIOT_TIMEOUT_SECONDS` | Riot 요청 제한시간(1~60초, 기본 10초) |

```bash
npm test
npm run build
```

## 기술 스택

- **Next.js (App Router)**
- **React**
- **Tailwind CSS**
- **styled-jsx** (클라이언트 컴포넌트 내 CSS 관리)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
