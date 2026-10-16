extends Node
## 시간 관리 (오토로드).
## - 월드 시간 속도는 Engine.time_scale 로 처리: 히트스톱이면 0, 슬로우모션이면 그 배율.
## - Engine.time_scale = 0 이어도 물리 틱은 실제 시간으로 매번 오고 delta 만 0 이 된다 (4.5.1 에서 확인).
##   그래서 '실제 시간' 연출 타이머는 이 노드가 세는 real_frames / real_time 을 쓴다.
## - 이 노드는 다른 노드보다 먼저 물리 틱을 받는다 (process_physics_priority 가장 낮음).
## - time_scale 을 바꾸면 '다음 틱'부터 적용됨 → hitstop(n) 은 멈춘 틱만 세서 정확히 n 틱 정지.

signal real_tick                 ## 매 물리 틱 (실제 시간) — 연출 타이머용
signal kill_stop_released        ## 킬 스톱 마지막 틱 (다음 틱부터 월드가 다시 흐름) — 3겹 궤적 해제

var real_frames := 0             ## 실제 틱 수
var real_time := 0.0             ## 실제 경과 시간 (초) = real_frames / fps
var world_time := 0.0            ## 월드 시간 (슬로우·히트스톱이면 느리게/안 흐름) — 사격·패링 타이밍 기준
var frozen := false              ## 이번 틱 월드가 멈췄는가 (히트스톱 중). 게임 노드는 이때 입력만 모아 두고 아무것도 안 함
var kill_stopped := false        ## 이번 틱이 킬 스톱인가 — 월드는 멈추지만 빛줄기·불꽃·피 구름은 실제 시간으로 움직임

var _hitstop := 0                # 남은 정지 틱
var _slow := 1.0                 # 슬로우 배율 (패링 시퀀스가 세팅)
var _killstop := 0               # 남은 킬 스톱 틱
var _last_delta := 0.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_physics_priority = -1000


func reset() -> void:
	_hitstop = 0
	_killstop = 0
	kill_stopped = false
	_slow = 1.0
	world_time = 0.0
	_apply()
	frozen = false


## 다음 틱부터 n 틱 동안 월드 정지 (이미 더 길게 멈춰 있으면 그대로)
func hitstop(frames: int) -> void:
	if frames <= 0 or not Settings.on("hitstop"):
		return
	_hitstop = maxi(_hitstop, frames)
	_apply()


## 킬 스톱: 다음 틱부터 n 틱 동안 월드 정지 (히트스톱과 겹치면 긴 쪽). 끝나는 틱에 kill_stop_released
func kill_stop(frames: int) -> void:
	if frames <= 0 or not Settings.on("hitstop"):
		return
	_killstop = maxi(_killstop, frames)
	_apply()


## 이번 틱도 지금부터 멈춘 것으로 (월드 갱신 전에 일어난 처치 — 반사탄 명중). 이번 틱에 흐른 월드 시간은 되돌림
func freeze_now() -> void:
	if frozen:
		return
	frozen = true
	world_time -= _last_delta
	kill_stopped = _killstop > 0


func kill_stop_left() -> int:
	return _killstop


## 슬로우모션 배율 (1 = 정상). 히트스톱이 끝나면 이 배율로 돌아감
func set_slow(scale: float) -> void:
	_slow = clampf(scale, 0.0, 1.0)
	_apply()


func hitstop_left() -> int:
	return _hitstop


## 실제 시간 한 틱의 길이 (연출 타이머용)
func real_delta() -> float:
	return 1.0 / Config.fps


## time_scale 다시 계산 (F3 슬로우 전환 등)
func refresh() -> void:
	_apply()


func _physics_process(delta: float) -> void:
	# 옵션 메뉴·F4 프레임 진행으로 멈춘 틱은 세지 않음
	if get_tree().paused:
		return
	# delta 는 이미 time_scale 이 곱해진 값 (F3 슬로우면 틱이 드물게 오고 Debug.time_mul 로 1/60 이 됨)
	frozen = delta <= 0.0
	world_time += delta
	_last_delta = delta
	kill_stopped = frozen and _killstop > 0
	real_frames += 1
	real_time = real_frames * real_delta()
	# 실제로 멈춘 틱만 센다 → 언제 hitstop() 을 불렀든 정확히 n 틱 정지
	if frozen:
		if _hitstop > 0:
			_hitstop -= 1
		if _killstop > 0:
			_killstop -= 1
			if _killstop == 0:
				kill_stop_released.emit()
		_apply()       # 0 이 되면 다음 틱부터 다시 흐름
	real_tick.emit()


func _apply() -> void:
	Engine.time_scale = 0.0 if _hitstop > 0 or _killstop > 0 else _slow * Debug.time_mul()
