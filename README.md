# 연금의 심연 (Alchemic Abyss) — 설계 초안

## 모듈 구조
- `src/sim/` DOM 비의존 시뮬레이션 엔진 (테스트 가능)
  - `materials.ts` 재질 정의 테이블 / `reactions.ts` 반응 데이터 테이블
  - `world.ts` 그리드(SoA TypedArray), 청크+더티렉트, CA 업데이트, 온도, 전기 전도, 폭발
  - `particles.ts` 자유 입자(풀링) / `rigid.ts` 지지대 없는 고체 → 강체 낙하
- `src/render/` 렌더러(ImageData 직접 쓰기, 라이트맵, 시차 배경), 절차적 스프라이트/아이콘
- `src/game/` 플레이어, 주문/지팡이, 투사체, 적, 보스, 월드 생성, 성소
- `src/ui/` HUD, 인벤토리, 화면들 / `src/audio/` WebAudio 절차 합성

## 데이터 레이아웃 (셀 i = y*W+x)
`mat:Uint8` `shade:Uint8` `temp:Int16` `life:Uint16` `aux:Uint8` `charge:Uint8` `stamp:Uint8`

## 프레임 업데이트 순서
입력 → 플레이어 → 주문/투사체 → 적/보스 → 시뮬레이션(활성 청크, 아래→위, 좌우 교대) → 폭발 큐 →
자유 입자 → 강체 검사/낙하 → 카메라 → 렌더(배경→셀→엔티티→입자→조명) → UI → 오디오
