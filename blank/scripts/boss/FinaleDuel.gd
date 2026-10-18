extends Node2D
class_name FinaleDuel
## 철견 피날레 "멈춘 총알" 흑백 결투 — 실패하지 않는 연출. 플레이어의 클릭은 방아쇠일 뿐, 결과는 항상 일섬.
## 흑백이 된 세계에서 철견의 빨간 총알이 날아오며 시간이 서서히 느려져 공백 눈앞에서 멈추고, 클릭하면 멈춘 시간 속에서
## 공백만 움직여 총알을 가르고 철견을 관통 → 납도 "착" 과 같은 프레임에 시간 · 색이 한 번에 돌아옴.
## 모든 타이머는 실제 시간 (TimeManager.real_delta) — 시간이 느려지거나 멈춰도 그대로. 수치는 CheolgyeonConfig (FIN_*)
##
##  1 정적 → 2 대치 (흑백 시작) → 3 번개 → 4 움찔(가짜) → 5 빗방울 → [6 발사] → 7 감속 → 8 멈춘 총알 (입력 대기)
##  → 9 일섬 → 10 납도 → [11 시간 재개 + 색 복귀] → 12 쓰러짐 → 13 여운 → 끝 (출구 문은 Main 의 보스 처치 뒤 타이머)
## 입력: 총알이 완전히 멈추기 전 클릭 = 버퍼 → 멈추는 순간 일섬 · 멈춘 뒤 클릭 = 즉시 ·
##       멈춘 뒤 FINALE_HINT_TIME 원이 크게 번쩍 (힌트) · FINALE_AUTO_TIME 자동 일섬. 4 움찔 중 클릭은 무시 (버퍼에도 안 남김)
## 그리기: 이 노드 (월드, 흑백 후처리 아래) + 색 유지 층 (_color — 흑백 층 위 CanvasLayer, 빗방울 · 총알 · 2겹 원 · 일섬 흰 선)

const C := preload("res://scripts/boss/CheolgyeonConfig.gd")
const GRAY_SHADER := preload("res://shaders/finale_gray.gdshader")
const STEP_NAMES := { 1: "정적", 2: "대치", 3: "번개", 4: "움찔", 5: "빗방울", 7: "감속", 8: "멈춘 총알", 9: "일섬", 10: "납도",
	12: "쓰러짐", 13: "여운" }
const GRAY_LAYER := 2            ## 흑백 후처리 층 (ScreenFX 1 위, HUD 4 아래)
const COLOR_LAYER := 3           ## 색 유지 층

var main: Node
var b: BossCheolgyeon
var p: Player
var arena: Node = null

var step := 0                    ## 지금 단계 (STEP_NAMES)
var st := 0.0                    ## 지금 단계 경과 (실제 초)
var buffered := false            ## 총알이 멈추기 전에 누른 클릭이 있음
var cut_by := ""                 ## 일섬을 부른 것: buffer | click | auto
var signal_real := -1.0          ## 빗방울 착지 = 철견 발사 실제 시각
var stop_real := -1.0            ## 총알이 멈춘 실제 시각
var cut_real := -1.0             ## 일섬 시작 실제 시각
var split_real := -1.0           ## 공백이 총알을 가르는 실제 시각
var pass_real := -1.0            ## 공백이 철견을 지나는 실제 시각
var resume_real := -1.0          ## 시간 재개 (= sheathe "착") 실제 시각
var timeline: Array = []         ## [단계, 실제 시각] — 6 발사 · 11 재개 는 순간 사건 (테스트 · 디버그)
var done := false
var flash_frames := 0            ## 그려진 흰 화면 프레임 수 (번개 1 + 흑백 반전 2 + 여운 번개 1 — 테스트)
var saturation := 1.0            ## 흑백 후처리 (지금 값 — 테스트)
var contrast := 1.0
var vignette := 0.0

var _hb: AudioStreamPlayer = null
var _loop: AudioStreamPlayer = null  # slowmo_loop
var _rain0 := 0.35               # 피날레 전 rain_loop 볼륨 (13 에서 되돌림)
var _cam_from := {}              # { center, zoom } — 1 정적 시작 때 카메라
var _cam := {}                   # 지금 카메라 (Main.cam_override 로 넘김)
var _base := Vector2.ZERO        # 대치 화면 중심
var _cx_range := Vector2.ZERO    # 화면 중심 x 범위 (카메라가 벽에 막히지 않는 곳)
var _side := 1.0                 # 공백 → 철견 방향 (x 부호)
var _bx_from := 0.0
var _bx := 0.0
var _flags := {}                 # 단계 안에서 한 번만 하는 일
var _thunder_at := -1.0
var _flash_ticks := 0            # 흰 화면 + 검은 실루엣 남은 틱 (번개 · 흑백 반전)
var _drop := {}                  # 빗방울 { from, to, pos }
var _ripple := {}                # 물결 원 { pos, t }
var _bullet := {}                # 총알 { pos, dir, speed }
var _bstart := Vector2.ZERO
var _bstop := Vector2.ZERO
var _ring := false               # 공백 둘레 2겹 원 (감속 ~ 일섬)
var _hint_t := -1.0              # 힌트 번쩍
var _halves: Array = []          # 갈라진 두 조각 { pos, vel, t, up }
var _line := {}                  # 일섬 흰 선 { y, full }
var _orig := Vector2.ZERO        # 공백이 서 있던 발 위치
var _dest_x := 0.0
var _ghosts := 0
var _qi := {}                    # 검기 { a, b, y, t } — 정지 동안 t 멈춤
var _cutflash := -1.0            # 철견 몸 대각선 흰 선
var _topple := -1.0
var _cam_ret := {}               # 13 카메라 되돌림 { c, z, t }
var _gray_layer: CanvasLayer
var _gray_rect: ColorRect
var _color_layer: CanvasLayer
var _color: Node2D


func setup(m: Node, boss: BossCheolgyeon) -> void:
	main = m
	b = boss
	p = m.player
	arena = m.room.get_node_or_null("Arena")
	name = "FinaleDuel"
	z_index = 100
	z_as_relative = false


func _ready() -> void:
	# 흑백 후처리 (화면 전체) + 그 위 색 유지 층 (월드 좌표를 따라감)
	_gray_layer = CanvasLayer.new()
	_gray_layer.layer = GRAY_LAYER
	main.add_child(_gray_layer)
	_gray_rect = ColorRect.new()
	_gray_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_gray_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_gray_rect.size = Vector2(Config.view.w, Config.view.h)
	var mat := ShaderMaterial.new()
	mat.shader = GRAY_SHADER
	_gray_rect.material = mat
	_gray_rect.visible = false
	_gray_layer.add_child(_gray_rect)
	_color_layer = CanvasLayer.new()
	_color_layer.layer = COLOR_LAYER
	_color_layer.follow_viewport_enabled = true
	main.add_child(_color_layer)
	_color = Node2D.new()
	_color.draw.connect(_draw_color)
	_color_layer.add_child(_color)
	_enter(1)


func now() -> float:
	return TimeManager.real_time


func step_name() -> String:
	return STEP_NAMES.get(step, "-")


# ---------------------------------------------------------------- 진행
func _physics_process(_d: float) -> void:
	if done or not is_instance_valid(b) or not is_instance_valid(p):
		return
	var rd := TimeManager.real_delta()
	if _flash_ticks > 0:
		_flash_ticks -= 1
	st += rd
	if _thunder_at >= 0.0 and now() >= _thunder_at - 1e-6:
		_thunder_at = -1.0
		Audio.sfx("thunder")
	var click := not Debug.menu_open and Input.is_action_just_pressed("slash")
	if click and step in [1, 2, 3, 5, 7]:
		buffered = true                       # 총알이 멈추기 전 클릭 → 멈추는 순간 일섬 (4 움찔은 무시)
	match step:
		1: _tick_still()
		2: _tick_face()
		3:
			if st >= C.FIN_FLASH:
				_enter(4)
		4: _tick_twitch()
		5: _tick_drop()
		7: _tick_decel()
		8: _tick_stopped(click)
		9: _tick_cut()
		10: _tick_sheathe()
		12: _tick_fall()
		13: _tick_after()
	_tick_fx(rd)
	_apply_gray()
	main.cam_override = _cam
	p.queue_redraw()
	queue_redraw()
	if is_instance_valid(_color):
		_color.queue_redraw()


func _enter(n: int) -> void:
	step = n
	st = 0.0
	_flags = {}
	timeline.append([n, now()])
	match n:
		1: _enter_still()
		2: _enter_face()
		3:
			_flash_ticks = 1
			_thunder_at = now() + C.FIN_THUNDER_DELAY
		5: _enter_drop()
		8: _enter_stopped()
		10: _enter_sheathe()
		12: _enter_fall()
		13: _enter_after()


func _apply_gray() -> void:
	if not is_instance_valid(_gray_rect):
		return
	var on := saturation < 0.999 or contrast > 1.001 or vignette > 0.001
	_gray_rect.visible = on
	if on:
		var mat := _gray_rect.material as ShaderMaterial
		mat.set_shader_parameter("saturation", saturation)
		mat.set_shader_parameter("contrast", contrast)
		mat.set_shader_parameter("pivot", C.FIN_CONTRAST_PIVOT)
		mat.set_shader_parameter("vignette", vignette)


# ---- 1) 정적
func _enter_still() -> void:
	main.letterbox_time = C.FIN_LETTERBOX_IN
	main.cine_begin()                    # 입력 잠금 · 피격 없음 · 레터박스
	p.roll_enabled = false
	p.velocity = Vector2.ZERO
	Audio.fade_all_sfx(C.FIN_SFX_FADE)
	var amb := Audio.ambience_player()
	if amb != null:
		_rain0 = float(amb.get_meta("volume", _rain0))
		Audio.set_loop_volume(amb, C.FIN_RAIN_VOL, 0.8)
	_hb = Audio.play_loop("heartbeat", C.FIN_HEARTBEAT_VOL)
	b.body.snap("stagger")
	b.body.set_flash(false)
	b.face_player()
	if arena != null:
		arena.lightning_on = false
		arena.spots = [b, p]
		arena.rain_mul = 1.0
	_cam_from = { "center": main.camera.get_screen_center_position(), "zoom": float(main.zoom) }
	_cam = _cam_from.duplicate()


func _tick_still() -> void:
	if st >= C.FIN_RISE_AT and not _flags.has("rise"):
		_flags.rise = true
		b.body.pose("idle", C.FIN_RISE)
	if st >= C.FIN_STILL:
		_enter(2)


# ---- 2) 대치: 흑백으로 · 두 사람이 화면 양 끝에 마주 섬 · 줌 1.0 → 1.15
func _enter_face() -> void:
	_side = signf(b.global_position.x - p.global_position.x)
	if _side == 0.0:
		_side = -float(b.facing)
	# 가운데(cx)를 카메라가 벽에 막히지 않는 범위 안에 두고, 둘 다 그 양옆 자리로 물러섬
	var w: float = main.room.size_px().x
	var half_view: float = Config.view.w / 2.0 / C.FIN_ZOOM
	var hd: float = C.FIN_FACE_DIST / 2.0
	var lo := maxf(half_view, hd + 24.0)
	var hi := minf(w - half_view, w - hd - 24.0)
	_cx_range = Vector2(lo, hi) if lo <= hi else Vector2(w / 2.0, w / 2.0)
	var cx := clampf((p.global_position.x + b.global_position.x) / 2.0, _cx_range.x, _cx_range.y)
	_bx_from = b.global_position.x
	_bx = clampf(cx + _side * hd, 24.0, w - 24.0)
	var px := clampf(cx - _side * hd, 24.0, w - 24.0)
	var walk := absf(px - p.global_position.x)
	p.auto_walk = { "x": px, "speed": clampf(walk / (C.FIN_FACE * 0.6), 40.0, Config.player.run_speed), "face": int(_side) }
	_base = Vector2(cx, float(_cam_from.center.y))


func _tick_face() -> void:
	var g := clampf(st / C.FIN_GRAY_IN, 0.0, 1.0)
	saturation = 1.0 - g
	contrast = lerpf(1.0, C.FIN_CONTRAST, g)
	# 화면 중심 = 지금 두 사람 사이 (걸음이 간판 같은 장애물에 막혀도 가운데로)
	_base.x = clampf((p.global_position.x + b.global_position.x) / 2.0, _cx_range.x, _cx_range.y)
	var k := _smooth(st / C.FIN_FACE)
	_cam = { "center": Vector2(_cam_from.center).lerp(_base, k), "zoom": lerpf(float(_cam_from.zoom), C.FIN_ZOOM, k) }
	var u := _smooth(st / maxf(C.FIN_STEP_BACK, absf(_bx - _bx_from) / C.FIN_STEP_SPEED))
	b.global_position.x = lerpf(_bx_from, _bx, u)
	b.face_player()
	if u >= 1.0 and not _flags.has("duel"):
		_flags.duel = true
		b.body.snap("duel")
	if st >= C.FIN_LINE_AT and not _flags.has("line"):
		_flags.line = true
		b.say(C.FINALE_LINE, C.FIN_FACE - C.FIN_LINE_AT + C.FIN_FLASH)
	if st >= C.FIN_FACE:
		p.auto_walk = {}
		p.velocity.x = 0.0
		_enter(3)


# ---- 4) 움찔: 카메라가 철견 쪽으로 20px, 손가락 움찔 2회 (가짜) — 클릭 무시
func _tick_twitch() -> void:
	var lean := Vector2(_side * C.FIN_CAM_LEAN * _smooth(st / C.FIN_CAM_LEAN_TIME), 0.0)
	_cam = { "center": _base + lean, "zoom": C.FIN_ZOOM }
	for i in C.FIN_TWITCH_AT.size():
		var at: float = C.FIN_TWITCH_AT[i]
		if st >= at and not _flags.has("t%d" % i):
			_flags["t%d" % i] = true
			b.body.snap("twitch")
		if st >= at + C.FIN_TWITCH_LEN and not _flags.has("u%d" % i):
			_flags["u%d" % i] = true
			b.body.snap("duel")
	if st >= C.FIN_TWITCH:
		_enter(5)


# ---- 5) 빗방울: 심장 소리 멈춤 · rain_loop 0.2, 모자 챙 끝에서 아주 느리게 떨어짐, 빗줄기 10%
func _enter_drop() -> void:
	Audio.stop_loop(_hb, 0.0)
	_hb = null
	if arena != null:
		arena.rain_mul = C.FIN_DROP_RAIN_MUL
	Audio.set_loop_volume(Audio.ambience_player(), C.FIN_DROP_RAIN_VOL, 0.3)
	var from := brim_tip()
	_drop = { "from": from, "to": Vector2(from.x, b.global_position.y - 1.0), "pos": from }
	signal_real = now() + C.FIN_DROP
	Audio.play_synced_real("drip", signal_real)
	Audio.play_synced_real("quickdraw", signal_real)        # 착지 = 철견이 뽑아 쏘는 순간


func _tick_drop() -> void:
	var u := clampf(st / C.FIN_DROP, 0.0, 1.0)
	var e := u * (0.55 + 0.45 * u)                   # 아주 느리게 — 끝으로 갈수록 살짝 빨라짐
	_drop.pos = Vector2(_drop.from).lerp(_drop.to, e)
	var lean := Vector2(_side * C.FIN_CAM_LEAN, C.FIN_DROP_CAM * _smooth(u))
	_cam = { "center": _base + lean, "zoom": C.FIN_ZOOM }
	if now() >= signal_real - 1e-6:
		_fire()


# ---- 6) 철견의 발사: 물결 원 · 뽑아 쏨 (gun_fire 0.85 · 총구 섬광) · 빗줄기 정상 · 눈에 보이는 빨간 총알
func _fire() -> void:
	_ripple = { "pos": _drop.to, "t": 0.0 }
	_drop = {}
	if arena != null:
		arena.rain_mul = 1.0
	var oc := p.center()
	b.body.snap("draw_fire")
	var m := b.body.muzzle(0)
	var dir := (oc - m).normalized()
	b.body.set_aim(0, dir.angle())
	m = b.body.muzzle(0)
	dir = (oc - m).normalized()
	_bstart = m
	_bstop = oc - dir * C.FIN_BULLET_AHEAD
	_bullet = { "pos": m, "dir": dir, "speed": 0.0 }
	Audio.play("gun_fire", Config.audio.SFX_GUN, C.FIN_GUN_PITCH)
	Audio.play("slowmo_in", Config.audio.SFX_SLOWMO_IN, 1.0, true)   # 감속 시작과 동시에
	main.effects.burst(m, 10, Config.colors.attack, 160.0, dir.angle(), 0.5, 0.3, { "glow": true, "streak": true })
	main.effects.approach_flash(m)
	if arena != null:
		arena.flash_light(m, 70.0, 0.4)
	main.add_shake(3.0, 0.12, dir.angle())
	_ring = true
	timeline.append([6, now()])
	_enter(7)


# ---- 7) 감속: 시간 속도 1 → 0 (ease-out). 총알 위치 = 출발 + 거리 × (1 - (1-u)³) → 속도 비 (1-u)² = 시간 속도.
##        남은 거리로 계산해 공백 앞 FIN_BULLET_AHEAD px 에서 정확히 멈춤. 대비 1.2 → 1.3, 비네트 짙어짐, 2겹 원이 함께 줄어듦
func _tick_decel() -> void:
	var u := clampf(st / C.FIN_DECEL, 0.0, 1.0)
	var dist := _bstart.distance_to(_bstop)
	_bullet.pos = _bstart.lerp(_bstop, 1.0 - pow(1.0 - u, 3.0))
	var scale := pow(1.0 - u, 2.0)
	_bullet.speed = 3.0 * dist / C.FIN_DECEL * scale
	contrast = lerpf(C.FIN_CONTRAST, C.FIN_CONTRAST_DECEL, u)
	vignette = C.FIN_VIGNETTE * u
	if u >= 1.0:
		_bullet.pos = _bstop
		_bullet.speed = 0.0
		TimeManager.set_slow(1.0)
		TimeManager.hold(true)                 # 완전 정지 (재개하면 바로 1.0)
		stop_real = now()
		_enter(8)
		return
	TimeManager.set_slow(scale)


# ---- 8) 멈춘 총알: 완전 정지 · slowmo_loop 만 · 총알과 2겹 원이 숨쉬듯 — 클릭 대기
func _enter_stopped() -> void:
	Audio.fade_all_sfx(0.1)
	Audio.set_loop_volume(Audio.ambience_player(), 0.0, 0.1)
	_loop = Audio.play_loop("slowmo_loop", C.FIN_SLOWMO_LOOP_VOL)
	if buffered:
		_cut("buffer")


func _tick_stopped(click: bool) -> void:
	if click:
		_cut("click")
		return
	if st >= C.FINALE_HINT_TIME and _hint_t < 0.0:
		_hint_t = 0.0
	if st >= C.FINALE_AUTO_TIME - 1e-6:
		_cut("auto")


# ---- 9) 일섬: 시간은 여전히 정지 — 공백만 실제 시간으로 베어나감. 총알을 위아래로 가르고 철견을 관통해 뒤편 40px 까지
func _cut(by: String) -> void:
	if step != 8:
		return
	cut_by = by
	cut_real = now()
	Audio.stop_loop(_loop, 0.05)
	_loop = null
	_ring = false
	_hint_t = -1.0
	_orig = p.global_position
	var w: float = main.room.size_px().x
	_dest_x = clampf(b.global_position.x + _side * C.FIN_CUT_BEHIND, 12.0, w - 12.0)
	p.finale_pose = "cut_end"
	p.facing = int(_side)
	# 공백 몸 중심이 총알을 지나는 순간 = 가르는 순간 (bullet_split 타격)
	var span := absf(_dest_x - _orig.x)
	var fb := clampf(absf(float(_bullet.pos.x) - _orig.x) / maxf(span, 1.0), 0.0, 1.0)
	split_real = cut_real + C.FIN_CUT_TIME * fb
	Audio.play_synced_real("bullet_split", split_real)
	_line = { "y": p.center().y, "full": false }
	_qi = { "a": _orig.x - _side * 10.0, "b": _orig.x, "y": p.center().y, "t": 0.0 }
	_ghosts = 0
	_enter(9)


func _tick_cut() -> void:
	var u := clampf(st / C.FIN_CUT_TIME, 0.0, 1.0)
	var x := lerpf(_orig.x, _dest_x, u)
	# 잔상 6개: 지나간 자리마다
	while _ghosts < C.FIN_GHOSTS and u >= (float(_ghosts) + 0.5) / C.FIN_GHOSTS:
		var gk := (float(_ghosts) + 0.5) / C.FIN_GHOSTS
		p.add_ghost(Vector2(lerpf(_orig.x, _dest_x, gk), _orig.y))
		_ghosts += 1
	p.global_position = Vector2(x, _orig.y)
	p.velocity = Vector2.ZERO
	_qi.b = x + _side * 10.0
	# 총알을 가름: 두 조각이 위아래로 갈라진 채 공중에 멈춤
	if not _bullet.is_empty() and now() >= split_real - 1e-6:
		var bp: Vector2 = _bullet.pos
		_halves = [{ "pos": bp + Vector2(0, -C.FIN_HALF_GAP), "vel": Vector2.ZERO, "t": 0.0, "up": true },
			{ "pos": bp + Vector2(0, C.FIN_HALF_GAP), "vel": Vector2.ZERO, "t": 0.0, "up": false }]
		_bullet = {}
		timeline.append([-9, now()])          # 갈라짐
	# 철견을 지남: execute + 흑백 반전 2프레임 + 불꽃 (정지라 공중에 멈춤)
	if pass_real < 0.0 and (x - b.global_position.x) * _side >= 0.0:
		pass_real = now()
		Audio.sfx("execute")
		_flash_ticks = C.FIN_INVERT_FRAMES
		_sparks(b.center())
		timeline.append([-91, now()])         # 관통
	if u >= 1.0:
		_line.full = true
		_enter(10)


## 불꽃: 이미 퍼진 자리에서 시작 → 멈춘 세계에서 폭발이 공중에 활짝 핀 채로 멈춤 (흑백)
func _sparks(c: Vector2) -> void:
	var CC: Dictionary = Config.colors
	var ang := 0.0 if _side > 0.0 else PI
	for i in C.FIN_SPARKS:
		var core := i < C.FIN_SPARKS * 2 / 3
		var a := ang + randf_range(-1.0, 1.0) * (1.0 if core else 1.6)
		var v := Vector2.from_angle(a) * (300.0 if core else 220.0) * randf_range(0.35, 1.0)
		main.effects.spawn(c + v * randf_range(0.02, 0.09), v, randf_range(0.4, 0.7), CC.trail_core if core else CC.trail_outer,
			{ "glow": true, "streak": true })


# ---- 10) 납도 (여전히 정지, 완전 무음): 베어낸 끝 자세 → 마지막 0.45초 칼을 칼집에 → "착" = 시간 재개
func _enter_sheathe() -> void:
	resume_real = now() + C.FIN_SHEATHE_HOLD
	Audio.play_synced_real("sheathe", resume_real)


func _tick_sheathe() -> void:
	var s0: float = C.FIN_SHEATHE_HOLD - C.FIN_SHEATHE
	if st >= s0:
		p.finale_pose = "sheathe"
		p.finale_k = clampf((st - s0) / C.FIN_SHEATHE, 0.0, 1.0)
	if now() >= resume_real - 1e-6:
		_resume()


# ---- 11) 시간 재개 + 색 복귀 (같은 프레임): 슬로우 복귀 없이 즉시 1.0 · 두 조각이 날아감 · 흰 선이 사라지며 철견 몸에 대각선 흰 선
##          + kill_sound + 흔들림 8px · 빗줄기 정상 · rain_loop 0.5
func _resume() -> void:
	TimeManager.hold(false)
	TimeManager.set_slow(1.0)
	saturation = 1.0
	contrast = 1.0
	vignette = 0.0
	_apply_gray()
	p.finale_pose = ""
	p.finale_k = 0.0
	var d: Vector2 = Vector2(-_side, 0.0)
	for h in _halves:
		h.vel = d * C.FIN_SPLIT_SPEED + Vector2(0.0, -C.FIN_SPLIT_SPREAD if h.up else C.FIN_SPLIT_SPREAD)
	_line = {}
	_cutflash = 0.0
	Audio.kill()
	main.add_shake(C.FIN_KILL_SHAKE, 0.35, -PI / 2.0 + _side * 0.6)
	if arena != null:
		arena.rain_mul = 1.0
	Audio.set_loop_volume(Audio.ambience_player(), C.FIN_RAIN_VOL, 0.1)
	main.finale_boss_down(b, C.FIN_FALL, C.FIN_FALL + C.FIN_AFTER)
	timeline.append([11, now()])
	_enter(12)


# ---- 12) 쓰러짐: 페도라는 바람에 · 쌍권총은 바닥에 → "…빠르군." → 무릎 → 앞으로
func _enter_fall() -> void:
	for nm in ["Hat", "GunFShape", "GunBShape"]:
		var sh := b.body.part(nm)
		if sh == null or not sh.is_visible_in_tree():
			continue
		var parts: Array = b.body.silhouette(b.global_transform, [], [nm])
		var pc: Vector2 = sh.global_transform * _centroid(sh.polygon)
		var vel: Vector2 = C.FIN_HAT_VEL if nm == "Hat" else Vector2(C.FIN_GUN_VEL.x * randf_range(-1.0, 1.0), C.FIN_GUN_VEL.y * randf_range(0.7, 1.0))
		main.gore.toss(parts, b.global_position, pc, vel, randf_range(-14.0, 14.0) if nm == "Hat" else randf_range(-8.0, 8.0))
		sh.visible = false


func _tick_fall() -> void:
	if st >= C.FIN_DOWN_LINE_AT and not _flags.has("line"):
		_flags.line = true
		b.say(C.FIN_DOWN_LINE, C.FIN_FALL - C.FIN_DOWN_LINE_AT + 0.6)
	if st >= C.FIN_KNEEL_AT and not _flags.has("kneel"):
		_flags.kneel = true
		b.body.pose("land", 0.25)
	if st >= C.FIN_TOPPLE_AT and _topple < 0.0:
		_topple = 0.0
	if _topple >= 0.0:
		var k := clampf(_topple / C.FIN_TOPPLE_TIME, 0.0, 1.0)
		b.body.rotation = float(b.facing) * 1.45 * k * k
		if k >= 1.0 and not _flags.has("thud"):
			_flags.thud = true
			main.add_shake(3.0, 0.15, PI / 2.0)
			main.effects.burst(b.global_position + Vector2(b.facing * 28.0, -2.0), 10, Color("#6e6656"), 90.0, -PI / 2.0, 1.4, 0.4, {})
	if st >= C.FIN_FALL:
		_enter(13)


# ---- 13) 여운: rain_loop 원래대로, 번개 한 번 + thunder, 레터박스 해제, 무전 (출구는 Main 타이머로 2초 뒤)
func _enter_after() -> void:
	if arena != null:
		arena.rain_mul = 1.0
		arena.spots = []
		arena.lightning_on = true
	Audio.set_loop_volume(Audio.ambience_player(), _rain0, 0.5)
	_flash_ticks = 1
	_thunder_at = now() + C.FIN_THUNDER_DELAY
	main.cine_end()
	p.roll_enabled = true
	_cam_ret = { "c": Vector2(_cam.center), "z": float(_cam.zoom), "t": 0.0 }


func _tick_after() -> void:
	if not _cam_ret.is_empty():
		_cam_ret.t += TimeManager.real_delta()
		var k := _smooth(float(_cam_ret.t) / C.FIN_CAM_RETURN)
		var target: Vector2 = p.global_position + Vector2(0, -8)
		_cam = { "center": Vector2(_cam_ret.c).lerp(target, k), "zoom": lerpf(float(_cam_ret.z), 1.0, k) }
		if k >= 1.0:
			_cam_ret = {}
			_cam = {}
	if st >= C.FIN_AFTER:
		_finish()


func _finish() -> void:
	done = true
	timeline.append([14, now()])
	_cam = {}
	main.cam_override = {}
	main.letterbox_time = -1.0
	_free_layers()
	main.finale_done(self)
	queue_free()


func _free_layers() -> void:
	if is_instance_valid(_gray_layer):
		_gray_layer.queue_free()
	if is_instance_valid(_color_layer):
		_color_layer.queue_free()


## 디버그 (F8 · F10 · F11 로 피날레를 벗어남): 잡아 둔 것을 모두 되돌리고 사라짐
func abort() -> void:
	if done:
		return
	done = true
	TimeManager.hold(false)
	TimeManager.set_slow(1.0)
	Audio.stop_loop(_hb, 0.0)
	Audio.stop_loop(_loop, 0.0)
	Audio.set_loop_volume(Audio.ambience_player(), _rain0, 0.2)
	if arena != null:
		arena.rain_mul = 1.0
	if is_instance_valid(p):
		p.finale_pose = ""
		p.auto_walk = {}
		p.roll_enabled = true
	main.cam_override = {}
	main.letterbox_time = -1.0
	_free_layers()
	queue_free()


# ---------------------------------------------------------------- 효과 (실제 시간)
func _tick_fx(rd: float) -> void:
	if not _ripple.is_empty():
		_ripple.t += rd
		if _ripple.t >= C.FIN_RIPPLE:
			_ripple = {}
	if _hint_t >= 0.0:
		_hint_t += rd
	for h in _halves:
		if Vector2(h.vel) != Vector2.ZERO:
			h.t += rd
			h.pos += Vector2(h.vel) * rd
	_halves = _halves.filter(func(h): return h.t < 0.5)
	if not _qi.is_empty() and step >= 12:
		_qi.t += rd
		if _qi.t >= C.FIN_QI_TIME:
			_qi = {}
	if _cutflash >= 0.0:
		_cutflash += rd
		if _cutflash >= C.FIN_CUT_FLASH:
			_cutflash = -1.0
	if _topple >= 0.0:
		_topple += rd


## 모자 챙 끝 (철견이 보는 쪽으로 가장 튀어나온 점 · 그중 아래) — 빗방울이 맺히는 곳
func brim_tip() -> Vector2:
	var sh := b.body.part("Hat")
	if sh == null:
		return b.center() + Vector2(b.facing * 10.0, -24.0)
	var best := Vector2.ZERO
	var best_s := -INF
	for q in sh.polygon:
		var g: Vector2 = sh.global_transform * q
		var s := g.x * float(b.facing) * 10.0 + g.y          # 앞쪽 먼저, 같으면 아래
		if s > best_s:
			best_s = s
			best = g
	return best + Vector2(0, 2)


static func _smooth(x: float) -> float:
	var k := clampf(x, 0.0, 1.0)
	return k * k * (3.0 - 2.0 * k)


static func _centroid(pts: PackedVector2Array) -> Vector2:
	var c := Vector2.ZERO
	for q in pts:
		c += q
	return c / maxf(1.0, pts.size())


## 숨쉬듯 밝기 (멈춘 총알 · 2겹 원)
func _breath() -> float:
	if step != 8:
		return 1.0
	return 0.78 + 0.22 * cos(TAU * (now() - stop_real) / C.FIN_BREATH)


# ---------------------------------------------------------------- 그리기 — 월드 (흑백 후처리 아래)
func _draw() -> void:
	if done or not is_instance_valid(b) or not is_instance_valid(p):
		return
	# 번개 · 흑백 반전: 화면 전체 흰색 + 공백 · 철견 순수 검은 실루엣
	if _flash_ticks > 0:
		flash_frames += 1
		draw_rect(main.view_rect().grow(32.0), Color.WHITE)
		for s in b.body.silhouette(Transform2D.IDENTITY):
			draw_set_transform_matrix(s.xf)
			for shp in s.shapes:
				draw_colored_polygon(shp[1], Color.BLACK)
		for part in p.body_parts():
			draw_set_transform_matrix(Transform2D(0.0, p.global_position) * part.xf)
			for shp in part.shapes:
				draw_rect(shp[1], Color.BLACK)
		draw_set_transform_matrix(Transform2D.IDENTITY)
		return
	# 물결 원 (납작한 타원)
	if not _ripple.is_empty():
		var u: float = float(_ripple.t) / C.FIN_RIPPLE
		draw_set_transform(Vector2(_ripple.pos), 0.0, Vector2(1.0, 0.3))
		draw_arc(Vector2.ZERO, 2.0 + C.FIN_RIPPLE_R * u, 0.0, TAU, 32, Color(C.FIN_DROP_COLOR, 1.0 - u), 1.0)
		if u > 0.3:
			draw_arc(Vector2.ZERO, 1.0 + C.FIN_RIPPLE_R * (u - 0.3), 0.0, TAU, 24, Color(C.FIN_DROP_COLOR, (1.0 - u) * 0.6), 1.0)
		draw_set_transform_matrix(Transform2D.IDENTITY)
	# 검기: 베어나간 길의 3겹 초승달 (흑백 동안 회색, 색이 돌아오면 하늘 · 분홍 · 흰으로 사라짐)
	if not _qi.is_empty():
		var k: float = clampf(float(_qi.t) / C.FIN_QI_TIME, 0.0, 1.0)
		var CC: Dictionary = Config.colors
		var layers := [[CC.trail_outer, 1.0, 0.4], [CC.trail_mid, 0.6, 0.7], [Color.WHITE, 0.28, 0.95]]
		for L in layers:
			_draw_qi(float(_qi.a), float(_qi.b), float(_qi.y), C.FIN_QI_THICK * float(L[1]) * (1.0 - k * 0.6),
				Color(L[0], float(L[2]) * (1.0 - k)), k)
	# 철견 몸의 대각선 흰 선
	if _cutflash >= 0.0:
		var k := 1.0 - _cutflash / C.FIN_CUT_FLASH
		var c := b.center()
		var f := float(b.facing)
		var a0 := c + Vector2(-9.0 * f, -22.0)
		var a1 := c + Vector2(9.0 * f, 20.0)
		draw_line(a0, a1, Color(1, 1, 1, 0.3 * k), 5.0 * k + 1.0)
		draw_line(a0, a1, Color(1, 1, 1, k), 2.0 * k + 0.5)


## 검기 한 겹: x0 → x1 수평 초승달 (가운데가 두껍고 위로 휨, 양 끝은 뾰족). k = 사라지는 정도
func _draw_qi(x0: float, x1: float, y: float, thick: float, col: Color, k: float) -> void:
	if thick <= 0.2 or col.a <= 0.01 or absf(x1 - x0) < 2.0:
		return
	const N := 24
	var top := PackedVector2Array()
	var bot := PackedVector2Array()
	for i in N + 1:
		var s := float(i) / N
		var x := lerpf(x0, x1, s)
		var bulge := sin(s * PI)
		var cy := y - C.FIN_QI_BULGE * bulge * (1.0 + k)
		var h := thick * pow(bulge, 0.7) * 0.5
		top.append(Vector2(x, cy - h))
		if i > 0 and i < N:                    # 양 끝은 위쪽 줄만 (같은 점이 두 번 들어가지 않게)
			bot.append(Vector2(x, cy + h * 0.6))
	bot.reverse()
	draw_colored_polygon(top + bot, col)


# ---------------------------------------------------------------- 그리기 — 색 유지 층 (흑백 위): 빗방울 · 총알 · 2겹 원 · 일섬 흰 선
func _draw_color() -> void:
	if done or not is_instance_valid(b) or not is_instance_valid(p):
		return
	var ci := _color
	var br := _breath()
	# 빗방울 (하늘색)
	if not _drop.is_empty():
		var dp: Vector2 = _drop.pos
		var sz: Vector2 = C.FIN_DROP_SIZE
		ci.draw_rect(Rect2((dp - sz / 2.0).round(), sz), C.FIN_DROP_COLOR)
		ci.draw_rect(Rect2((dp - sz / 2.0).round() - Vector2.ONE, sz + Vector2(2, 2)), Color(C.FIN_DROP_COLOR, 0.25))
	# 공백 둘레 2겹 원 (빨강): 총알과 함께 줄어들어 멈추는 순간 최소 크기
	if _ring:
		var rem := C.FIN_DECEL - st if step == 7 else -0.001
		var info := { "remaining": rem, "aim_time": C.FIN_DECEL, "locked": false,
			"k": clampf(st / C.FIN_DECEL, 0.0, 1.0) if step == 7 else 1.0, "parryable": true, "attack_type": Config.ATK_OPPORTUNITY }
		Effects.draw_approach(ci, p.center(), info, 1.0, br)
		# 힌트: 원이 한 번 크게 번쩍
		if _hint_t >= 0.0 and _hint_t < C.FIN_HINT_FLASH:
			var u := _hint_t / C.FIN_HINT_FLASH
			var r := 8.0 + 34.0 * (1.0 - pow(1.0 - u, 3.0))
			ci.draw_arc(p.center().round(), r, 0.0, TAU, 48, Color(1, 1, 1, 0.9 * (1.0 - u)), 3.0)
			ci.draw_arc(p.center().round(), r + 4.0, 0.0, TAU, 48, Color(Config.colors.attack, 0.8 * (1.0 - u)), 2.0)
			ci.draw_circle(p.center().round(), 10.0, Color(1, 1, 1, 0.5 * (1.0 - u)))
	# 총알 (빨강 + 짧은 꼬리)
	var red: Color = Config.colors.attack
	if not _bullet.is_empty():
		var bp: Vector2 = Vector2(_bullet.pos).round()
		var dir: Vector2 = _bullet.dir
		var tail := minf(C.FIN_TAIL, float(_bullet.speed) * 0.02 + 2.0)
		ci.draw_line(bp - dir * tail, bp, Color(red, 0.55 * br), 2.0)
		ci.draw_rect(Rect2(bp - Vector2(2, 2), Vector2(4, 4)), Color(red, 0.3 * br))
		ci.draw_rect(Rect2(bp - Vector2(1, 1), Vector2(2, 2)), Color(red, br))
	# 갈라진 두 조각 (빨강)
	for h in _halves:
		var a := clampf(1.0 - float(h.t) / 0.5, 0.0, 1.0)
		ci.draw_rect(Rect2(Vector2(h.pos).round() - Vector2(1, 0), Vector2(2, 1)), Color(red, a))
	# 일섬 흰 선 (3px, 정지 동안 그대로): 베어나가는 동안은 지나온 곳까지, 끝나면 화면 전체
	if not _line.is_empty():
		var v: Rect2 = main.view_rect()
		var y: float = _line.y
		var x0 := v.position.x - 8.0 if _side > 0.0 else v.end.x + 8.0
		var x1: float = p.center().x
		if _line.full:
			x1 = v.end.x + 8.0 if _side > 0.0 else v.position.x - 8.0
		ci.draw_line(Vector2(x0, y), Vector2(x1, y), Color(1, 1, 1, 0.35), C.FIN_LINE_W + 2.0)
		ci.draw_line(Vector2(x0, y), Vector2(x1, y), Color.WHITE, C.FIN_LINE_W)
