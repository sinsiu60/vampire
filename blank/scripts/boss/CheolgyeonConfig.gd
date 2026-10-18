class_name CheolgyeonConfig
extends RefCounted
## 보스 "철견" 수치 전부 (1장, 하운드 제1 사냥개 부대장). 시간은 초 — 따로 적지 않으면 월드 시간
## (슬로우 · 히트스톱이면 같이 느려짐). 프레임 수는 60fps 물리 틱 기준.
## 철견은 걷지 않는다: 대시 · 슬라이드 · 점프로만 움직임. 예고는 짧고 선명하게 (포즈 · 섬광 · 소리).

# ---------------------------------------------------------------- 기본
const NAME := "철견"
const TITLE := "하운드 제1 사냥개"
## HP → 난이도 프리셋 Config.difficulty_presets 의 BOSS_HP
const W := 20.0                        ## 몸통 판정 너비 (px)
const H := 54.0                        ## 몸통 판정 높이 (모자 끝까지 약 56px)
const FIRST_DELAY := 0.5               ## (예전 값 — 지금은 OPEN_STILL / OPEN_STILL_RESTART)

# ---------------------------------------------------------------- 이동 (걷기 없음)
const DASH_PREP := 0.15                ## 대시 전 웅크림 예고
const DASH_SPEED := 450.0              ## 대시 속도 (px/초)
const DASH_GHOST_EVERY := 0.04         ## 대시 잔상 간격
const DASH_STOP := 0.06                ## 대시가 끝나고 멈추는 시간 (속도를 0 으로)
const SLIDE_SPEED := 250.0             ## 슬라이드 속도
const SLIDE_DUST_EVERY := 0.03         ## 슬라이드 먼지 간격
const MOVE_MAX := 0.4                  ## 패턴 사이 이동 하나의 최대 시간 (이보다 멀면 거기까지만)
const JUMP_PREP := 0.1                 ## 점프 전 웅크림
const JUMP_TIME := 0.38                ## 점프 체공 시간 (포물선)
const JUMP_ARC := 26.0                 ## 포물선 꼭대기 추가 높이 (오르는 높이에 더함)
const LAND_TIME := 0.12                ## 착지 웅크림
const MOVE_GAP := 0.3                  ## (1단계 이동 데모) 이동 사이 정지
const DEMO_NEAR := 54.0                ## (데모) 다가갈 때 플레이어 앞 거리
const DEMO_PASS := 70.0                ## (데모) 슬라이드로 지나쳐 갈 거리
const DEMO_BACK := 110.0               ## (데모) 뒤로 빠지는 대시 거리
const EDGE := 20.0                     ## 방 양 끝 벽에서 이만큼 안쪽까지만 이동

# ---------------------------------------------------------------- 휘청 → 반격 (핵심)
## STAGGER_TIME → 난이도 프리셋 Config.difficulty_presets 의 STAGGER_TIME
const STAGGER_BLINK := 0.06            ## 휘청 중 흰 테두리 깜빡임 주기 (켜짐/꺼짐 각각)
## COUNTER_LUNGE_RANGE → 난이도 프리셋 Config.difficulty_presets 의 COUNTER_LUNGE_RANGE
const COUNTER_LUNGE_TIME := 0.08       ## 자동 돌진 시간
const COUNTER_STOP := 15.0             ## 돌진이 멈추는 거리 (철견 몸 중심에서)
const COUNTER_HITSTOP := 8             ## 반격 명중 히트스톱 (프레임)
const COUNTER_SHAKE := 6.0             ## 반격 명중 화면 흔들림 (px)
const COUNTER_SHAKE_TIME := 0.25
const COUNTER_KNOCKBACK := 30.0        ## 반격 명중 철견 넉백 거리 (px)
const KNOCKBACK_TIME := 0.15           ## 넉백 시간 (감속하며 미끄러짐)
const COAT_SHARDS := 7                 ## 코트 조각 파편 수

# ---------------------------------------------------------------- 막기 (휘청 아닐 때 베면)
const BLOCK_TIME := 0.22               ## 막는 자세 유지
const BLOCK_PLAYER_STUN := 0.2         ## 플레이어 경직
const BLOCK_PUSH := 140.0              ## 플레이어가 밀려나는 속도 (px/초)
const BLOCK_PITCH := 1.15              ## boss_armor 피치

# ---------------------------------------------------------------- 패링 (이 보스전)
const PARRY_HITSTOP := 5               ## 일반 패링 (콤보 중간 공격) 히트스톱
const PARRY_SLOW := 0.5                ## 일반 패링 뒤 시간 속도
const PARRY_SLOW_TIME := 0.1           ## 그 지속 (실제 시간)
## 풀 패링 슬로우 시퀀스 (slowmo_in → loop → time_return) 는 페이즈 전환에만

# ---------------------------------------------------------------- 사격 공통 (히트스캔 · 조준선 · 줄어드는 원)
const SHOT_PITCH := 0.85               ## gun_fire 피치 (일반 적보다 묵직하게)
const AIM_LOCK := 0.15                 ## 발사 이 시간 전부터 조준 고정 (흰 깜빡임)
const LASER_ALPHA_MIN := 0.3
const LOCK_BLINKS := 2
const LOCK_BLINK_TIME := 0.03
const REFLECT_PITCH := 0.9             ## 반사탄이 철견에 맞아 휘청 — boss_armor 피치

# ---------------------------------------------------------------- 패턴 ① 슬라이드 사격
const SLIDE_SHOT_MIN_DIST := 120.0     ## 이 거리 이상일 때만 (가까우면 먼저 물러나는 대시)
## SLIDE_SHOT_PREP → 난이도 프리셋 Config.difficulty_presets 의 TELEGRAPH_TIME
const SLIDE_SHOT_COUNT := 3            ## 연발 수 (페이즈 2: 4 — 3단계)
const SLIDE_SHOT_FIRST := 0.25         ## 슬라이드 시작 → 첫 발
## SLIDE_SHOT_GAP → 난이도 프리셋 Config.difficulty_presets 의 SLIDE_SHOT_INTERVAL
const SLIDE_SHOT_AIM := 0.45           ## 탄마다 원이 줄어드는 시간 (패턴 시작보다 일찍 시작하지는 않음)
const SLIDE_SHOT_PASS := 80.0          ## 플레이어를 지나쳐 이만큼 반대편까지 미끄러짐
const SLIDE_SHOT_MAX := 1.4            ## 슬라이드 최대 시간
const SLIDE_SHOT_RECOVER := 0.4        ## 마지막 탄 뒤 플레이어 뒤쪽에서 정지 → 곧바로 다음 패턴 (이 정지가 패턴 사이 공백 대신)

# ---------------------------------------------------------------- 패턴 ② 돌진 건카타
const WHIP_STOP := 30.0                ## 플레이어 앞 이 거리까지 대시 (몸 중심끼리)
const WHIP_DASH_MAX := 0.45            ## 그 대시 최대 시간
const WHIP_WINDUP := 0.2               ## 1타 예고 (whip_windup, 권총 빨간 점멸)
## WHIP_GAP → 난이도 프리셋 Config.difficulty_presets 의 WHIP_INTERVAL
const WHIP_DELAY := 0.5                ## 3타: whip_windup 으로 멈칫하는 시간 (지연 공격)
const WHIP_REWIND := 0.05              ## 내려친 뒤 다음 예고 자세로 돌아가기까지
const WHIP_FLASH := 0.2                ## 내려치기 전 권총이 빨갛게 점멸하는 시간
const WHIP_ACTIVE := 0.07              ## 내려치기 판정 시간
const WHIP_BOX := Vector2(30, 46)      ## 판정 (몸 앞)
const WHIP_LUNGE := 12.0               ## 내려칠 때 앞으로 돌진 (px)
const WHIP_LUNGE_TIME := 0.05
const WHIP_SHAKE := 4.0                ## 내려칠 때 화면 흔들림
const WHIP_TRAIL := Color("#9AA0B4")   ## 회색 반달 궤적
const WHIP_TRAIL_TIME := 0.1
const WHIP_RECOVER := 0.2              ## 3타 뒤 여운
const WHIP_PARRY_KNOCK := 320.0        ## 3타 패링: 크게 튕겨나는 속도 (휘청하며 미끄러짐)

# ---------------------------------------------------------------- 패턴 ④ 속사 (짧은 결투)
const DUEL_MIN_DIST := 110.0           ## 이보다 가까우면 먼저 물러나는 대시
const DUEL_HOLD_MIN := 0.4             ## duel 포즈 정적
const DUEL_HOLD_MAX := 0.8
const DUEL_TWITCH := 0.1               ## 움찔 (진짜) → 이 뒤 원 시작
## DUEL_DRAW → 난이도 프리셋 Config.difficulty_presets 의 QUICKDRAW_RING_TIME
const DUEL_RECOVER := 0.2              ## 쏜 뒤 여운

# ---------------------------------------------------------------- 페이즈 1 루프 (체력 9 ~ 7)
const P1_ORDER := [1, 2, 4]            ## 순서 고정: 슬라이드 사격 → 돌진 건카타 → 속사
## P1_GAP → 난이도 프리셋 Config.difficulty_presets 의 PATTERN_GAP
const REPOSITION_MAX := 0.23           ## 자리 잡는 대시 최대 시간 (웅크림 0.15 + 이것 ≤ 0.4)
const PATTERN_NAMES := { 1: "① 슬라이드 사격", 2: "② 돌진 건카타", 3: "③ 점프 사격", 4: "④ 속사", 5: "⑤ 도탄 사격" }

# ---------------------------------------------------------------- 패턴 ③ 점프 사격 (페이즈 2부터)
## JS_PREP → 난이도 프리셋 Config.difficulty_presets 의 TELEGRAPH_TIME
const JS_TIME := 0.85                  ## 체공 (포물선)
const JS_HEIGHT := 92.0                ## 높이 뛰어오름 (px)
const JS_LAND_OFFSET := 56.0           ## 플레이어에서 이만큼 떨어진 곳에 착지 (내 쪽)
const JS_SHOTS := [0.3, 0.55]          ## 뛰어오른 뒤 발사 시각 (간격 0.25초) — 공중에서 아래 대각선
const JS_AIM := 0.3                    ## 원이 줄어드는 시간
## JS_WAVE_SPEED → 난이도 프리셋 Config.difficulty_presets 의 SHOCKWAVE_SPEED
const JS_WAVE_H := 8.0                 ## 충격파 높이 (바닥에서)
const JS_WAVE_RANGE := 300.0           ## 충격파가 사라지는 거리
const JS_LAND_PITCH := 1.4             ## 착지 쿵: explosion.wav 피치
const JS_LAND_VOL := 0.5
const JS_LAND_SHAKE := 5.0
const JS_OPEN := 0.7                   ## 착지 후 "빈틈" = 휘청과 같이 반격 가능 (흰 테두리 + 머리 위 글자)
const JS_OPEN_LABEL := "빈틈"

# ---------------------------------------------------------------- 패턴 ⑤ 도탄 사격 (페이즈 2부터)
const RS_PREP := 0.2                   ## aim_up 예고 + boss_armor.wav (피치 1.5, 금속 "팅")
const RS_TING_PITCH := 1.5
const RS_FIRST := 0.5                  ## 예고 시작 → 1번째 발사
const RS_GAP := 0.4                    ## 2연발 간격
const RS_AIM := 0.5                    ## 원이 줄어드는 시간 (원은 플레이어 몸 둘레 + 날아오는 방향 화살표)
const RS_MIN_ANGLE := 10.0             ## 반사면에 너무 비스듬하면 안 씀 (°)
const RS_RECOVER := 0.2
## 방향 패링 각도 = Config.shot.DIRECTIONAL_PARRY_ANGLE (60°)

# ---------------------------------------------------------------- 건카타 발차기 (페이즈 2부터 2타 대신 섞임)
const KICK_CHANCE := 0.5               ## 2타가 발차기로 바뀔 확률
const KICK_READY := 0.3                ## kick_ready — 다리 보라색 발광 (패링 불가, 점프로 피함)
const KICK_ACTIVE := 0.1
const KICK_BOX := Vector2(34, 20)      ## 발차기 판정 (바닥 근처 — 점프하면 넘음)
const KICK_LUNGE := 16.0

# ---------------------------------------------------------------- 속사 가짜 움찔 (페이즈 2부터)
## FAKE_CHANCE → 난이도 프리셋 Config.difficulty_presets 의 FAKE_TWITCH_CHANCE
const FAKE_MAX := 1
const FAKE_WINDOW := 0.3               ## 가짜 움찔 뒤 이 시간 안에 베면 (헛스윙) → 즉시 사격
const FAKE_PUNISH := 0.12              ## 헛스윙 벌: 이 시간 뒤 바로 쏨 (원도 이 길이)

# ---------------------------------------------------------------- 페이즈 (체력: 1 = 9 ~ 7 · 2 = 6 ~ 4 폭우 · 3 = 3 ~ 1 정전)
## PHASE_HP → 난이도 프리셋 Config.difficulty_presets 의 BOSS_HP · PHASE_HP
const P2_PATTERNS := [1, 2, 3, 4, 5]   ## 무작위, 같은 패턴 연속 금지
## P2_GAP → 난이도 프리셋 Config.difficulty_presets 의 PATTERN_GAP
const P2_SLIDE_SHOTS := 4              ## 슬라이드 사격 4연발
## P3_GAP → 난이도 프리셋 Config.difficulty_presets 의 PATTERN_GAP
## P3_CHAIN → 난이도 프리셋 Config.difficulty_presets 의 P3_CHAIN

# ---------------------------------------------------------------- 페이즈 전환 연출 (실제 시간, 여기서만 긴 슬로우 · 레터박스)
const TR_SLOW := 0.3                   ## 전환 중 시간 속도
const TR_SLOW_IN := 0.3                ## 1.0 → TR_SLOW
const TR_LETTERBOX := 0.25             ## 레터박스 들어오는 / 나가는 시간
const LETTERBOX_H := 24.0              ## 레터박스 높이 (px, 위 · 아래)
const TR_ROAR_AT := 0.3                ## roar 포즈 + boss_intro 60%
const TR_ROAR_VOL := 0.6
## 1 → 2: 물탱크를 쏨 → 폭발 → 폭우 → 네온 간판 떨어짐
const TR2_SHOOT_AT := 1.0
const TR2_RAIN_AT := 1.35
const TR2_SIGN_AT := 1.6
const TR2_RETURN_AT := 2.3             ## time_return
const TR2_END := 2.9
const TR2_LINE := "…재밌군."
const TR_TANK_SHAKE := 8.0
## 2 → 3: 조명 3개를 차례로 쏨 → 마지막이 깨지며 flashbang + 하얀 화면 0.2초 → 정전
const TR3_LIGHTS_AT := [0.9, 1.25, 1.6]
const TR3_WHITE := 0.2
const TR3_MUFFLE := 0.8                ## flashbang "삐-" 여운 동안 다른 효과음 로우패스
const TR3_RETURN_AT := 2.4
const TR3_END := 3.0
const TR3_LINE := "불 꺼. 어둠 속에서도 맞힐 수 있나 보자."
const LINE_TIME := 2.2                 ## 대사 표시 시간 (실제 시간)
const LINE_CPS := 18.0

# ---------------------------------------------------------------- 오프닝 (짧게, 실제 시간 — 처음 들어올 때만 이름 카드 · 대사)
const OPEN_STILL := 1.5                ## 입력 잠금 + 레터박스 + 빗소리만, 정적
const OPEN_STILL_RESTART := 0.5        ## 재시작: 이름 카드 · 대사 없이 이 정적만
const CARD_SCALES := [1.9, 1.35, 1.1]  ## 이름 카드가 박히는 3프레임 확대 → 1배 (첫 프레임에 boss_intro)
const CARD_HOLD := 1.5
const CARD_FADE := 0.3
const CARD_SHAKE := 5.0
const OPEN_LINE := "등록도 안 된 놈이… 칼을 들고 왔다고?"
const OPEN_LINE_AT := 0.9              ## 카드 뒤 대사 시작
const OPEN_DUEL_AT := 3.0              ## 카드 뒤 속사 한 판 시작 (대사가 끝날 즈음)
const OPEN_DUEL_HOLD := 0.6            ## 오프닝 속사 정적 (가짜 움찔 없음)
const GUN_FLY_TIME := 0.5              ## 패링하면 권총이 손에서 튕겨나가 뒤로 날아감
const GUN_FLY_DIST := 72.0
const GUN_FLY_HEIGHT := 46.0
const OPEN_PICKUP := 0.28              ## 뒤로 대시해 집는 웅크림
const OPEN_DODGE_AT := 0.3             ## 오프닝 속사를 구르기로 피함 → 발사 이 뒤 대사 (패링 판정이 끝난 뒤)
const OPEN_DODGE_LINE := "피하기만 할 거냐?"
const OPEN_DODGE_WAIT := 1.4           ## 대사 → 레터박스 해제 · 페이즈 1

# ---------------------------------------------------------------- 피날레 (체력 0)
const FINALE_LINE := "마지막이다. 뽑아라."
const FINALE_SPOT_R := 72.0            ## 정전 속 피날레: 두 사람 둘레만 보이는 빛
const FINALE_SPOT := 0.85

# ---------------------------------------------------------------- 피날레 "멈춘 총알" 흑백 결투 (FinaleDuel — 모두 실제 시간)
## 실패하지 않는 연출: 클릭은 방아쇠일 뿐 결과는 항상 일섬. 이동 · 구르기 · 점프 불가, 피격 없음
## 흑백 세계에서 철견의 빨간 총알이 날아오며 시간이 서서히 느려져 공백 눈앞에서 멈추고, 클릭하면 멈춘 시간 속에서 공백만 움직여
## 총알을 가르고 철견을 관통 → 납도 "착" 과 함께 시간 · 색이 한 번에 돌아옴
const FIN_RESTART_GAP := 70.0          ## 재시작 · F12 로 피날레부터: 플레이어를 철견 옆 이 거리에 (마지막 반격 직후처럼)
## 흑백 (화면 후처리 — 빗방울 · 총알 · 2겹 원 · 일섬 흰 선은 색 유지)
const FIN_GRAY_IN := 1.5               ## 2) 대치 시작부터 이 시간에 걸쳐 채도 1 → 0
const FIN_CONTRAST := 1.2              ## 흑백 대비 (1.0 → 이 값)
const FIN_CONTRAST_DECEL := 1.3        ## 7) 감속 동안 더 강하게
const FIN_CONTRAST_PIVOT := 0.12       ## 대비 기준 밝기 (어두운 화면이라 0.5 대신 — 어둠이 새까맣게 뭉개지지 않게)
const FIN_VIGNETTE := 0.75             ## 7) 감속 동안 화면 가장자리가 이만큼 짙어짐
## 1) 정적
const FIN_STILL := 2.0
const FIN_RISE_AT := 0.4               ## 정적 시작 → 일어나기 시작 (stagger → idle 천천히)
const FIN_RISE := 1.3                  ## 일어나는 데 걸리는 시간
const FIN_LETTERBOX_IN := 0.8          ## 레터박스 진입
const FIN_SFX_FADE := 0.5              ## 다른 효과음 페이드아웃
const FIN_RAIN_VOL := 0.5              ## rain_loop 만 이 볼륨으로
const FIN_HEARTBEAT_VOL := 0.6         ## heartbeat.wav 반복 (정적 ~ 움찔)
## 2) 대치
const FIN_FACE := 2.5
const FIN_FACE_DIST := 260.0           ## 공백 ↔ 철견 거리 (화면 양 끝 — 가운데는 카메라가 벽에 막히지 않는 곳)
const FIN_STEP_BACK := 0.9             ## 철견이 자리로 물러나는 시간 (멀면 FIN_STEP_SPEED 로) · 공백도 반대쪽 자리로 걸어 물러섬
const FIN_STEP_SPEED := 180.0
const FIN_ZOOM := 1.15                 ## 카메라 줌 1.0 → 이 값 (대치 동안 천천히)
const FIN_LINE_AT := 0.5               ## 대치 시작 → 대사 "마지막이다. 뽑아라."
## 3) 번개
const FIN_FLASH := 0.5
const FIN_THUNDER_DELAY := 0.3         ## 흰 화면 1프레임 → 이 뒤 thunder.wav
## 4) 움찔 (가짜 — 이 구간 클릭은 무시, 버퍼에도 안 남김)
const FIN_TWITCH := 1.5
const FIN_TWITCH_AT := [0.35, 0.95]    ## 손가락 움찔 2회 (0.6초 간격)
const FIN_TWITCH_LEN := 0.1
const FIN_CAM_LEAN := 20.0             ## 카메라가 철견 쪽으로
const FIN_CAM_LEAN_TIME := 0.5
## 5) 빗방울
const FIN_DROP := 1.2                  ## 모자 챙 끝 → 바닥 (아주 느리게)
const FIN_DROP_SIZE := Vector2(2, 3)
const FIN_DROP_COLOR := Color("#7fd8ff")
const FIN_DROP_RAIN_MUL := 0.1         ## 빗줄기 속도 10%
const FIN_DROP_RAIN_VOL := 0.2
const FIN_DROP_CAM := 8.0              ## 빗방울을 따라 카메라가 아래로
## 6) 철견의 발사 (빗방울 착지 = 발사, 눈에 보이는 투사체)
const FIN_RIPPLE := 0.45               ## 바닥 물결 원 (시간 · 반지름)
const FIN_RIPPLE_R := 12.0
const FIN_GUN_PITCH := 0.85            ## gun_fire.wav
const FIN_TAIL := 10.0                 ## 총알 꼬리 길이 (속도에 따라 짧아짐)
## 7) 감속: 시간 속도 1.0 → 0.0 (ease-out) — 총알이 공백 앞 FIN_BULLET_AHEAD px 에서 정확히 멈추게 남은 거리로 계산
const FIN_DECEL := 1.0
const FIN_BULLET_AHEAD := 14.0
## 8) 멈춘 총알 (입력 대기)
const FIN_SLOWMO_LOOP_VOL := 0.4       ## slowmo_loop.wav 반복 (그 외 무음)
const FIN_BREATH := 1.4                ## 총알 · 2겹 원이 숨쉬듯 밝아졌다 어두워지는 주기 (초)
const FINALE_HINT_TIME := 3.0          ## 멈춘 뒤 이 시간 입력이 없으면 원이 한 번 크게 번쩍 (힌트)
const FINALE_AUTO_TIME := 5.0          ## 멈춘 뒤 이 시간이면 자동 일섬
const FIN_HINT_FLASH := 0.35
## 9) 일섬 — 멈춘 시간 속에서 공백만: 이동하는 모습 없이 순간이동하듯 철견 뒤편으로 (잔상만 남음)
const FIN_CUT_TIME := 0.25             ## 순간이동 뒤 베어낸 끝 자세로 멈춰 있는 시간 (→ 납도)
const FIN_CUT_ZOOM := 1.7              ## 클릭(반격) 순간 카메라가 공백을 확대
const FIN_CUT_ZOOM_IN := 0.1           ## 확대되는 시간
const FIN_CUT_ZOOM_OUT := 0.4          ## 시간 재개 뒤 대치 화면으로 돌아가는 시간
const FIN_CUT_ZOOM_Y := -10.0          ## 확대 중심: 공백 몸 중심에서 위로
const FIN_SMEAR_FRAMES := 2            ## 클릭 순간 스미어 프레임 (흑백 위 색으로): 출발점 → 철견 뒤까지 뜨거운 궤적 + 크게 늘어난 공백 + 가시 → 그다음 흑백 반전
const FIN_SMEAR_STRETCH := 3.2
const FIN_SMEAR_SQUASH := 0.55
const FIN_SMEAR_BACK := 8.0
const FIN_SMEAR_SPIKES := 10
const FIN_SMEAR_SPIKE_LEN := Vector2(18.0, 48.0)
const FIN_SMEAR_TRAIL_W := 9.0
const FIN_SMEAR_CHROMA := 2.0
const FIN_CUT_BEHIND := 40.0           ## 철견 뒤편 이 거리까지
const FIN_GHOSTS := 6                  ## 이동 경로 잔상
const FIN_INVERT_FRAMES := 2           ## 철견을 지나는 순간 흑백 반전 (흰 배경 + 검은 실루엣)
const FIN_LINE_W := 3.0                ## 화면을 가로지르는 흰 선 (정지 동안 그대로)
const FIN_HALF_GAP := 2.0              ## 갈라진 총알 두 조각이 위아래로 벌어진 거리 (정지 동안)
const FIN_QI_THICK := 13.0             ## 검기 (하늘 · 분홍 · 흰 3겹 초승달 띠, 흑백에서도 색 유지) — 실제 시간으로 움직이고 금방 사라짐
const FIN_QI_BULGE := 7.0
const FIN_QI_OVER := 18.0              ## 검기가 출발점 · 도착점 너머로 뻗는 길이
const FIN_QI_SWEEP := 0.06             ## 출발점 → 도착점으로 뻗어 나가는 시간
const FIN_QI_PUNCH := 0.4              ## 뻗은 직후 두께가 이만큼 더 부풀었다 돌아옴
const FIN_QI_PUNCH_TIME := 0.16
const FIN_QI_HOLD := 0.14              ## 꽉 찬 채 일렁이는 시간 (뻗기 포함) → 꼬리부터 머리 쪽으로 걷히며 사라짐
const FIN_QI_TIME := 0.5               ## 일섬 순간부터 검기가 다 사라질 때까지
const FIN_QI_BITS := 22                ## 걷힐 때 떨어져 나가는 색 조각
const FIN_SPARKS := 30                 ## 철견을 지나는 순간 불꽃 (정지 동안 공중에 멈춤)
## 10) 여세 + 납도: 일섬 끝 자세로 조금씩 앞으로 미끄러지며 시간이 0 → 1 로 서서히 돌아옴 → 마지막에 칼을 칼집에
const FIN_DRIFT := 1.2                 ## 여세 시작 → 납도 "착" (= 시간 1.0 · 색 복귀) 까지
const FIN_DRIFT_DIST := 22.0           ## 앞으로 미끄러지는 거리 (점점 느려지며 멈춤)
const FIN_DRIFT_SLIDE := 0.8           ## 미끄러지는 시간 (여세 시작부터)
const FIN_DRIFT_SCALE0 := 0.03         ## 여세 시작 시간 속도 → 1.0 (ease-in, 지수 FIN_DRIFT_POW)
const FIN_DRIFT_POW := 2.0
const FIN_SHEATHE := 0.45              ## 마지막 이 시간 동안 칼을 칼집에 — sheathe 의 "착" = 납도 끝 = 시간 1.0
## 11) 시간 재개 + 색 복귀 (같은 프레임)
const FIN_SPLIT_SPEED := 420.0         ## 갈라진 두 조각이 공백이 서 있던 자리 양옆으로 날아가는 속도
const FIN_SPLIT_SPREAD := 220.0
const FIN_CUT_FLASH := 0.25            ## 철견 몸의 대각선 흰 선
const FIN_KILL_SHAKE := 8.0
## 12) 쓰러짐
const FIN_FALL := 2.0
const FIN_DOWN_LINE := "…빠르군."
const FIN_DOWN_LINE_AT := 0.35
const FIN_KNEEL_AT := 0.9              ## 무릎 꿇음 (land 포즈)
const FIN_TOPPLE_AT := 1.3             ## 앞으로 쓰러짐 (발을 축으로 회전)
const FIN_TOPPLE_TIME := 0.5
const FIN_HAT_VEL := Vector2(-240.0, -230.0)   ## 페도라: 바람(빗줄기 방향)에 날려 화면 밖으로
const FIN_GUN_VEL := Vector2(60.0, -150.0)     ## 쌍권총: 손에서 떨어져 바닥에 튕김
## 13) 여운
const FIN_AFTER := 2.0                 ## 번개 + 무전 → 이 뒤 출구 문 열림 (door_boss.wav)
const FIN_CAM_RETURN := 1.2            ## 카메라가 플레이어를 다시 따라가기까지
# ---------------------------------------------------------------- 무대 (BossArena)
const RAIN_COUNT := 70                 ## 화면 안 빗줄기 수 (폭우 = 2배)
const RAIN_SPEED := 420.0
const RAIN_LEN := 7.0
const RAIN_COLOR := Color(0.55, 0.65, 0.85, 0.22)
const DARKNESS := 0.9                  ## 정전 어둠 (0 ~ 1)
const MUZZLE_LIGHT_R := 80.0           ## 총구 섬광 빛 반지름 (정전 중 주변이 보임)
const MUZZLE_LIGHT_TIME := 0.14
const LIGHTNING_P12 := Vector2(8.0, 15.0)   ## 번개 간격 (초) — 페이즈 1·2 (분위기용)
const LIGHTNING_P3 := Vector2(4.0, 6.0)     ## 페이즈 3
const LIGHTNING_SECOND := 0.1          ## 1프레임 하얗게 → 이 뒤 약하게 한 번 더
const LIGHTNING_THUNDER := 0.5         ## → 이 뒤 thunder.wav
const LIGHTNING_REVEAL := 0.35         ## 번개 뒤 어둠이 돌아오는 시간
const SIGN_SIZE := Vector2(10, 30)     ## 떨어진 네온 간판 (바닥 장애물 + 도탄 반사판)

# ---------------------------------------------------------------- 키포즈 (예고 정지 → 1프레임 전환 → 여운 정지)
const SNAP_GHOST_TIME := 0.16          ## 전환 순간 남는 이전 포즈 잔상 수명
const SNAP_GHOST_ALPHA := 0.55
const SMEAR_FRAMES := 1                ## 스미어(이전·다음 포즈를 잇는 덩어리)가 보이는 틱 수
const SMEAR_ALPHA := 0.45
const SMEAR_MIN_MOVE := 3.0            ## 이보다 덜 움직인 부위는 스미어 없음 (px)
const GHOST_TIME := 0.14               ## 대시 잔상 수명
const GHOST_ALPHA := 0.45
const BLEND_MOVE := 0.06               ## 이동 포즈끼리 (공격이 아닌 것) 부드럽게 바꾸는 시간

# ---------------------------------------------------------------- 색 (몸에 빨강 · 노랑 · 흰색 · 보라 금지)
const COL_BODY := Color("#121a33")     ## 몸통 · 머리
const COL_COAT := Color("#0b1124")     ## 코트 자락
const COL_LIMB_FRONT := Color("#1a2445")
const COL_LIMB_BACK := Color("#0e152c")
const COL_HAT := Color("#0a0f1f")
const COL_GUN := Color("#2b3552")
const COL_RIM := Color("#8294C8")      ## 림라이트 (Palette.RIM — 빛 받은 가장자리 · 조각 테두리)
const LIGHT_DARK_STRENGTH := 0.35      ## 조명이 모두 꺼졌을 때 위쪽 림라이트 세기 (몸 명암 셰이더)
const COL_RIM_FLASH := Color("#ffffff") ## 휘청 중 깜빡이는 흰 테두리
const COL_GHOST := Color("#7aa6e6")    ## 잔상 · 스미어 색
const COL_DUST := [Color("#3a4058"), Color("#545a72"), Color("#2a2f44")]
const COL_GUN_FLASH := Color("#ff2b3d") ## 권총 빨간 점멸 (공격 예고 — 몸 색이 아님)
const COL_KICK := Color("#b14dff")     ## 발차기 · 충격파 보라 (패링 불가 예고)

# ---------------------------------------------------------------- 배경음
const RAIN_VOL := 0.35                 ## 보스방 빗소리 (Config.audio.SFX_RAIN 과 같게)
const RAIN_VOL_STORM := 0.6            ## 페이즈 2 폭우 (3단계)
const RAIN_FADE := 0.6                 ## 빗소리 페이드인 (실제 시간)


# ---------------------------------------------------------------- 처치 뒤 (피날레 쓰러짐 → 무전 · 출구, 시간은 FinaleDuel 이 FIN_FALL · FIN_AFTER 로 정함)
const RADIO_DELAY := 1.0               ## 처치 → 잡음 무전 (실제 시간)
const RADIO_TEXT := "철견 처리 확인. ...공백, 너 방금 웃었어?"
const RADIO_TIME := 3.2
const EXIT_DELAY := 3.0                ## 처치 → 출구 문 열림 (무전 2초 뒤, door_boss.wav)

# ---------------------------------------------------------------- 포즈 (CheolgyeonBody.tscn 의 AnimationPlayer 애니메이션 이름)
## F9 포즈 뷰어 순서 = 숫자 키 1 ~ 0, Shift+1 ~ 8
const POSES := ["idle", "dash", "slide", "whip_windup", "whip_smash", "kick_ready", "kick", "jump", "air_fire", "land",
	"duel", "draw_fire", "aim_up", "stagger", "roar", "crouch", "block", "twitch"]
