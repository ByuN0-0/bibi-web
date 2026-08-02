# 비비봇 웹사이트

**비비봇 웹사이트**는 디스코드 봇 "비비봇"의 기능 및 사용법을 소개하고, 사용자들이 봇에 대한 정보를 쉽게 확인할 수 있도록 만든 단일 페이지 웹사이트 프로젝트
이 프로젝트는 **Next.js (App Router)** 와 **Tailwind CSS**를 사용하여 구축되었으며, 깔끔한 디자인과 부드러운 스크롤 애니메이션 효과를 제공

## 주요 기능

- **반응형 디자인**: 다양한 화면 크기에 최적화된 레이아웃
- **부드러운 스크롤**: 네비게이션 메뉴를 클릭하면 해당 섹션으로 부드럽게 이동
- **애니메이션 효과**: 그라데이션 배경 애니메이션 적용
- **섹션 구성**: 히어로 섹션, 소개, 명령어 목록, FAQ 등 비비봇의 핵심 기능 소개
- **LoL 내전 관리**: `/lol-statics`에서 선수, 전적 갱신, 팀 편성, 확정 기록 관리

## LoL 관리 화면

`/` 소개 페이지는 공개 상태로 유지되고 `/lol-statics/login`을 제외한
`/lol-statics/**` 페이지와 API는 8시간 HMAC 세션으로 보호됩니다.
브라우저는 Oracle SODA에 직접 연결하지 않으며 모든 데이터 요청은
Next.js Route Handler를 통합니다.

Vercel 프로젝트에 다음 환경변수를 등록합니다. 실제 비밀번호와 비밀키는
저장소에 커밋하지 않습니다.

| 변수 | 설명 |
| --- | --- |
| `ADMIN_USERNAME` | 관리자 아이디(기본 운영값 `bibi`) |
| `ADMIN_PASSWORD` | 12자 이상의 강한 관리자 비밀번호 |
| `SESSION_SECRET` | 32자 이상의 무작위 세션 서명 키 |
| `SODA_BASE_URL` | Oracle SODA REST `/soda/latest` URL |
| `SODA_USERNAME` | Oracle SODA 사용자 이름 |
| `SODA_PASSWORD` | Oracle SODA 비밀번호 |
| `SODA_TIMEOUT_SECONDS` | SODA 요청 제한시간(1~60초, 기본 10초) |

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
