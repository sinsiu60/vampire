extends Node2D
## 메인: 지금 방(GameState.room_path) 을 불러와 배치, 출구 → 다음 방, 플레이어 배치, 카메라, 전투 판정, 사격(히트스캔)·타이밍 패링, 사망·클리어·즉시 재시작.
## 이 노드는 플레이어·적보다 늦게 물리 틱을 받는다 (process_physics_priority) → 모두 움직인 뒤 판정.
## 총잡이는 group "game" 으로 이 노드를 찾아 raycast_wall / should_hold_aim / fire_shot 을 부른다.
## 화면 흔들림·줌·섬광은 실제 시간 (히트스톱·슬로우 중에도 재생).

const CG := preload("res://scripts/boss/CheolgyeonConfig.gd")   # 철견 수치

var room: Room                    # GameState 의 지금 방 씬 (_ready 에서 불러옴, 노드 이름 "Room")
var boss: BossCheolgyeon          # 보스방이면 철견 (처치되면 null)
var _boss_outro := -1.0           # 철견 처치 뒤 실제 시간 (무전 1초 · 출구 2초), -1 = 없음
var letterbox := 0.0              # 레터박스 0~1 (철견 페이즈 전환 연출 — HUD 가 그림)
var _letterbox_to := 0.0
var cinematic := false            # 연출 중 (입력 잠금, 피격 없음)
var letterbox_time := -1.0        # 레터박스 들어오고 나가는 시간 (실제 초, -1 = CG.TR_LETTERBOX)
var cam_override := {}            # 연출 카메라 { center (전역), zoom } — 비어 있으면 플레이어를 따라감
var _cam_local := Vector2.ZERO
var _radio_at: float = CG.RADIO_DELAY
var _exit_at: float = CG.EXIT_DELAY
var _outro_radio := false
@onready var player: Player = $Player
@onready var background: Background = $Background   # 1장 공통 배경 · 비 (scenes/Background.tscn)
@onready var camera: Camera2D = $Player/Camera
@onready var effects: Effects = $Effects
@onready var seq: ParrySeq = $ParrySeq
@onready var screen_fx: ScreenFX = $ScreenFX/Rect
@onready var hud: HUD = $HUD/Text
@onready var menu: Menu = $HUD/Menu
@onready var debug_draw: DebugDraw = $DebugDraw
@onready var fade: ColorRect = $HUD/Fade

var game_state := "play"          # play | dead | clear
var pending_shots: Array = []     # 플레이어에 닿아 패링 입력을 기다리는 탄 { shooter, muzzle, fire_t, angle, parryable, attack_type, done }
var seq_active: bool:             # 패링 슬로우 시퀀스 중 — 그동안 총잡이는 발사를 미루고, 플레이어는 입력 잠금
	get: return seq.active
var zoom := 1.0                   # 시간 복귀 동안 살짝 줌인 → 명중 후 ZOOM_OUT_FRAMES 동안 원상복구
var _shake := { "amp": 0.0, "time": 0.0, "t": 0.0, "angle": 0.0 }   # 방향성 흔들림 (패링·사망)
var _kill_shake := { "f": 0, "total": 0, "angle": 0.0 }               # 킬 흔들림 (매 프레임 랜덤, 공격 방향 치우침)
var _shake_frame := -1            # 이번 틱 흔들림을 이미 갱신했으면 그 틱 번호
var gore: Gore
var entering := false             # Boot 가 검은 전환으로 들여보냄 → 자체 재시작 페이드 생략
var transitioning := false        # 출구로 나가는 중 (입력 잠금)
var open_msg_t := -1.0            # "출구가 열렸다" 표시 경과 (실제 시간, -1 = 없음)
var _exit_pending := false        # 방 클리어 → 마지막 적의 킬 연출이 끝나면 출구 보안 잠금 해제
var _radio := {}                  # 화면 아래 잡음 섞인 무전 한 줄 { text, t, dur } (철견 처치 뒤 등)
var _rumble := 0.0                # 이번 틱 미세 진동 (보스방 문 증기 구간) — 흔들림 갱신 때 쓰고 0 으로
var kill_frame := -1              # 마지막 처치 후 실제 틱 수 (F3/F4 표시, 처치 없으면 -1)
# F5 패링 입력 오차 표시: { text, ok, t } — 성공은 월드 시간, 실패 원인은 실제 시간 클릭 기준
var timing_msg := {}
var _last_click_real := -INF
var _chimed := {}                 # 기회 공격 '칭' 을 이미 울린 공격 { 쏘는 적 id: fire_t }
var _late_watch := {}             # 아직 안 누른 채 맞음 → 0.5초 안에 누르면 '+xxms 늦음'
var intros_shown: Array = []      ## 이 방에서 소개한 적 종류 (테스트)
var _intro_queue: Array = []      # 소개할 적 [Enemy]
var _intro := {}                  # 지금 소개 { e, t, from_c, from_z, to_c, to_z, locked }
var _intro_wait := -1.0           # 다음 소개까지 (실제 초)
var _toast := {}                  # 디버그 알림 한 줄 { text, t }
var burst_misses := 0             ## 연사병 첫 탄 패링 (반사탄이 벽에 빗나감) 수 — 테스트
var blocks := 0                   ## 돌격병이 막아낸 베기 수 — 테스트
var grenade_bats := 0             ## 수류탄 되치기 수 — 테스트
var blasts := 0                   ## 수류탄 폭발 수
var blast_kills := 0              ## 폭발에 휘말려 처치된 적 수


func _ready() -> void:
	_load_room()
	for b in get_tree().get_nodes_in_group("boss"):
		if not b.dead:
			boss = b
	add_to_group("game")
	# Main 은 일시정지 중에도 돌고(흔들림 미리보기·입력), 월드는 멈춤
	process_mode = Node.PROCESS_MODE_ALWAYS
	room.process_mode = Node.PROCESS_MODE_PAUSABLE
	player.process_mode = Node.PROCESS_MODE_PAUSABLE
	process_physics_priority = 100
	TimeManager.reset()
	player.global_position = room.spawn_position()
	player.died.connect(_on_player_died)
	seq.finished.connect(_on_seq_finished)
	# 처치 흔적 레이어: 방 안, 지형 바로 위 · 적 아래
	gore = Gore.new()
	gore.name = "Gore"
	gore.room = room
	room.add_child(gore)
	room.move_child(gore, room.terrain.get_index() + 1)
	effects.room = room
	effects.gore = gore
	screen_fx.seq = seq
	# 방 배경음 (보스방 = 빗소리 반복). 재시작해도 끊기지 않고, 배경음이 없는 방이면 멈춤
	Audio.set_ambience(room.ambience, room.ambience_volume)
	var size := room.size_px()
	camera.limit_left = 0
	camera.limit_top = 0
	camera.limit_right = int(size.x)
	camera.limit_bottom = int(size.y)
	# 프로토타입: 프레임당 lerp 0.12 → 초당 스무딩 속도로 환산
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = Config.camera.lerp * Config.fps
	camera.reset_smoothing()
	hud.main = self
	menu.main = self
	debug_draw.main = self
	background.build(size.x, GameState.chapter * 100 + GameState.room, room.spawn_position().y, room)
	_queue_intros()
	# 재시작 직후 짧게 밝아지는 페이드 (실제 시간, 입력은 바로 받음). 방 이동은 Boot 가 따로 검게 전환
	if not entering:
		fade.color = Color(0, 0, 0, 1)
		var tw := create_tween()
		tw.set_ignore_time_scale(true)
		tw.tween_property(fade, "color:a", 0.0, Config.restart_fade)


## 지금 방 씬을 불러와 맨 앞 (플레이어보다 먼저 틱을 받는 자리) 에 두고, 배경 · 비는 그 바로 뒤
## (같은 z 의 무대 소품보다 비가 나중에 그려지게)
func _load_room() -> void:
	var ps: PackedScene = load(GameState.room_path())
	room = ps.instantiate()
	room.name = "Room"
	add_child(room)
	move_child(room, 0)
	move_child($Background, 1)


func enemies() -> Array:
	return get_tree().get_nodes_in_group("enemies").filter(func(e): return not e.dead)


func _unhandled_input(event: InputEvent) -> void:
	if Debug.menu_open:
		return
	if event.is_action_pressed("slash"):
		_note_click()
	if event.is_action_pressed("restart"):
		if game_state == "chapter_clear":
			GameState.reset_chapter()       # 장 끝 → 1번 방부터
		elif transitioning:
			return
		restart()
	elif event.is_action_pressed("mute"):
		Audio.toggle_mute()


## 방 처음부터 즉시 다시 (씬이 작아 로딩 없이 바로). Boot 안이면 게임만 새로 만들고, 단독 실행이면 씬 다시 읽기
func restart() -> void:
	var boot := get_tree().get_first_node_in_group("boot")
	if boot != null:
		boot.restart()
	else:
		Audio.stop_all()
		get_tree().reload_current_scene()


func _physics_process(_delta: float) -> void:
	# 일시정지(옵션 메뉴 / F4): 메뉴면 흔들림 미리보기만 재생
	if get_tree().paused:
		if Debug.menu_open:
			_update_shake(1.0 / Config.fps)
		return
	if _shake_frame != Engine.get_physics_frames():
		_update_shake(1.0 / Config.fps)
	_update_zoom()
	# 실제 시간으로 흐르는 표시들 (히트스톱·킬 스톱 중에도)
	if kill_frame >= 0:
		kill_frame += 1
	if not timing_msg.is_empty():
		timing_msg.t += TimeManager.real_delta()
	if not _late_watch.is_empty() and TimeManager.real_time > _late_watch.until:
		_late_watch = {}
	if open_msg_t >= 0.0:
		open_msg_t += TimeManager.real_delta()
	if not _radio.is_empty():
		_radio.t += TimeManager.real_delta()
		if _radio.t > _radio.dur:
			_radio = {}
	_try_open_exit()
	_boss_outro_tick()
	_intro_tick()
	Enemy.intro_hold = intro_active() or (_intro_wait >= 0.0 and not _intro_queue.is_empty())
	if not _toast.is_empty():
		_toast.t += TimeManager.real_delta()
		if _toast.t > 1.6:
			_toast = {}
	if _letterbox_to != letterbox:
		letterbox = move_toward(letterbox, _letterbox_to, TimeManager.real_delta() / (letterbox_time if letterbox_time > 0.0 else CG.TR_LETTERBOX))
	if TimeManager.frozen:
		return
	_opportunity_chimes()
	_resolve_shots()
	_resolve_combat()
	if game_state == "play" and enemies().is_empty():
		_on_room_cleared()
	_check_exit()


# ================================================================ 방 진행
## 방의 적을 모두 처치: 클리어 기록 + 출구 문 열림 (출구가 없는 옛 테스트 방은 CLEAR 글자 + 클리어음)
## 하운드 경비원이 전부 쓰러지면 보안 잠금이 풀림 — 문은 마지막 적의 16프레임 킬 연출이 끝난 직후 열기 시작
func _on_room_cleared() -> void:
	game_state = "clear"
	GameState.mark_cleared()
	if _boss_outro >= 0.0:
		return                            # 철견 처치: 무전 1초 뒤, 출구는 2초 뒤 (_boss_outro_tick)
	if room.exit_door() != null:
		_exit_pending = true
		_try_open_exit()
	else:
		Audio.clear()


func _try_open_exit() -> void:
	if not _exit_pending or TimeManager.frozen or TimeManager.kill_stop_left() > 0:
		return
	_exit_pending = false
	room.exit_door().open()
	open_msg_t = 0.0


## 철견 처치 뒤: RADIO_DELAY 초 무전 "철견 처리 확인. ...공백, 너 방금 웃었어?", EXIT_DELAY 초 출구 문 열림 (실제 시간)
func _boss_outro_tick() -> void:
	if _boss_outro < 0.0:
		return
	_boss_outro += TimeManager.real_delta()
	if not _outro_radio and _boss_outro >= _radio_at:
		_outro_radio = true
		show_radio(CG.RADIO_TEXT, CG.RADIO_TIME)
	if _boss_outro >= _exit_at:
		_boss_outro = -1.0
		var d := room.exit_door()
		if d != null:
			d.open(true)                  # 보스방 출구: door_boss.wav
			open_msg_t = 0.0


## 열린 출구에 닿으면 다음 방으로 (마지막 방이면 장 끝)
func _check_exit() -> void:
	if game_state != "clear" or transitioning or player.dead:
		return
	var d := room.exit_door()
	if d == null or not d.player_entered(player):
		return
	transitioning = true
	player.input_locked = true
	if GameState.is_last_room():
		game_state = "chapter_clear"
		Audio.clear()
		return
	var boot := get_tree().get_first_node_in_group("boot")
	if boot != null:
		boot.next_room()
	else:
		GameState.advance()
		Audio.stop_all()
		get_tree().reload_current_scene()


## F6: 다음 방으로 바로 (마지막 방이면 1번 방)
func debug_next_room() -> void:
	var next := GameState.room % GameState.room_count() + 1
	GameState.go_to(next)
	restart()


## F7: 지금 방 즉시 클리어 (연출 없이 적 제거 → 출구 열림)
func debug_clear_room() -> void:
	pending_shots.clear()
	for e in enemies():
		e.die(0.0)


# ================================================================ F5 패링 입력 오차
## 클릭 시각 (실제 시간 — 히트스톱으로 월드가 멈춘 동안 누른 것도 정확하게)
func _note_click() -> void:
	_last_click_real = TimeManager.real_time
	# 패링 실패 후 늦게 누른 클릭 → '+xxms 늦음'
	if not _late_watch.is_empty() and TimeManager.real_time <= _late_watch.until:
		report_timing(TimeManager.real_time - _late_watch.fire_real, "late")
		if _late_watch.get("death", false):
			GameState.update_last_death_err(timing_msg.text)
		_late_watch = {}


## err = 베기 시작 - 발사 (초)
func report_timing(err: float, kind: String) -> void:
	var ms := roundi(err * 1000.0)
	var label: String = { "ok": "성공", "early": "이름", "late": "늦음", "locked": "헛스윙 잠금", "none": "입력 없음", "dir": "방향 틀림" }[kind]
	var txt := label if kind == "none" else "%s%dms %s" % ["+" if ms > 0 else "", ms, label]
	timing_msg = { "text": txt, "ok": kind == "ok", "t": 0.0 }


## 패링 실패: 가장 가까운 클릭으로 원인 표시. 아직 안 눌렀으면 잠시 기다렸다가 '늦음'
func _report_shot_fail(s: Dictionary) -> void:
	var Sh: Dictionary = Config.shot
	var f: float = s.fire_real
	var c := _last_click_real
	var eps := 1e-9
	if c > f + Sh.PARRY_LATE + eps:
		report_timing(c - f, "late")                # 이번 틱에 늦게 누름
	elif c >= f - Sh.PARRY_EARLY - eps:
		report_timing(c - f, "locked")              # 창 안에 눌렀지만 헛스윙 잠금 등으로 베기 못 함
	elif c > f - 0.5:
		report_timing(c - f, "early")
	else:
		_late_watch = { "fire_real": f, "until": f + 0.5 }
		report_timing(0.0, "none")


# ================================================================ 흔들림 · 줌 (실제 시간)
## 방향성 흔들림 엔벨로프: 공격 방향으로 확 밀렸다가 (1-k)² 로 되돌아옴. 끝에 반대쪽으로 살짝 넘어감
func _shake_envelope(k: float) -> float:
	return pow(1.0 - k, 2.0) * cos(k * PI * Config.juice.SHAKE_OVERSHOOT)


## 방향성 흔들림 (이미 더 센 흔들림이 진행 중이면 그대로)
func add_shake(amp: float, time: float, angle: float) -> void:
	if not Settings.on("shake"):
		return
	var sh := _shake
	if sh.t > 0.0 and sh.amp * _shake_envelope(1.0 - sh.t / sh.time) > amp:
		return
	sh.amp = amp
	sh.time = time
	sh.t = time
	sh.angle = angle
	camera.offset = Vector2.from_angle(angle) * amp * Settings.shake   # 첫 프레임에 바로 밀림


## 화면 흔들림 = 방향성 흔들림(패링/사망) + 킬 흔들림. 옵션의 강도 배율 적용. 실제 시간 한 틱에 한 번
func _update_shake(dt: float) -> void:
	_shake_frame = Engine.get_physics_frames()
	var sh := _shake
	var o := Vector2.ZERO
	if sh.t > 0.0:
		sh.t = maxf(0.0, sh.t - dt)
		o = Vector2.from_angle(sh.angle) * sh.amp * _shake_envelope(1.0 - sh.t / sh.time)
	# 킬 흔들림: 킬 스톱 16f 동안 (1 - f/total)^2.5 로 감쇠, 해제 후 6f 안에 0
	var ks := _kill_shake
	if ks.f < ks.total:
		var K: Dictionary = Config.kill
		var amp: float = K.SHAKE_START * pow(1.0 - float(ks.f) / ks.total, K.SHAKE_CURVE) * float(ks.get("mul", 1.0))
		var bias: float = K.SHAKE_BIAS
		var v := Vector2.from_angle(ks.angle) * bias + Vector2.from_angle(randf() * TAU) * (1.0 - bias)
		if v.length() < 1e-6:
			v = Vector2.RIGHT
		o += v.normalized() * amp * randf_range(0.6, 1.0)
		ks.f += 1
	# 미세 진동 (보스방 문): 매 틱 아무 방향으로 amp px
	if _rumble > 0.0 and Settings.on("shake"):
		o += Vector2.from_angle(randf() * TAU) * _rumble
	_rumble = 0.0
	camera.offset = o * Settings.shake


# ================================================================ 처음 만나는 적 소개 (Config.intro)
## 방에 처음 보는 종류의 적 (연사병 · 돌격병 · 척탄병) 이 있으면: 입력 LOCK 초 잠금 · 그 적 쪽으로 카메라 살짝 줌인 ·
## 머리 위 이름 NAME_TIME 초 · 잡음의 무전 한 줄 (적의 intro_radio, 방 씬에서 입력). 본 종류는 GameState.seen_intros (F11 초기화)
func _queue_intros() -> void:
	var keys := {}
	for e in enemies():
		var k: String = e.intro_key()
		if k == "" or GameState.seen_intros.has(k) or keys.has(k):
			continue
		keys[k] = true
		_intro_queue.append(e)
	if not _intro_queue.is_empty():
		_intro_wait = Config.intro.DELAY


func intro_active() -> bool:
	return not _intro.is_empty()


func _exit_tree() -> void:
	Enemy.intro_hold = false


func _intro_tick() -> void:
	var I: Dictionary = Config.intro
	var rd := TimeManager.real_delta()
	if _intro.is_empty():
		if _intro_wait < 0.0:
			return
		_intro_wait -= rd
		if _intro_wait > 0.0:
			return
		_intro_wait = -1.0
		while not _intro_queue.is_empty() and (not is_instance_valid(_intro_queue[0]) or _intro_queue[0].dead):
			_intro_queue.pop_front()
		if _intro_queue.is_empty() or player.dead or not cam_override.is_empty():
			return
		_start_intro(_intro_queue.pop_front())
		return
	_intro.t += rd
	var e: Enemy = _intro.e if is_instance_valid(_intro.e) else null
	if _intro.locked and _intro.t >= I.LOCK:
		_intro.locked = false
		if not seq_active:
			player.input_locked = false
	var tin: float = I.IN
	var th: float = I.IN + I.HOLD
	var tout: float = th + I.OUT
	var target_c: Vector2 = _intro.to_c
	if e != null:
		target_c = player.center().lerp(e.center(), I.TOWARD)
	if _intro.t < tin:
		var k := _ease(_intro.t / tin)
		cam_override = { "center": Vector2(_intro.from_c).lerp(target_c, k), "zoom": lerpf(1.0, I.ZOOM, k) }
	elif _intro.t < th:
		cam_override = { "center": target_c, "zoom": I.ZOOM }
	elif _intro.t < tout:
		var k := _ease((_intro.t - th) / I.OUT)
		cam_override = { "center": target_c.lerp(_cam_follow_center(), k), "zoom": lerpf(I.ZOOM, 1.0, k) }
	else:
		cam_override = {}
		_intro = {}
		if not _intro_queue.is_empty():
			_intro_wait = I.GAP


func _start_intro(e: Enemy) -> void:
	var I: Dictionary = Config.intro
	var k: String = e.intro_key()
	GameState.seen_intros[k] = true
	intros_shown.append(k)
	e.show_name(String(I.NAMES.get(k, e.label())), I.NAME_TIME)
	var line: String = e.intro_line()
	if line != "":
		show_radio(line, I.RADIO_TIME)
	player.input_locked = true
	_intro = { "e": e, "t": 0.0, "from_c": _cam_follow_center(), "to_c": e.center(), "locked": true }


## 플레이어를 따라갈 때의 화면 중심 (카메라 한계 안으로)
func _cam_follow_center() -> Vector2:
	var half := Vector2(Config.view.w, Config.view.h) / 2.0
	var size := room.size_px()
	var c := player.center() + Vector2(0, -8)
	return Vector2(clampf(c.x, half.x, maxf(half.x, size.x - half.x)), clampf(c.y, half.y, maxf(half.y, size.y - half.y)))


static func _ease(x: float) -> float:
	x = clampf(x, 0.0, 1.0)
	return x * x * (3.0 - 2.0 * x)


## F11 (보스방 밖): 적 소개 기록 초기화
func debug_reset_intros() -> void:
	GameState.reset_intros()
	_toast = { "text": "적 소개 기록 초기화 — 방에 다시 들어오면 소개", "t": 0.0 }


func toast_state() -> Dictionary:
	return _toast


## 화면 아래 무전 한 줄 (실제 시간 dur 초)
func show_radio(text: String, dur: float) -> void:
	_radio = { "text": text, "t": 0.0, "dur": dur }


## 지금 보여 줄 무전 { text, t, alpha } — Main 이 띄운 것 우선, 없으면 보스방 문 무전
func radio_state() -> Dictionary:
	if not _radio.is_empty():
		return { "text": _radio.text, "t": _radio.t, "alpha": clampf((_radio.dur - _radio.t) / 0.4, 0.0, 1.0) }
	var d: Door = room.exit_door() if room != null else null
	return d.radio_state() if d != null else {}


## 이번 틱 미세 진동 (문 등 연출 노드가 매 틱 부름)
func rumble(amp: float) -> void:
	_rumble = maxf(_rumble, amp)


## 킬 흔들림 시작 (처치한 프레임부터 바로 흔들림). mul = 세기 배율 (철견 처치 1.5)
func start_kill_shake(angle: float, stop_frames: int, mul := 1.0) -> void:
	if not Settings.on("shake"):
		return
	_kill_shake = { "f": 0, "total": stop_frames + Config.kill.SHAKE_TAIL_FRAMES, "angle": angle, "mul": mul }
	_update_shake(0.0)


func _update_zoom() -> void:
	var P: Dictionary = Config.parry_seq
	# 연출 카메라: 플레이어에서 떼어 지정한 곳 · 배율로 (피날레)
	if not cam_override.is_empty():
		if not camera.top_level:
			_cam_local = camera.position
			camera.top_level = true
			camera.position_smoothing_enabled = false
		zoom = float(cam_override.get("zoom", 1.0))
		camera.global_position = cam_override.center
		camera.zoom = Vector2(zoom, zoom)
		return
	if camera.top_level:
		camera.top_level = false
		camera.position = _cam_local
		camera.position_smoothing_enabled = true
		camera.reset_smoothing()
	if seq.active:
		zoom = 1.0 + P.ZOOM * pow(seq.return_u(), 2.0)
	else:
		zoom = move_toward(zoom, 1.0, P.ZOOM / P.ZOOM_OUT_FRAMES)
	camera.zoom = Vector2(zoom, zoom)


# ================================================================ 레이캐스트
## 벽·바닥(일방향 발판 제외)까지의 끝점
func raycast_wall(from: Vector2, angle: float, dist: float) -> Vector2:
	var to := from + Vector2.from_angle(angle) * dist
	var q := PhysicsRayQueryParameters2D.create(from, to, Config.layers.terrain)
	var hit := get_world_2d().direct_space_state.intersect_ray(q)
	return hit.position if not hit.is_empty() else to


## 두 점 사이 시야가 트였는가 (일방향 발판은 막지 않음)
func line_of_sight(a: Vector2, b: Vector2) -> bool:
	var q := PhysicsRayQueryParameters2D.create(a, b, Config.layers.terrain)
	return get_world_2d().direct_space_state.intersect_ray(q).is_empty()


## 선분 a→b 가 사각형 r 에 처음 들어가는 지점의 비율 t (0~1). 안 닿으면 -1 (Liang–Barsky)
static func seg_rect_t(a: Vector2, b: Vector2, r: Rect2) -> float:
	var d := b - a
	var t0 := 0.0
	var t1 := 1.0
	for axis in 2:
		var p0 := a[axis]
		var dd := d[axis]
		var mn := r.position[axis]
		var mx := r.end[axis]
		if absf(dd) < 1e-9:
			if p0 < mn or p0 > mx:
				return -1.0
		else:
			var ta := (mn - p0) / dd
			var tb := (mx - p0) / dd
			if ta > tb:
				var tmp := ta
				ta = tb
				tb = tmp
			t0 = maxf(t0, ta)
			t1 = minf(t1, tb)
			if t0 > t1:
				return -1.0
	return t0


## 히트스캔: from 에서 angle 로. 벽에 막히고, 그 앞에 있는 플레이어/적 중 먼저 닿는 것
func hitscan(from: Vector2, angle: float, dist: float, hit_player: bool, hit_enemies: bool) -> Dictionary:
	var end := raycast_wall(from, angle, dist)
	var res := { "pos": end, "wall": end.distance_to(from) < dist - 0.5, "player": false, "enemy": null }
	var best := 2.0
	if hit_player and not player.dead and not player.is_invincible():   # 구르기 무적이면 탄이 통과
		var pad: float = Config.shot.PLAYER_HIT_PAD
		# 판정 창 안에서 막 벤 칼은 칼날이 닿는 범위까지 탄을 받아냄 (베기 돌진으로 조준선에서 살짝 비껴도 패링)
		if player.is_slashing() and not player.slash_used and player.slash_t <= Config.shot.PARRY_EARLY + 1e-6:
			pad = Config.shot.SLASH_CATCH_PAD
		var t := seg_rect_t(from, end, player.body_rect().grow(pad))
		if t >= 0.0 and t < best:
			best = t
			res.player = true
	if hit_enemies:
		for e in enemies():
			var t := seg_rect_t(from, end, e.body_rect())
			if t >= 0.0 and t < best:
				best = t
				res.player = false
				res.enemy = e
	if best <= 1.0:
		res.pos = from.lerp(end, best)
		res.wall = false
	return res


# ================================================================ 사격 · 타이밍 패링
## 총잡이 g 가 지금 조준을 더 진행하면 안 되는가
##  - 패링 시퀀스 중 (플레이어 입력이 잠겨 피할 수 없으므로)
##  - 다른 총잡이의 (예정된) 발사와 MIN_SHOT_GAP 안으로 겹칠 때, 나중 순서인 쪽이 기다림
##    연사병은 연사 안 탄들을 모두 비교 (자기 연사 안 간격은 제외 — 다른 적과 사이에만)
func should_hold_aim(g: EnemyGunner, nt: float) -> bool:
	if seq_active:
		return true
	var gap: float = Config.shot.MIN_SHOT_GAP
	var m0: float = TimeManager.world_time + (g.cfg.AIM_TIME - nt)
	var mine := []
	for i in g.burst_count:
		mine.append(m0 + float(Config.burst.SHOT_GAP) * i)
	var gunners := get_tree().get_nodes_in_group("gunners")
	var gi := gunners.find(g)
	for o in gunners:
		if o == g or o.dead:
			continue
		for of in o.fire_times():
			if is_inf(of):
				continue
			for m in mine:
				var other_first: bool = of < m or (of == m and gunners.find(o) < gi)
				if other_first and m - of < gap:
					return true
	return false


## 적 발사: 즉시 레이캐스트. 플레이어에 닿으면 PARRY_LATE 동안 패링 입력을 기다린 뒤 판정
func fire_shot(g: EnemyGunner) -> void:
	var Sh: Dictionary = Config.shot
	var col: Color = Config.colors.attack if g.next_parryable else Config.colors.unparryable
	var m := g.muzzle()
	var hit := hitscan(m, g.aim, Sh.RANGE, true, false)
	effects.add_tracer(m, hit.pos, Sh.TRACER_WIDTH, col, Sh.TRACER_FRAMES, true)
	effects.burst(m, 5, col, 90.0, g.aim, 0.5, 0.12, { "glow": true })
	effects.approach_flash(m)        # 원 두 개가 겹치며 1프레임 번쩍 (빗나가면 그대로 사라짐)
	g.velocity.x -= cos(g.aim) * 40.0   # 반동
	Audio.shot()
	if hit.wall:
		effects.burst(hit.pos, 7, col, 110.0, g.aim + PI, 1.1, 0.2, { "glow": true, "streak": true })
	if hit.player:
		pending_shots.append({ "shooter": g, "muzzle": m, "fire_t": TimeManager.world_time, "fire_real": TimeManager.real_time,
			"angle": g.aim, "parryable": g.next_parryable, "attack_type": g.next_type, "done": false, "aim_time": g.cfg.AIM_TIME,
			"burst_i": g.burst_i, "burst_n": g.burst_count })


## 플레이어에 닿은 탄: 발사 -PARRY_EARLY ~ +PARRY_LATE 안에 베기를 시작했으면 패링, 아니면 즉사.
## 방향과 상관없이 판정 창 안에서 베기만 하면 성공. 시각은 월드 시간 (슬로우 중에도 같은 비율)
func _resolve_shots() -> void:
	var Sh: Dictionary = Config.shot
	var eps := 1e-6
	var p := player
	for s in pending_shots:
		if s.done:
			continue
		if p.dead:
			s.done = true
			continue
		var ts := p.last_slash_t
		if s.parryable and not p.slash_used and not p.is_rolling() and ts >= s.fire_t - Sh.PARRY_EARLY - eps and ts <= s.fire_t + Sh.PARRY_LATE + eps:
			s.done = true
			# 도탄: 탄이 날아오는 쪽 ±DIRECTIONAL_PARRY_ANGLE 로 베어야 함. 다른 방향 = 실패
			if s.has("incoming") and absf(angle_difference(p.slash_angle, s.incoming)) > deg_to_rad(Config.shot.DIRECTIONAL_PARRY_ANGLE):
				report_timing(ts - s.fire_t, "dir")
				_kill_player(s.angle, _shot_cause(s))
				continue
			p.mark_used()
			report_timing(ts - s.fire_t, "ok")
			if s.get("boss", false):
				_parry_boss_shot(s)
			elif is_instance_valid(s.shooter) and s.shooter is EnemyDummy:
				_parry_dummy_shot(s)
			elif int(s.get("burst_i", 0)) < int(s.get("burst_n", 1)) - 1:
				_parry_burst_first(s)
			else:
				_parry_shot(s)
			continue
		if TimeManager.world_time > s.fire_t + Sh.PARRY_LATE + eps:
			s.done = true
			_report_shot_fail(s)
			_kill_player(s.angle, _shot_cause(s))
	pending_shots = pending_shots.filter(func(s): return not s.done)


## 기회 공격 (OPPORTUNITY): 공격 OPP_CHIME_LEAD 초 전 짧은 '칭' (원 중심 반짝임은 Effects.draw_approach)
func _opportunity_chimes() -> void:
	var X: Dictionary = Config.attack
	for info in Effects.approach_infos(get_tree()):
		if info.get("attack_type", "") != Config.ATK_OPPORTUNITY:
			continue
		var rem: float = info.remaining
		if rem > X.OPP_CHIME_LEAD + 1e-6 or rem < -0.02:
			continue
		var id: int = info.owner.get_instance_id()
		var ft: float = info.fire_t
		if _chimed.has(id) and absf(float(_chimed[id]) - ft) < 0.1:
			continue
		_chimed[id] = ft
		Audio.play(X.OPP_CHIME_SOUND, X.OPP_CHIME_VOLUME, X.OPP_CHIME_PITCH)


## 사망 원인 (탄): 패턴 · 공격 이름 · 종류 · 패링 오차 (방금 _report_shot_fail / report_timing 이 낸 글자)
func _shot_cause(s: Dictionary) -> Dictionary:
	var ty: String = s.get("attack_type", Config.ATK_NORMAL)
	var pat := "총잡이"
	if s.get("boss", false) and is_instance_valid(s.shooter):
		pat = s.get("pattern", s.shooter.cause_pattern())
	elif is_instance_valid(s.shooter) and s.shooter is EnemyDummy:
		pat = "연습 더미"
	elif is_instance_valid(s.shooter) and s.shooter.has_method("label"):
		pat = s.shooter.label()
	if int(s.get("burst_n", 1)) > 1 and not s.has("label"):
		s.label = "연사 %d탄" % (int(s.burst_i) + 1)
	if timing_msg.get("text", "") == "입력 없음" and not _late_watch.is_empty():
		_late_watch.death = true           # 0.5초 안에 늦게 누르면 기록도 '+xxms 늦음' 으로
	return { "pattern": pat, "attack": s.get("label", "사격"), "type": ty,
		"err": "패링 불가" if ty == Config.ATK_EVADE else String(timing_msg.get("text", "")) }


## 사망 원인 (근접): 패링 오차 = 마지막 베기 시작 - 타격 순간 (0.5초 넘게 떨어져 있으면 '입력 없음')
func _melee_cause(e: Enemy) -> Dictionary:
	var c: Dictionary
	if e is BossCheolgyeon:
		c = e.melee_cause()
	else:
		var impact := TimeManager.world_time - (e.t if e.state in ["attack", "slam", "charge"] else 0.0)
		c = { "pattern": e.label(), "attack": e.attack_label() if e.has_method("attack_label") else "베기",
			"type": e.get("attack_type") if e.get("attack_type") != null else Config.ATK_NORMAL, "impact_t": impact }
	if c.type == Config.ATK_EVADE:
		c.err = "패링 불가"
	else:
		var d: float = player.last_slash_t - float(c.impact_t)
		if absf(d) > 0.5:
			c.err = "입력 없음"
		else:
			var ms := roundi(d * 1000.0)
			c.err = "%s%dms %s" % ["+" if ms > 0 else "", ms, "늦음" if ms > 0 else "이름"]
	c.erase("impact_t")
	return c


## 반사 대상 고르기. 기준 방향 = 플레이어 → 마우스
##  1) 그 탄을 쏜 적이 ±OWNER_PRIORITY_ANGLE 안이면 최우선
##  2) 아니면 ±AIM_SNAP_ANGLE 안에서 마우스 방향과 각도 차가 가장 작은 적
##  거리 AIM_SNAP_RANGE 초과, 벽에 가려진 적은 제외. 없으면 null (마우스 방향 그대로)
func pick_reflect_target(origin: Vector2, aim_angle: float, shooter: Enemy) -> Enemy:
	var A: Dictionary = Config.aim_assist
	var best: Enemy = null
	var best_diff := INF
	for e in enemies():
		var d: Vector2 = e.center() - origin
		if d.length() > A.AIM_SNAP_RANGE:
			continue
		var diff := absf(angle_difference(aim_angle, d.angle()))
		var limit := deg_to_rad(A.OWNER_PRIORITY_ANGLE if e == shooter else A.AIM_SNAP_ANGLE)
		if diff > limit or not line_of_sight(origin, e.center()):
			continue
		if e == shooter:
			return e
		if diff < best_diff:
			best = e
			best_diff = diff
	return best


# ================================================================ 철견 (CheolgyeonConfig)
## 철견 패링 연출. NORMAL: parry_chang + 히트스톱 4프레임 + 노란 불꽃 (피해 · 휘청 없음)
## OPPORTUNITY (opp = true): 히트스톱 PARRY_HITSTOP + 실제 0.1초 동안 시간 50% (휘청은 부른 쪽이)
## 풀 패링 슬로우 시퀀스 (seq) 는 이 보스전에서 피날레에만
func boss_parry_fx(pos: Vector2, angle: float, opp := false) -> void:
	_boss_light(pos, 60.0)
	var CC: Dictionary = Config.colors
	var F: Dictionary = Config.fx
	if opp:
		TimeManager.hitstop(CG.PARRY_HITSTOP)
		TimeManager.slow_for(CG.PARRY_SLOW, CG.PARRY_SLOW_TIME)
	else:
		TimeManager.hitstop(Config.attack.NORMAL_PARRY_HITSTOP)
	effects.ring(pos, F.ring_radius * 0.7, F.ring_time * 0.7, F.ring_width - 1.0, CC.parry)
	effects.burst(pos, 12, CC.parry, 240.0, angle, 1.2, 0.24, { "glow": true, "streak": true })
	effects.burst(pos, 5, CC.parry_hot, 120.0, 0.0, PI, 0.3, { "glow": true })
	Audio.parry()


## 철견 사격: 기존 히트스캔 · 조준선 · 원 그대로 (MIN_SHOT_GAP 규칙 밖). bl = { gun, aim, aim_time, role }
func fire_boss_shot(b: BossCheolgyeon, bl: Dictionary) -> void:
	var Sh: Dictionary = Config.shot
	var col: Color = Config.colors.attack
	var aim: float = bl.aim
	var m := b.body.muzzle(bl.gun)
	var hit := hitscan(m, aim, Sh.RANGE, true, false)
	effects.add_tracer(m, hit.pos, Sh.TRACER_WIDTH, col, Sh.TRACER_FRAMES, true)
	effects.burst(m, 5, col, 90.0, aim, 0.5, 0.12, { "glow": true })
	effects.approach_flash(m)
	Audio.shot(CG.SHOT_PITCH)
	_boss_light(m)
	if hit.wall:
		effects.burst(hit.pos, 7, col, 110.0, aim + PI, 1.1, 0.2, { "glow": true, "streak": true })
	if hit.player:
		pending_shots.append({ "shooter": b, "muzzle": m, "fire_t": TimeManager.world_time, "fire_real": TimeManager.real_time,
			"angle": aim, "parryable": true, "attack_type": bl.type, "done": false, "aim_time": bl.aim_time, "boss": true, "role": bl.role,
			"pattern": b.cause_pattern(), "label": bl.get("label", "탄") })


## ⑤ 도탄: 총구 → 반사면 (튕김) → 플레이어. 두 번째 줄은 튕긴 점에서 히트스캔. 판정은 방향 패링
## (incoming = 플레이어에서 튕긴 점 쪽 — 그쪽 ±DIRECTIONAL_PARRY_ANGLE 로 베어야 성공)
func fire_boss_ricochet(b: BossCheolgyeon, bl: Dictionary) -> void:
	var Sh: Dictionary = Config.shot
	var col: Color = Config.colors.attack
	var m := b.body.muzzle(bl.gun)
	var bounce: Vector2 = bl.bounce
	var dir2: Vector2 = bl.dir2
	effects.add_tracer(m, bounce, Sh.TRACER_WIDTH, col, Sh.TRACER_FRAMES, true)
	effects.burst(m, 5, col, 90.0, bl.aim, 0.5, 0.12, { "glow": true })
	effects.burst(bounce, 8, Config.colors.parry_hot, 130.0, dir2.angle(), 1.2, 0.2, { "glow": true, "streak": true })
	Audio.shot(CG.SHOT_PITCH)
	Audio.boss_armor(CG.RS_TING_PITCH * 1.2)
	_boss_light(m)
	_boss_light(bounce, 50.0)
	var hit := hitscan(bounce + dir2 * 1.5, dir2.angle(), Sh.RANGE, true, false)
	effects.add_tracer(bounce, hit.pos, Sh.TRACER_WIDTH, col, Sh.TRACER_FRAMES)
	if not player.dead:
		effects.approach_flash(player.center())
	if hit.wall:
		effects.burst(hit.pos, 7, col, 110.0, dir2.angle() + PI, 1.1, 0.2, { "glow": true, "streak": true })
	if hit.player:
		pending_shots.append({ "shooter": b, "muzzle": player.center(), "fire_t": TimeManager.world_time, "fire_real": TimeManager.real_time,
			"angle": dir2.angle(), "parryable": true, "attack_type": bl.type, "done": false, "aim_time": bl.aim_time, "boss": true, "role": bl.role,
			"pattern": b.cause_pattern(), "label": bl.get("label", "도탄"),
			"incoming": (bounce - player.center()).angle() })


## 정전 중 순간 빛 (보스방 무대가 있으면)
func _boss_light(pos: Vector2, r := -1.0) -> void:
	var a := room.get_node_or_null("Arena")
	if a != null:
		a.flash_light(pos, CG.MUZZLE_LIGHT_R if r < 0.0 else r)


## 페이즈 전환 연출 시작 / 끝: 입력 잠금 · 레터박스 · 남은 탄 정리
func cine_begin() -> void:
	cinematic = true
	pending_shots.clear()
	player.input_locked = true
	_letterbox_to = 1.0


func cine_end() -> void:
	cinematic = false
	player.input_locked = false
	_letterbox_to = 0.0


## 레터박스는 그대로 두고 입력만 (오프닝 · 피날레 속사 — 플레이어가 받아쳐야 함)
func cine_input(on: bool) -> void:
	cinematic = not on
	player.input_locked = not on


## 연출 사격: 철견 앞 권총에서 그 지점으로 (물탱크 · 조명)
func cine_shot(b: BossCheolgyeon, to: Vector2) -> void:
	var m := b.body.muzzle(0)
	var a := (to - m).angle()
	effects.add_tracer(m, to, Config.shot.TRACER_WIDTH, Config.colors.attack, Config.shot.TRACER_FRAMES, true)
	effects.burst(m, 5, Config.colors.attack, 90.0, a, 0.5, 0.12, { "glow": true })
	effects.burst(to, 12, Config.colors.parry, 200.0, a + PI, 1.3, 0.3, { "glow": true, "streak": true })
	Audio.shot(CG.SHOT_PITCH)
	_boss_light(m)


## 철견 탄 패링: 슬로우 시퀀스 없음. OPPORTUNITY 탄 (role = stagger: ④ 진짜 탄 · ⑤ 2번째 도탄)이면
## 반사탄이 철견에 맞고 (boss_armor) 철견 휘청 → 반격 기회
func _parry_boss_shot(s: Dictionary) -> void:
	var p := player
	var b: BossCheolgyeon = s.shooter
	var back: float = s.angle + PI
	var spark: Vector2 = p.center() + Vector2.from_angle(back) * float(Config.slash.radius) * 0.6
	boss_parry_fx(spark, back, s.get("attack_type", "") == Config.ATK_OPPORTUNITY)
	effects.approach_success(s.muzzle)
	if not is_instance_valid(b) or b.dead:
		return
	if s.role == "opening":
		# 오프닝: 권총이 손에서 튕겨나감
		Audio.boss_armor()
		effects.burst(b.body.muzzle(0), 10, Config.colors.parry, 200.0, (b.center() - p.center()).angle(), 1.2, 0.25, { "glow": true, "streak": true })
		b.on_opening_parried()
		return
	if s.role == "stagger":
		var c := b.center()
		effects.add_tracer(p.center(), c, Config.shot.REFLECT_TRACER_WIDTH, Config.colors.parry, Config.shot.TRACER_FRAMES)
		effects.burst(c, 10, Config.colors.parry, 220.0, (c - p.center()).angle() + PI, 1.0, 0.24, { "glow": true, "streak": true })
		Audio.boss_armor(CG.REFLECT_PITCH)
		b.stagger()
	else:
		# 일반 패링: 튕겨 나간 탄이 옆으로 빗나감
		var off := back + randf_range(-0.6, 0.6)
		effects.add_tracer(p.center(), raycast_wall(p.center(), off, 160.0), 1.0, Config.colors.parry, 2)


## 연습 더미 탄 패링: NORMAL = 철견 일반 패링과 같은 연출 (피해 없음) · OPPORTUNITY = 반사탄이 맞고 휘청
func _parry_dummy_shot(s: Dictionary) -> void:
	var p := player
	var d: EnemyDummy = s.shooter
	var back: float = s.angle + PI
	var spark: Vector2 = p.center() + Vector2.from_angle(back) * float(Config.slash.radius) * 0.6
	var opp: bool = s.attack_type == Config.ATK_OPPORTUNITY
	boss_parry_fx(spark, back, opp)
	effects.approach_success(s.muzzle)
	if opp:
		var c := d.center()
		effects.add_tracer(p.center(), c, Config.shot.REFLECT_TRACER_WIDTH, Config.colors.parry, Config.shot.TRACER_FRAMES)
		effects.burst(c, 10, Config.colors.parry, 220.0, (c - p.center()).angle() + PI, 1.0, 0.24, { "glow": true, "streak": true })
		Audio.boss_armor(CG.REFLECT_PITCH)
		d.stagger()
	else:
		var off := back + randf_range(-0.6, 0.6)
		effects.add_tracer(p.center(), raycast_wall(p.center(), off, 160.0), 1.0, Config.colors.parry, 2)
		d.say("패링 (피해 없음)", Config.colors.parry)


## 연습 더미를 벰: 휘청 중이면 반격 명중 (execute + 히트스톱 + 흔들림), 아니면 막힘
func _dummy_slash(d: EnemyDummy) -> void:
	var p := player
	p.mark_used()
	var angle := (d.center() - p.center()).angle()
	if d.can_counter():
		Audio.sfx("execute")
		TimeManager.hitstop(CG.COUNTER_HITSTOP)
		if Settings.on("screen_flash"):
			screen_fx.flash()
		add_shake(CG.COUNTER_SHAKE, CG.COUNTER_SHAKE_TIME, angle)
		effects.burst(d.center(), 14, Config.colors.player, 280.0, angle, 0.7, 0.26, { "glow": true, "streak": true })
		p.impact_smear(true)
		d.on_counter_hit()
	else:
		effects.burst(p.tip(), 6, Config.colors.parry_hot, 140.0, angle + PI, 1.0, 0.15, { "glow": true })
		Audio.boss_armor(1.4)
		d.say("막힘 — 2겹 원을 패링", Config.colors.enemy_rim.lightened(0.4))


## ② 건카타 근접 패링: NORMAL 타격 = 일반 패링, OPPORTUNITY (3타) = 철견이 크게 튕겨나며 휘청
func _parry_whip(b: BossCheolgyeon, i: int) -> void:
	var p := player
	p.mark_used()
	boss_parry_fx(p.tip(), p.slash_angle, b.whip_type(i) == Config.ATK_OPPORTUNITY)
	if i == 2:
		add_shake(CG.WHIP_SHAKE * 1.5, 0.2, p.slash_angle)
		Audio.boss_armor(CG.REFLECT_PITCH)
	b.on_whip_parried(i)


## 휘청 중 베기가 철견에 닿음 = 반격 베기 (플레이어는 Player._start_slash 에서 이미 자동 돌진)
##  execute.wav + 히트스톱 8 + 흰 섬광 1프레임 + 흔들림 6px + 코트 조각 파편 + 철견 30px 넉백 → 체력 -1. 컷인 · 긴 슬로우 없음
func _counter_hit(b: BossCheolgyeon) -> void:
	var CC: Dictionary = Config.colors
	var p := player
	p.mark_used()
	var angle := (b.center() - p.center()).angle()
	var c := b.center()
	Audio.sfx("execute")
	TimeManager.hitstop(CG.COUNTER_HITSTOP)
	if Settings.on("screen_flash"):
		screen_fx.flash()
	add_shake(CG.COUNTER_SHAKE, CG.COUNTER_SHAKE_TIME, angle)
	effects.burst(c, 14, CC.player, 280.0, angle, 0.7, 0.26, { "glow": true, "streak": true })
	effects.burst(c, 6, CG.COL_RIM, 180.0, angle, 1.2, 0.3, { "glow": true })
	# 코트 조각: 작은 삼각형들이 베는 방향으로 튀어 떨어짐
	for i in CG.COAT_SHARDS:
		var sz := randf_range(2.5, 4.5)
		var tri := PackedVector2Array([Vector2(-sz, -sz * 0.4), Vector2(sz, -sz * 0.7), Vector2(randf_range(-1, 1), sz)])
		var part := { "xf": Transform2D.IDENTITY, "shapes": [["poly", tri]], "body": CG.COL_COAT, "rim": CG.COL_RIM }
		var a := angle + randf_range(-0.9, 0.9)
		var v := randf_range(120.0, 260.0)
		var o := c + Vector2(randf_range(-5, 5), randf_range(-4, 10))
		gore.toss([part], o, o, Vector2(cos(a) * v, sin(a) * v - 140.0), randf_range(-18, 18))
	p.impact_smear(true)
	b.on_counter_hit(angle)                  # 체력 0 이면 철견이 피날레를 시작 (처치는 피날레 일섬)


# ================================================================ 피날레 "빗방울 결투" (FinaleDuel)
var _finale: FinaleDuel = null


func start_finale(b: BossCheolgyeon) -> void:
	if _finale != null and is_instance_valid(_finale) and not _finale.done:
		return
	pending_shots.clear()
	seq.cancel()
	_finale = FinaleDuel.new()
	_finale.setup(self, b)
	add_child(_finale)


func finale() -> FinaleDuel:
	return _finale if _finale != null and is_instance_valid(_finale) and not _finale.done else null


## 디버그로 피날레를 벗어남 (F8 · F10 · F11)
func finale_abort() -> void:
	if finale() != null:
		_finale.abort()
	_finale = null
	cine_end()


## 11) 쓰러짐 순간: 철견 처치 확정 (체크포인트 · 방 클리어). 시체는 그 자리에 남고, 무전 · 출구는 radio_at · exit_at 초 뒤 (실제 시간)
func finale_boss_down(b: BossCheolgyeon, radio_at: float, exit_at: float) -> void:
	b.dying = true
	for g in ["enemies", "aimers", "counter_targets"]:
		b.remove_from_group(g)
	GameState.boss_checkpoint = { "key": GameState.room_key(), "dead": true }
	_radio_at = radio_at
	_exit_at = exit_at
	_boss_outro = 0.0
	_outro_radio = false


## 피날레 끝 (12 여운까지): 체력 칸 · 대사를 내림
func finale_done(_f: FinaleDuel) -> void:
	boss = null
	_finale = null


## F12: 피날레만 바로 (보스방 체크포인트 = 피날레)
func debug_play_finale() -> void:
	GameState.room_override = ""
	GameState.go_to(GameState.room_count())
	GameState.boss_checkpoint = { "key": GameState.room_key(), "phase": 4 }
	restart()


## 휘청 아닐 때 철견을 벰: 권총으로 막음 — boss_armor + 불꽃, 피해 없음, 플레이어 0.2초 경직 (살짝 밀려남)
func _boss_block(b: BossCheolgyeon) -> void:
	var CC: Dictionary = Config.colors
	var p := player
	var g := b.block_point()
	var away := (p.center() - b.center()).angle()
	Audio.boss_armor(CG.BLOCK_PITCH)
	effects.burst(g, 10, CC.parry, 220.0, away, 0.9, 0.2, { "glow": true, "streak": true })
	effects.burst(g, 4, CC.player, 140.0, away, 1.2, 0.16, { "glow": true })
	add_shake(2.0, 0.12, away)
	p.stun(CG.BLOCK_PLAYER_STUN, Vector2(signf(cos(away)) if absf(cos(away)) > 0.1 else -float(b.facing), -0.15).normalized() * CG.BLOCK_PUSH)


## 패링 성공 공통 연출 (pos = 칼에 맞부딪힌 지점, angle = 불꽃·흔들림 방향)
##  히트스톱 6틱 · 흰 섬광 · 칼 끝 노란 충격파 링 2겹 · 방향성 흔들림 · 노란/주황 불꽃 · parry_chang
func parry_fx(pos: Vector2, angle: float, hitstop_frames := -1) -> void:
	var F: Dictionary = Config.fx
	var C: Dictionary = Config.colors
	var J: Dictionary = Config.juice
	TimeManager.hitstop(J.HITSTOP_PARRY_FRAMES if hitstop_frames < 0 else hitstop_frames)
	if Settings.on("screen_flash"):
		screen_fx.flash()
	effects.ring(pos, F.ring_radius, F.ring_time, F.ring_width, C.parry)
	effects.ring(pos, F.ring_radius * 0.55, F.ring_time * 0.7, F.ring_width - 1.0, C.parry_hot)
	add_shake(J.SHAKE_PARRY, J.SHAKE_TIME, angle)
	effects.burst(pos, 14, C.parry, 260.0, angle, 1.3, 0.28, { "glow": true, "streak": true })
	effects.burst(pos, 6, C.parry_hot, 120.0, 0.0, PI, 0.35, { "glow": true })
	Audio.parry()


## 사격 패링 성공: 반사 대상을 정하고 슬로우 시퀀스 시작. 명중은 time_return 이 끝나는 틱 (_on_seq_finished)
func _parry_shot(s: Dictionary) -> void:
	var p := player
	var aim := (get_global_mouse_position() - p.center()).angle()
	# 쏜 적 우선 → 가려져 있으면 조준 스냅 → 없으면 마우스 방향
	var target := pick_reflect_target(p.center(), aim, s.shooter)
	var ray_end := raycast_wall(p.center(), aim, Config.shot.RANGE)
	# 노란 불꽃은 탄이 날아온 쪽 칼날 위에서
	var back: float = s.angle + PI
	var spark: Vector2 = p.center() + Vector2.from_angle(back) * float(Config.slash.radius) * 0.6
	parry_fx(spark, back)
	effects.approach_success(s.muzzle)    # 원이 노랗게 바뀌며 바깥으로 퍼짐
	seq.start(target, aim, p.center().distance_to(ray_end), Config.juice.HITSTOP_PARRY_FRAMES if Settings.on("hitstop") else 0)
	p.input_locked = Config.parry_seq.LOCK_INPUT_DURING_SLOWMO


## 연사병 첫 탄 패링: 슬로우 시퀀스 없이 짧은 히트스톱 · 반사탄은 쏜 적에서 위로 MISS_ANGLE 비껴 벽에 맞음 (처치 아님)
## → 바로 이어지는 두 번째 탄을 다시 패링하면 그 반사탄이 연사병을 처치
func _parry_burst_first(s: Dictionary) -> void:
	var p := player
	var o := p.center()
	var back: float = s.angle + PI
	parry_fx(o + Vector2.from_angle(back) * float(Config.slash.radius) * 0.6, back, Config.burst.FIRST_PARRY_HITSTOP)
	effects.approach_success(s.muzzle)
	var to: Vector2 = s.shooter.center() if is_instance_valid(s.shooter) else s.muzzle
	var a := (to - o).angle()
	var miss := deg_to_rad(Config.burst.MISS_ANGLE)
	a += -miss if cos(a) >= 0.0 else miss        # 화면 위쪽으로 비낌
	var r := hitscan(o, a, Config.shot.RANGE, false, false)
	effects.add_tracer(o, r.pos, Config.shot.REFLECT_TRACER_WIDTH, Config.colors.parry, Config.shot.TRACER_FRAMES)
	effects.burst(r.pos, 8, Config.colors.parry, 120.0, a + PI, 1.1, 0.22, { "glow": true, "streak": true })
	burst_misses += 1


## 시퀀스 끝 틱 (월드 갱신 전): 입력 잠금 풀고 반사탄 명중
func _on_seq_finished(target: Enemy, dir: float) -> void:
	player.input_locked = false
	if not player.dead:
		_reflect_hit(target, dir)


## 반사탄(히트스캔): 대상이 있으면 그 적에 반드시 명중, 없으면 마우스 방향으로
func _reflect_hit(target: Enemy, aim: float) -> void:
	var Sh: Dictionary = Config.shot
	var o := player.center()
	var hit_pos: Vector2
	var victim: Enemy = null
	var angle := aim
	if target != null and not target.dead:
		angle = (target.center() - o).angle()
		hit_pos = target.center()
		victim = target
	else:
		var r := hitscan(o, aim, Sh.RANGE, false, true)
		hit_pos = r.pos
		victim = r.enemy
		if r.wall:
			effects.burst(hit_pos, 8, Config.colors.parry, 120.0, aim + PI, 1.1, 0.22, { "glow": true, "streak": true })
	effects.add_tracer(o, hit_pos, Sh.REFLECT_TRACER_WIDTH, Config.colors.parry, Sh.TRACER_FRAMES)
	if victim is BossCheolgyeon:
		victim.stagger()                  # 철견은 반사탄에 맞으면 휘청 (반격 기회)
	elif victim != null:
		_kill_enemy(victim, angle, "reflect")


# ================================================================ 근접 · 처치 · 사망
func _resolve_combat() -> void:
	var p := player
	if p.dead:
		return
	var S: Dictionary = Config.slash
	# 1) 근접 패링: 공격(또는 예고 마지막 순간)에 칼을 맞대면 → 적 즉사 (사격 패링은 _resolve_shots 의 타이밍 판정)
	if p.in_parry_window():
		var reach: float = 1.0 + Config.aim_assist.MELEE_PARRY_RANGE_BONUS
		for e in enemies():
			if e is EnemyMelee and e.parry_vulnerable():
				if p.slash_hits_rect(e.threat_box(), reach) or p.slash_hits_rect(e.body_rect(), reach):
					_parry_melee(e)
		# 철견 건카타 내려치기
		if boss != null and is_instance_valid(boss) and not boss.dead and not p.slash_used:
			var wi := boss.whip_vulnerable()
			if wi >= 0 and (p.slash_hits_rect(boss.threat_box(), reach) or p.slash_hits_rect(boss.body_rect(), reach)):
				_parry_whip(boss, wi)
	# 1.5) 수류탄 되치기: 날아오는 (또는 바닥의) 수류탄을 베면 마우스 방향으로 (조준 스냅 — 던진 적 우선)
	if p.is_slashing() and p.slash_t < S.hit_time and not p.slash_used:
		for g in get_tree().get_nodes_in_group("grenades"):
			if g.can_bat() and p.slash_hits(g.global_position, Config.grenade.SLASH_PAD):
				_bat_grenade(g)
				break
	# 2) 칼이 적 몸통에 직접 닿음 → 즉사 (돌격병이 막는 중이면 헛스윙)
	if S.direct_kill and p.is_slashing() and p.slash_t < S.hit_time:
		for e in enemies():
			if e.guarding():
				if not p.slash_used and p.slash_hits_rect(e.body_rect()) and e.take_block(p.last_slash_t):
					_enemy_block(e)
				continue
			if p.slash_hits_rect(e.body_rect()):
				if e is EnemyDummy:
					if not p.slash_used:
						_dummy_slash(e)
					continue
				if e is BossCheolgyeon:
					# 휘청 중이면 반격 베기, 아니면 권총으로 막음 (한 번 베기에 한 번)
					if not p.slash_used:
						if e.can_counter():
							_counter_hit(e)
						elif e.on_blocked(p):
							_boss_block(e)
					continue
				p.mark_used()
				_kill_enemy(e, p.slash_angle)
	# 3) 근접 공격 명중 → 플레이어 즉사 (패링 시퀀스로 입력이 잠긴 동안은 맞지 않음)
	if p.input_locked or cinematic:
		return
	# 철견 착지 충격파 (보라, 패링 불가 — 점프로 피함)
	if boss != null and is_instance_valid(boss) and not boss.dead and boss.wave_hits(p.body_rect()):
		_kill_player(-PI / 2.0, { "pattern": boss.pattern_name(3), "attack": "충격파", "type": Config.ATK_EVADE, "err": "패링 불가" })
		return
	for e in enemies():
		var box: Rect2 = e.attack_box()
		if box.has_area() and box.intersects(p.body_rect()):
			_kill_player((p.center() - e.center()).angle(), _melee_cause(e))
			return


## 돌격병이 무기 · 몸으로 베기를 막아냄: 불꽃 + 쇳소리. 베기는 쓰이지 않은 채 → 헛스윙 잠금 (일찍 누르면 패링 기회를 놓침)
func _enemy_block(e: Enemy) -> void:
	var p := player
	p.slash_used = true                  # 이 베기는 막혀서 끝남 — 이어서 패링 창에 들어와도 패링 안 됨 (쿨타임 그대로)
	var away := (p.center() - e.center()).angle()
	var at: Vector2 = p.tip()
	effects.burst(at, 8, Config.colors.parry, 200.0, away, 0.9, 0.18, { "glow": true, "streak": true })
	effects.burst(at, 3, Config.colors.player, 120.0, away, 1.2, 0.14, { "glow": true })
	Audio.boss_armor(1.3)
	add_shake(1.5, 0.1, away)
	var C: Dictionary = Config.charger
	p.stun(C.BLOCK_STUN, Vector2(signf(p.center().x - e.center().x) if absf(p.center().x - e.center().x) > 0.5 else -float(e.facing), -0.1).normalized() * C.BLOCK_PUSH)
	blocks += 1


## 수류탄 되치기: 쏜 적 우선 조준 스냅 → 없으면 마우스 방향. 짧은 히트스톱 + 패링음
func _bat_grenade(g: Grenade) -> void:
	var p := player
	p.mark_used()
	var aim := (get_global_mouse_position() - p.center()).angle()
	var th: Enemy = g.thrower as Enemy if is_instance_valid(g.thrower) else null
	var target := pick_reflect_target(p.center(), aim, th)
	var a := aim
	if target != null:
		a = (target.center() - g.global_position).angle()
	g.bat(a)
	TimeManager.hitstop(Config.grenade.BAT_HITSTOP)
	effects.burst(g.global_position, 10, Config.colors.parry, 220.0, a, 0.8, 0.2, { "glow": true, "streak": true })
	effects.ring(g.global_position, 14.0, 0.18, 2.0, Config.colors.parry)
	Audio.parry(1.15, 0.8)
	add_shake(3.0, 0.1, a)
	grenade_bats += 1


## 수류탄 폭발 (Grenade 가 부름): 반경 안 적은 모두 처치 · 플레이어 즉사 (구르기 무적이면 통과, 되친 수류탄은 플레이어를 해치지 않음)
func grenade_blast(g: Grenade) -> void:
	var G: Dictionary = Config.grenade
	var CC: Dictionary = Config.colors
	var c := g.global_position
	var R: float = G.RADIUS
	Audio.sfx("explosion")
	add_shake(G.SHAKE, 0.25, -PI / 2.0)
	effects.ring(c, R, G.BLAST_TIME, 4.0, CC.parry_hot)
	effects.ring(c, R * 0.6, G.BLAST_TIME * 0.7, 3.0, CC.player)
	effects.burst(c, 22, CC.parry_hot, 260.0, -PI / 2.0, PI, 0.4, { "glow": true, "streak": true })
	effects.burst(c, 12, CC.parry, 180.0, -PI / 2.0, PI, 0.3, { "glow": true })
	effects.burst(c, 10, CC.dust[0], 90.0, -PI / 2.0, 1.2, 0.6, { "size": 2.0, "grav": 200.0 })
	blasts += 1
	for e in enemies():
		if e is BossCheolgyeon or e is EnemyDummy:
			continue
		if _rect_dist(c, e.body_rect()) <= R:
			_kill_enemy(e, (e.center() - c).angle(), "blast")
			blast_kills += 1
	if not g.is_batted() and not player.dead and _rect_dist(c, player.body_rect()) <= R:
		_kill_player((player.center() - c).angle(), { "pattern": "척탄병", "attack": "수류탄 폭발", "type": Config.ATK_EVADE, "err": "패링 불가" })


static func _rect_dist(p: Vector2, r: Rect2) -> float:
	var q := Vector2(clampf(p.x, r.position.x, r.end.x), clampf(p.y, r.position.y, r.end.y))
	return p.distance_to(q)


func _parry_melee(e: Enemy) -> void:
	player.mark_used()
	parry_fx(player.tip(), player.slash_angle)
	_kill_enemy(e, player.slash_angle, "parry")


## 적 처치: 킬 연출 타임라인 (Config.kill)
##  킬 스톱 16f · 빛줄기+흙먼지 · 3겹 궤적 · 피 구름 · 킬 흔들림 · 흰 섬광 두 조각(해제 후 날아감) · 반동 · 처치음
##  cause: "slash"(직접 베기) | "parry"(근접 패링) | "reflect"(반사탄 — 그 틱 월드 갱신 전이라 그 틱도 멈춤)
func _kill_enemy(e: Enemy, angle: float, cause := "slash") -> void:
	if e.dead:
		return
	var C: Dictionary = Config.colors
	var K: Dictionary = Config.kill
	var p := player
	var by_parry := cause != "slash"
	var c := e.center()
	e.set_state("dead")                  # 무기 발광·조준선을 끄고 시체 자세로
	# 두 조각: 속도는 지금 정해지지만 킬 스톱이 끝나야 움직이기 시작
	gore.split(e.capture_silhouette(), e.global_position, c, angle, C.parry if by_parry else C.player, 1.0, true)
	# 1) 킬 스톱
	var stop: int = K.KILL_HITSTOP_FRAMES if Settings.on("hitstop") else 0
	TimeManager.kill_stop(stop)
	if cause == "reflect" and stop > 0:
		TimeManager.freeze_now()
	# 2) 빛줄기: 타격 지점(적 중심)을 지나 화면 밖에서 화면 밖으로
	if Settings.on("beam"):
		effects.beam(c, angle, view_rect())
	# 3) 3겹 궤적 (칼로 벤 경우 — 흰 반달 대신) + 반동 · 명중 스미어 (킬 스톱 동안 멈춘 채). 반사탄 · 폭발은 없음
	if cause in ["slash", "parry"] and not p.dead:
		p.impact_smear()
		if Settings.on("slash_trail"):
			var tr := p.take_trail()
			gore.kill_trail(p.center(), tr.get("angle", angle), tr.get("flip", 1))
			if stop <= 0:
				gore.release_trail()
		if Settings.on("recoil"):
			p.recoil(angle)
	# 4) 피: 공격 방향 앞쪽 원뿔로 빨간 덩어리 구름 (킬 스톱 중엔 천천히 퍼짐 → 해제 후 떨어져 자국)
	var n: int = randi_range(K.BLOOD_MIN, K.BLOOD_MAX) if Settings.on("gore") else 0
	var cone := deg_to_rad(K.BLOOD_CONE)
	for i in n:
		var a := angle + randf_range(-1.0, 1.0) * cone * (0.55 if randf() < 0.65 else 1.0)   # 가운데가 짙은 구름
		var v := randf_range(K.BLOOD_SPEED_MIN, K.BLOOD_SPEED_MAX)
		effects.spawn(c + Vector2(randf_range(-3, 3), randf_range(-4, 4)), Vector2(cos(a) * v, sin(a) * v - 30.0),
			K.BLOOD_LIFE * randf_range(0.75, 1.0), C.blood[i % C.blood.size()],
			{ "size": 3.0 if randf() < 0.45 else 2.0, "grav": K.BLOOD_GRAVITY, "stain": true, "slow": true })
	effects.burst(c, 8, C.parry if by_parry else C.player, 260.0, angle, 0.35, 0.18, { "glow": true, "streak": true })
	var shake_mul := 1.0
	# 5) 킬 흔들림
	start_kill_shake(angle, stop, shake_mul)
	kill_frame = 0
	Audio.kill()
	e.die(angle)


## 지금 화면에 보이는 월드 사각형
func view_rect() -> Rect2:
	var inv := get_viewport().get_canvas_transform().affine_inverse()
	return inv * Rect2(Vector2.ZERO, Vector2(Config.view.w, Config.view.h))


func _kill_player(angle: float, cause := {}) -> void:
	# 구르기 무적: 히트스캔 · 근접 · 충격파 · 보라색 공격 모두 통과
	if player.dead or player.is_invincible():
		return
	if not cause.is_empty():
		GameState.log_death(cause)
	pending_shots.clear()
	seq.cancel()
	player.input_locked = false
	add_shake(Config.fx.death_shake, 0.2, angle)
	# 플레이어도 두 조각 (절단선 빨강, 약하게 벌어짐) + 흰 파편
	gore.split(player.body_parts(), player.global_position, player.center(), angle, Config.colors.attack, 1.1)
	effects.burst(player.center(), 16, Config.colors.player, 180.0, angle, 1.0, 0.6, { "grav": 400.0 })
	player.die(angle)


func _on_player_died() -> void:
	game_state = "dead"
	TimeManager.hitstop(roundi(Config.fx.death_hitstop * Config.fps))
	Audio.death()


static func _centroid(pts: PackedVector2Array) -> Vector2:
	var c := Vector2.ZERO
	for q in pts:
		c += q
	return c / maxf(1.0, pts.size())
