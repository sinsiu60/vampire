extends Node2D
class_name ParrySeq
## 사격 패링 성공 시퀀스 (Config.parry_seq). 실제 시간 = 물리 틱(60) 기준.
##  k = 0 (패링한 틱)   parry_chang + 히트스톱 6틱 + 흰 섬광 + 노란 불꽃 / slowmo_in,
##                       시간 속도 1.0 → 0.1 (SLOWMO_IN 동안), 채도 감소 + 비네트
##  k = inTick          slowmo_loop 반복 시작, 노란 반사 궤적이 대상 쪽으로 게임 시간에 맞춰 뻗어감
##  k = returnTick      time_return 재생, slowmo 소리 LOOP_FADE 동안 줄이며 정지,
##                       시간 속도 0.1 → 1.0 (ease-in), 채도·비네트 복구, 화면 살짝 줌인
##  k = killTick        (= returnTick + time_return.wav 실제 길이) 반사탄 명중 → Main._reflect_hit
##
## Engine.time_scale 은 '다음 틱'부터 적용되므로 틱 k 에서 scale_at(k + 1) 을 미리 넣어 둔다
## → 틱 k 의 월드 delta = scale_at(k) × 1/60 (프로토타입과 같음).
## 이 노드는 TimeManager 바로 다음, 플레이어·적보다 먼저 틱을 받는다 (명중이 그 틱의 월드 갱신 전에 일어나게).

signal finished(target: Enemy, dir: float)   ## killTick: 반사탄 명중 시점

var active := false
var k := 0                       ## 패링한 틱부터 센 실제 틱 수
var target: Enemy = null         ## 반사 대상 (없으면 dir 방향으로 dist 까지)
var dir := 0.0
var dist := 0.0
var in_tick := 0
var return_tick := 0
var kill_tick := 0
var return_dur := 0.0

var _future := PackedFloat64Array()   # _future[j] = j 틱 이후 killTick 까지 월드가 쓸 게임 시간 합
var _grow_total := 1e-6
var _h_in: AudioStreamPlayer = null
var _h_loop: AudioStreamPlayer = null


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE   # 옵션 메뉴·F4 프레임 진행이면 멈춤 (히트스톱은 time_scale 이라 상관없음)
	process_physics_priority = -900
	z_index = 11


## 패링한 틱(k = 0)에 호출. hitstop_frames = 같은 틱에 건 히트스톱 (그동안 월드 시간 0)
func start(t: Enemy, d: float, ds: float, hitstop_frames: int) -> void:
	var P: Dictionary = Config.parry_seq
	var fps: int = Config.fps
	cancel()
	var len := Audio.length("time_return")
	return_dur = len if len > 0.0 else float(P.RETURN_FALLBACK)
	in_tick = roundi(P.SLOWMO_IN * fps)
	return_tick = roundi((P.SLOWMO_IN + P.SLOWMO_HOLD) * fps)
	kill_tick = return_tick + roundi(return_dur * fps)
	k = 0
	active = true
	target = t
	dir = d
	dist = ds
	# 반사 궤적이 게임 시간에 맞춰 뻗어가도록 (느릴 땐 천천히, 시간이 돌아오면 빠르게)
	_future = PackedFloat64Array()
	_future.resize(kill_tick + 1)
	_future[kill_tick] = 0.0
	for j in range(kill_tick, 0, -1):
		_future[j - 1] = _future[j] + (scale_at(j) / fps if j > hitstop_frames else 0.0)
	_grow_total = maxf(_future[in_tick - 1], 1e-6)
	var S: Dictionary = Config.audio
	_h_in = Audio.play("slowmo_in", S.SFX_SLOWMO_IN)
	_h_loop = null
	TimeManager.set_slow(scale_at(1))


## 틱 k 의 시간 속도
func scale_at(i: int) -> float:
	var lo: float = Config.parry_seq.SLOWMO_SCALE
	if i < in_tick:
		var u := float(i) / in_tick
		return 1.0 - (1.0 - lo) * (1.0 - (1.0 - u) * (1.0 - u))     # 1.0 → 0.1 (빠르게 감속)
	if i < return_tick:
		return lo                                                   # 유지
	if i < kill_tick:
		var u := float(i - return_tick) / (kill_tick - return_tick)
		return lo + (1.0 - lo) * u * u                              # 0.1 → 1.0 (ease-in)
	return 1.0


## 복귀 구간 진행도 0~1 (복귀 전 0)
func return_u() -> float:
	if not active or k < return_tick:
		return 0.0
	return clampf(float(k - return_tick) / (kill_tick - return_tick), 0.0, 1.0)


## 채도 감소·비네트 세기 0~1: 진입 동안 올라가고, 복귀 동안 원상복구
func fx_amount() -> float:
	if not active:
		return 0.0
	if k < in_tick:
		return float(k) / in_tick
	if k < return_tick:
		return 1.0
	return 1.0 - return_u()


## 반사 궤적이 뻗어간 정도 0~1 (SLOWMO_IN 부터)
func growth() -> float:
	if not active or k < in_tick:
		return 0.0
	return clampf(1.0 - _future[mini(k, kill_tick)] / _grow_total, 0.0, 1.0)


func _physics_process(_delta: float) -> void:
	if not active:
		return
	var P: Dictionary = Config.parry_seq
	var S: Dictionary = Config.audio
	k += 1
	if k == in_tick:
		_h_loop = Audio.play("slowmo_loop", S.SFX_SLOWMO_LOOP)
	if k == return_tick:
		Audio.play("time_return", S.SFX_TIME_RETURN)
		Audio.fade_out(_h_in, P.LOOP_FADE)
		Audio.fade_out(_h_loop, P.LOOP_FADE)
		_h_in = null
		_h_loop = null
	queue_redraw()
	if k >= kill_tick:
		# time_return 재생이 끝나는 바로 그 틱: 반사탄 명중
		active = false
		TimeManager.set_slow(1.0)
		var t := target
		target = null
		finished.emit(t if is_instance_valid(t) else null, dir)
		return
	TimeManager.set_slow(scale_at(k + 1))


## 재시작/사망/새 시퀀스: 소리 정리하고 정상 속도로
func cancel() -> void:
	Audio.fade_out(_h_in, 0.08)
	Audio.fade_out(_h_loop, 0.08)
	_h_in = null
	_h_loop = null
	target = null
	if active:
		TimeManager.set_slow(1.0)
	active = false
	queue_redraw()


## 슬로우 중: 플레이어에서 반사 대상 쪽으로 노란 반사 궤적이 뻗어감
func _draw() -> void:
	var u := growth()
	var p: Player = get_tree().get_first_node_in_group("player")
	if u <= 0.0 or p == null or p.dead:
		return
	var o := p.center()
	var ang := dir
	var len := dist
	if is_instance_valid(target) and not target.dead:
		ang = (target.center() - o).angle()
		len = o.distance_to(target.center())
	var h := o + Vector2.from_angle(ang) * len * u
	var col: Color = Config.colors.parry
	var w: float = Config.parry_seq.REFLECT_LINE_WIDTH
	draw_line(o, h, Color(col, 0.25), w + 2.0)        # 은은한 빛
	draw_line(o, h, Color(col, 0.85), w)
	draw_rect(Rect2(h.round() - Vector2.ONE, Vector2(2, 2)), col)
