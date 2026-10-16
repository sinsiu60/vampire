extends Node
## 시간 관리 (오토로드).
## - 월드 시간 속도는 Engine.time_scale 로 처리: 히트스톱이면 0, 슬로우모션이면 그 배율.
## - Engine.time_scale = 0 이어도 물리 틱은 실제 시간으로 매번 오고 delta 만 0 이 된다 (4.5.1 에서 확인).
##   그래서 '실제 시간' 연출 타이머는 이 노드가 세는 real_frames / real_time 을 쓴다.
## - 이 노드는 다른 노드보다 먼저 물리 틱을 받는다 (process_physics_priority 가장 낮음).
## - time_scale 을 바꾸면 '다음 틱'부터 적용됨 → hitstop(n) 은 멈춘 틱만 세서 정확히 n 틱 정지.

signal real_tick                 ## 매 물리 틱 (실제 시간) — 연출 타이머용

var real_frames := 0             ## 실제 틱 수
var real_time := 0.0             ## 실제 경과 시간 (초) = real_frames / fps
var world_time := 0.0            ## 월드 시간 (슬로우·히트스톱이면 느리게/안 흐름) — 사격·패링 타이밍 기준
var frozen := false              ## 이번 틱 월드가 멈췄는가 (히트스톱 중). 게임 노드는 이때 입력만 모아 두고 아무것도 안 함

var _hitstop := 0                # 남은 정지 틱
var _slow := 1.0                 # 슬로우 배율 (패링 시퀀스가 세팅)


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_physics_priority = -1000


func reset() -> void:
	_hitstop = 0
	_slow = 1.0
	world_time = 0.0
	frozen = false
	Engine.time_scale = 1.0


## 다음 틱부터 n 틱 동안 월드 정지 (이미 더 길게 멈춰 있으면 그대로)
func hitstop(frames: int) -> void:
	if frames <= 0:
		return
	_hitstop = maxi(_hitstop, frames)
	_apply()


## 슬로우모션 배율 (1 = 정상). 히트스톱이 끝나면 이 배율로 돌아감
func set_slow(scale: float) -> void:
	_slow = clampf(scale, 0.0, 1.0)
	_apply()


func hitstop_left() -> int:
	return _hitstop


## 실제 시간 한 틱의 길이 (연출 타이머용)
func real_delta() -> float:
	return 1.0 / Config.fps


func _physics_process(delta: float) -> void:
	# delta 는 이미 time_scale 이 곱해진 값
	frozen = delta <= 0.0
	world_time += delta
	real_frames += 1
	real_time = real_frames * real_delta()
	# 실제로 멈춘 틱만 센다 → 언제 hitstop() 을 불렀든 정확히 n 틱 정지
	if _hitstop > 0 and frozen:
		_hitstop -= 1
		_apply()       # 0 이 되면 다음 틱부터 다시 흐름
	real_tick.emit()


func _apply() -> void:
	Engine.time_scale = 0.0 if _hitstop > 0 else _slow
