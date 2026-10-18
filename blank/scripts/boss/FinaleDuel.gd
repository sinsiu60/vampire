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
## 그리기: 이 노드 (월드, 흑백 후처리 아래) + 색 유지 층 (_color — 흑백 층 위 CanvasLayer, 빗방울 · 총알 · 2겹 원 · 일섬 흰 선 · 검기)

const C := preload("res://scripts/boss/CheolgyeonConfig.gd")
const GRAY_SHADER := preload("res://shaders/finale_gray.gdshader")
const STEP_NAMES := { 1: "정적", 2: "대치", 3: "번개", 4: "움찔", 5: "빗방울", 7: "감속", 8: "멈춘 총알", 9: "일섬", 10: "여세 · 납도",
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
var _smear := {}                 # 일섬 스미어 { ticks, from, spikes } — 끝나면 흑백 반전
var smear_frames := 0            ## 그린 스미어 프레임 수 (테스트용)
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
var _qi := {}                    # 검기 { a, b, y, t } — 실제 시간: 뻗기 → 부풀기 · 일렁임 → 꼬리부터 걷힘
var _qi_bits: Array = []         # 검기가 걷히며 떨어져 나가는 색 조각 { pos, vel, t, life, col, size }
var _drift_from := 0.0           # 여세 시작 x (일섬 도착점)
var _drift_dist := 0.0           # 여세로 실제 미끄러질 거리 (벽 · 닫힌 문 앞에서 멈춤)
var _cutflash := -1.0            # 철견 몸 대각선 흰 선
var _topple := -1.0
var _cam_ret := {}               # 13 카메라 되돌림 { c, z, t }
var _cam_anim := {}              # 반격 확대 · 되돌림 { fc, fz, tc, tz, t, dur }
var _cam_pre := {}               # 반격 직전 카메라 (재개 뒤 여기로)
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
	process_mode = Node.PROCESS_MODE_PAUSABLE     # 일시정지면 연출 타이머도 같이 멈춤 (Main 은 ALWAYS)
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
	if not _smear.is_empty():
		_smear.ticks -= 1
		if _smear.ticks <= 0:
			_smear = {}
			_flash_ticks = C.FIN_INVERT_FRAMES     # 스미어 다음 틱에 흑백 반전
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
		b.say_key(C.FINALE_LINE, C.FIN_FACE - C.FIN_LINE_AT + C.FIN_FLASH)
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


# ---- 9) 일섬: 시간은 여전히 정지 — 이동하는 모습 없이 순간이동하듯 철견 뒤편 40px 로 (경로에 잔상 6).
##       같은 순간 총알이 위아래 두 조각으로 갈라져 공중에 멈추고 (bullet_split), 철견을 지난 것으로 execute + 흑백 반전 2프레임 ·
##       불꽃 · 화면을 가로지르는 흰 선 · 검기. 카메라는 공백을 확대
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
	var oc := p.center()
	var w: float = main.room.size_px().x
	_dest_x = clampf(b.global_position.x + _side * C.FIN_CUT_BEHIND, 12.0, w - 12.0)
	_dest_x = _free_x(_dest_x, -_side, _orig.y)   # 벽 · 닫힌 문 속이면 철견 쪽으로 물러난 빈자리
	p.finale_pose = "cut_end"
	p.facing = int(_side)
	for i in C.FIN_GHOSTS:
		var gk := (float(i) + 0.5) / C.FIN_GHOSTS
		p.add_ghost(Vector2(lerpf(_orig.x, _dest_x, gk), _orig.y))
	p.global_position = Vector2(_dest_x, _orig.y)
	p.velocity = Vector2.ZERO
	# 총알을 가름 (두 조각은 갈라진 채 정지)
	split_real = cut_real
	Audio.play_synced_real("bullet_split", split_real)
	if not _bullet.is_empty():
		var bp: Vector2 = _bullet.pos
		_halves = [{ "pos": bp + Vector2(0, -C.FIN_HALF_GAP), "vel": Vector2.ZERO, "t": 0.0, "up": true },
			{ "pos": bp + Vector2(0, C.FIN_HALF_GAP), "vel": Vector2.ZERO, "t": 0.0, "up": false }]
		_bullet = {}
	# 철견을 지남
	pass_real = cut_real
	Audio.sfx("execute")
	if Settings.on("smear"):
		_smear = { "ticks": C.FIN_SMEAR_FRAMES, "from": oc,
			"spikes": SmearFX.make_spikes(Vector2(_side, 0.0), C.FIN_SMEAR_SPIKES, C.FIN_SMEAR_SPIKE_LEN, 0.9) }
	else:
		_flash_ticks = C.FIN_INVERT_FRAMES
	_sparks(b.center())
	_line = { "y": oc.y, "full": true }
	_qi = { "a": oc.x - _side * C.FIN_QI_OVER, "b": p.center().x + _side * C.FIN_QI_OVER, "y": oc.y, "t": 0.0, "bits": false }
	# 카메라: 공백을 확대
	_cam_pre = _cam.duplicate()
	_cam_anim = { "fc": Vector2(_cam.center), "fz": float(_cam.zoom), "tc": p.center() + Vector2(0, C.FIN_CUT_ZOOM_Y),
		"tz": C.FIN_CUT_ZOOM, "t": 0.0, "dur": C.FIN_CUT_ZOOM_IN }
	timeline.append([-9, now()])
	_enter(9)


func _tick_cut() -> void:
	if st >= C.FIN_CUT_TIME - 1e-6:
		_enter(10)


## 발 위치 (x, y) 에 공백 몸이 들어갈 자리가 비었는가 — 지형 · 잠긴 문 (Door 의 충돌도 지형 층) 과 겹치면 false
func _fits(x: float, y: float) -> bool:
	var P: Dictionary = Config.player
	var q := PhysicsShapeQueryParameters2D.new()
	var box := RectangleShape2D.new()
	box.size = Vector2(float(P.w), float(P.h) - 2.0)         # 바닥에 닿은 발은 빼고 (1px 띄움)
	q.shape = box
	q.transform = Transform2D(0.0, Vector2(x, y - float(P.h) / 2.0 - 1.0))
	q.collision_mask = Config.layers.terrain | Config.layers.platform   # 떨어진 간판 (발판 층) 속에도 안 들어가게
	return main.get_world_2d().direct_space_state.intersect_shape(q, 1).is_empty()


## x 에서 dir 쪽으로 1px 씩 물러나며 처음 비어 있는 x (못 찾으면 x 그대로)
func _free_x(x: float, dir: float, y: float) -> float:
	for i in 400:
		var cx := x + dir * float(i)
		if _fits(cx, y):
			return cx
	return x


## from 에서 dir 쪽으로 최대 dist 만큼, 막히기 직전까지 갈 수 있는 거리
func _free_run(from: float, dir: float, dist: float, y: float) -> float:
	var d := 0.0
	while d < dist:
		var nd := minf(dist, d + 1.0)
		if not _fits(from + dir * nd, y):
			break
		d = nd
	return d


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


# ---- 10) 여세 + 납도: 정지가 풀리며 시간이 FIN_DRIFT_SCALE0 → 1.0 으로 서서히 (ease-in) 돌아옴.
##         공백은 일섬 끝 자세로 FIN_DRIFT_DIST 만큼 앞으로 미끄러지다 멈춤 (먼지 · 옅은 잔상) · 두 조각 · 불꽃 · 빗줄기도 시간과 함께 다시 움직임
##         마지막 FIN_SHEATHE 초 칼을 칼집에 → "착" = 시간 1.0 = 색 복귀
func _enter_sheathe() -> void:
	resume_real = now() + C.FIN_DRIFT
	Audio.play_synced_real("sheathe", resume_real)
	_drift_from = p.global_position.x
	_drift_dist = _free_run(_drift_from, _side, C.FIN_DRIFT_DIST, p.global_position.y)
	TimeManager.hold(false)
	TimeManager.set_slow(C.FIN_DRIFT_SCALE0)
	var d: Vector2 = Vector2(-_side, 0.0)
	for h in _halves:
		h.vel = d * C.FIN_SPLIT_SPEED + Vector2(0.0, -C.FIN_SPLIT_SPREAD if h.up else C.FIN_SPLIT_SPREAD)
	Audio.set_loop_volume(Audio.ambience_player(), C.FIN_RAIN_VOL, C.FIN_DRIFT)


func _drift_scale(u: float) -> float:
	return lerpf(C.FIN_DRIFT_SCALE0, 1.0, pow(clampf(u, 0.0, 1.0), C.FIN_DRIFT_POW))


func _tick_sheathe() -> void:
	var u := clampf(st / C.FIN_DRIFT, 0.0, 1.0)
	TimeManager.set_slow(_drift_scale(u))
	contrast = lerpf(C.FIN_CONTRAST_DECEL, C.FIN_CONTRAST, u)
	vignette = C.FIN_VIGNETTE * (1.0 - 0.5 * u)
	# 미끄러짐: 점점 느려지며 멈춤
	var su := clampf(st / C.FIN_DRIFT_SLIDE, 0.0, 1.0)
	var w: float = main.room.size_px().x
	var x := clampf(_drift_from + _side * _drift_dist * (1.0 - pow(1.0 - su, 2.0)), 12.0, w - 12.0)
	var moved := absf(x - p.global_position.x)
	p.global_position.x = x
	p.velocity = Vector2.ZERO
	if moved > 0.05:
		var tick := TimeManager.real_frames
		if tick % 3 == 0:
			main.effects.spawn(p.global_position + Vector2(-_side * 4.0 + randf_range(-2, 2), -1.0),
				Vector2(-_side * randf_range(20.0, 50.0), -randf_range(8.0, 30.0)), randf_range(0.25, 0.4), Config.colors.dust[0],
				{ "size": 2.0, "grav": 90.0 })
		if tick % 5 == 0 and su < 0.7:
			p.add_ghost(p.global_position, false)
	# 카메라: 확대한 채 공백을 따라감
	if _cam_anim.is_empty() and not _cam.is_empty():
		_cam = { "center": Vector2(_cam.center).lerp(p.center() + Vector2(0, C.FIN_CUT_ZOOM_Y), 0.2), "zoom": float(_cam.zoom) }
	var s0: float = C.FIN_DRIFT - C.FIN_SHEATHE
	if st >= s0:
		p.finale_pose = "sheathe"
		p.finale_k = clampf((st - s0) / C.FIN_SHEATHE, 0.0, 1.0)
	if now() >= resume_real - 1e-6:
		_resume()


# ---- 11) 시간 1.0 + 색 복귀 (같은 프레임, 여세 끝): 흰 선이 사라지며 철견 몸에 대각선 흰 선
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
	_line = {}
	_cutflash = 0.0
	Audio.kill()
	main.add_shake(C.FIN_KILL_SHAKE, 0.35, -PI / 2.0 + _side * 0.6)
	if arena != null:
		arena.rain_mul = 1.0
	Audio.set_loop_volume(Audio.ambience_player(), C.FIN_RAIN_VOL, 0.1)
	main.finale_boss_down(b, C.FIN_FALL, C.FIN_FALL + C.FIN_AFTER)
	if not _cam_pre.is_empty():
		_cam_anim = { "fc": Vector2(_cam.center), "fz": float(_cam.zoom), "tc": Vector2(_cam_pre.center), "tz": float(_cam_pre.zoom),
			"t": 0.0, "dur": C.FIN_CUT_ZOOM_OUT }
	timeline.append([11, now()])
	_enter(12)


# ---- 12) 쓰러짐: 페도라는 바람에 · 쌍권총은 바닥에 → 대사 (death) → 무릎 → 앞으로
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
		b.say_key(C.FIN_DOWN_LINE, C.FIN_FALL - C.FIN_DOWN_LINE_AT + 0.6)
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
	if not _cam_anim.is_empty():
		_cam_anim.t += rd
		var k := _smooth(float(_cam_anim.t) / float(_cam_anim.dur))
		_cam = { "center": Vector2(_cam_anim.fc).lerp(Vector2(_cam_anim.tc), k), "zoom": lerpf(float(_cam_anim.fz), float(_cam_anim.tz), k) }
		if k >= 1.0:
			_cam_anim = {}
	if not _ripple.is_empty():
		_ripple.t += rd
		if _ripple.t >= C.FIN_RIPPLE:
			_ripple = {}
	if _hint_t >= 0.0:
		_hint_t += rd
	# 두 조각: 월드 시간으로 (여세 동안 느리게 출발 → 점점 빨라짐)
	var wd := rd * Engine.time_scale
	for h in _halves:
		if Vector2(h.vel) != Vector2.ZERO:
			h.t += wd
			h.pos += Vector2(h.vel) * wd
	_halves = _halves.filter(func(h): return h.t < 0.5)
	if not _qi.is_empty():
		_qi.t += rd
		if _qi.t >= C.FIN_QI_HOLD and not _qi.bits:
			_qi.bits = true
			_spawn_qi_bits()
		if _qi.t >= C.FIN_QI_TIME:
			_qi = {}
	for q in _qi_bits:
		q.t += rd
		q.pos += Vector2(q.vel) * rd
		q.vel *= 0.93
		q.vel.y -= 30.0 * rd
	_qi_bits = _qi_bits.filter(func(q): return q.t < q.life)
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
	# 철견 몸의 대각선 흰 선
	if _cutflash >= 0.0:
		var k := 1.0 - _cutflash / C.FIN_CUT_FLASH
		var c := b.center()
		var f := float(b.facing)
		var a0 := c + Vector2(-9.0 * f, -22.0)
		var a1 := c + Vector2(9.0 * f, 20.0)
		draw_line(a0, a1, Color(1, 1, 1, 0.3 * k), 5.0 * k + 1.0)
		draw_line(a0, a1, Color(1, 1, 1, k), 2.0 * k + 0.5)


## 검기 모양: a → b 수평 초승달 (가운데가 두껍고 위로 휨, 양 끝은 뾰족) 의 s0 ~ s1 구간만. k = 사라지는 정도 (휨이 커짐)
func _qi_point(a: float, b2: float, y: float, s: float, k: float) -> Vector2:
	return Vector2(lerpf(a, b2, s), y - C.FIN_QI_BULGE * sin(s * PI) * (1.0 + k))


func _draw_qi(ci: CanvasItem, a: float, b2: float, y: float, s0: float, s1: float, thick: float, col: Color, k: float) -> void:
	if thick <= 0.2 or col.a <= 0.01 or absf(b2 - a) * (s1 - s0) < 2.0:
		return
	const N := 24
	var top := PackedVector2Array()
	var bot := PackedVector2Array()
	for i in N + 1:
		var s := lerpf(s0, s1, float(i) / N)
		# 잘린 끝도 뾰족하게: 구간 양 끝으로 갈수록 가늘게
		var edge := minf(1.0, minf(float(i), float(N - i)) / 4.0)
		var h := thick * pow(sin(s * PI), 0.7) * 0.5 * edge
		var c := _qi_point(a, b2, y, s, k)
		top.append(c + Vector2(0, -h))
		if i > 0 and i < N:                    # 양 끝은 위쪽 줄만 (같은 점이 두 번 들어가지 않게)
			bot.append(c + Vector2(0, h * 0.6))
	bot.reverse()
	ci.draw_colored_polygon(top + bot, col)


## 검기가 걷히기 시작할 때 초승달 위쪽을 따라 색 조각을 뿌림 (뒤쪽 · 위로 흩어지며 사라짐)
func _spawn_qi_bits() -> void:
	var CC: Dictionary = Config.colors
	var cols := [CC.trail_outer, CC.trail_mid, Color.WHITE]
	for i in C.FIN_QI_BITS:
		var s := randf_range(0.08, 0.95)
		var pt := _qi_point(float(_qi.a), float(_qi.b), float(_qi.y), s, 0.3) + Vector2(0, -randf_range(0.0, C.FIN_QI_THICK * 0.4))
		var v := Vector2(-_side * randf_range(10.0, 70.0), -randf_range(15.0, 60.0))
		_qi_bits.append({ "pos": pt, "vel": v, "t": 0.0, "life": randf_range(0.2, 0.4), "col": cols[i % cols.size()],
			"size": 2.0 if i % 3 == 0 else 1.0 })


## 검기 애니메이션 (실제 시간 t):
##  뻗기 0 ~ FIN_QI_SWEEP: 머리가 출발점 → 도착점으로 / 부풀기: 두께가 FIN_QI_PUNCH 만큼 부풀었다 돌아옴 · 바깥 겹 일렁임
##  걷힘 FIN_QI_HOLD ~ FIN_QI_TIME: 꼬리가 머리 쪽으로 쫓아가며 가늘어지고, 바깥 겹부터 옅어짐 + 색 조각
func _draw_qi_anim(ci: CanvasItem) -> void:
	var t: float = _qi.t
	var head := 1.0 - pow(1.0 - clampf(t / C.FIN_QI_SWEEP, 0.0, 1.0), 2.0)
	var f := clampf((t - C.FIN_QI_HOLD) / (C.FIN_QI_TIME - C.FIN_QI_HOLD), 0.0, 1.0)
	var tail := f * f
	var punch := 1.0 + C.FIN_QI_PUNCH * sin(PI * clampf(t / C.FIN_QI_PUNCH_TIME, 0.0, 1.0))
	var shimmer := 0.85 + 0.15 * sin(t * 70.0)
	var CC: Dictionary = Config.colors
	var layers := [[CC.trail_outer, 1.0, 0.45, 2.0], [CC.trail_mid, 0.6, 0.75, 1.4], [Color.WHITE, 0.28, 1.0, 1.0]]
	for L in layers:
		var thick: float = C.FIN_QI_THICK * float(L[1]) * punch * (1.0 - f * 0.7)
		var al: float = float(L[2]) * pow(1.0 - f, float(L[3])) * (shimmer if L[0] != Color.WHITE else 1.0)
		_draw_qi(ci, float(_qi.a), float(_qi.b), float(_qi.y), tail, head, thick, Color(L[0], al), f)
	# 머리 끝 번쩍 (뻗는 동안)
	if t < C.FIN_QI_SWEEP * 1.5:
		var hp := _qi_point(float(_qi.a), float(_qi.b), float(_qi.y), head, 0.0)
		ci.draw_circle(hp, 4.0, Color(1, 1, 1, 0.8))


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
	# 검기: 하늘 · 분홍 · 흰 3겹 초승달 띠 (흑백에서도 색 유지) — 뻗기 → 부풀기 → 꼬리부터 걷힘 + 색 조각 (_draw_qi_anim)
	if not _qi.is_empty():
		_draw_qi_anim(ci)
	for q in _qi_bits:
		var a := 1.0 - float(q.t) / float(q.life)
		var sz: float = q.size
		ci.draw_rect(Rect2(Vector2(q.pos).round(), Vector2(sz, sz)), Color(q.col, a))
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
	# 일섬 스미어 (클릭 직후 FIN_SMEAR_FRAMES 틱, 흑백 반전 전): 출발점 → 철견 뒤 뜨거운 궤적 + 크게 늘어난 공백 + 가시
	if not _smear.is_empty():
		smear_frames += 1
		var k: float = 1.0 - float(_smear.ticks) / float(C.FIN_SMEAR_FRAMES)
		var dir := Vector2(_side, 0.0)
		var pc := p.center()
		SmearFX.draw_trail(ci, Vector2(_smear.from), pc, C.FIN_SMEAR_TRAIL_W, k * 0.5)
		SmearFX.draw_spikes(ci, pc, _smear.spikes, k * 0.5)
		var lc := pc - p.global_position
		SmearFX.draw_body(ci, p.body_parts(), Transform2D(0.0, p.global_position),
			SmearFX.stretch_xf(lc, dir, lerpf(C.FIN_SMEAR_STRETCH, 2.0, k), lerpf(C.FIN_SMEAR_SQUASH, 0.75, k), C.FIN_SMEAR_BACK),
			dir, C.FIN_SMEAR_CHROMA)
