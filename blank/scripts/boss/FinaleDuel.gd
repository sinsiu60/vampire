extends Node2D
class_name FinaleDuel
## 철견 피날레 "빗방울 결투" — 실패하지 않는 연출. 플레이어의 클릭은 방아쇠일 뿐, 결과는 항상 일섬.
## 모든 타이머는 실제 시간 (TimeManager.real_delta) — 시간 정지 · 슬로우와 상관없이 흐름. 수치는 CheolgyeonConfig (FIN_*)
##
##  1 정적 → 2 대치 → 3 번개 → 4 움찔(가짜) → 5 빗방울 → 6 신호: 철견이 먼저 쏨 → 총알이 공백 바로 앞에서 거의 멈춤 (입력 대기)
##  → 7 일섬 → 8 멈춘 세계 (끝 = 9 납도 · 시간 재개) → 10 갈라진 총알 → 11 쓰러짐 → 12 여운 → 끝 (출구 문은 Main 의 보스 처치 뒤 타이머)
## 입력: 총알이 앞에 오기 전 클릭 = 버퍼 → 총알이 앞에 오는 순간 일섬 · 그 뒤 클릭 = 즉시 ·
##       총알이 앞에 온 뒤 FINALE_AUTO_TIME 동안 없으면 원이 번쩍 → 자동. 4 움찔 중 클릭은 무시 (버퍼에도 안 남김)
## Main 의 자식으로 붙음 (월드 좌표로 그림, 어둠 · 비 위 z 100)

const C := preload("res://scripts/boss/CheolgyeonConfig.gd")
const STEP_NAMES := { 1: "정적", 2: "대치", 3: "번개", 4: "움찔", 5: "빗방울", 6: "신호", 7: "일섬", 8: "멈춘 세계",
	10: "갈라진 총알", 11: "쓰러짐", 12: "여운" }

var main: Node
var b: BossCheolgyeon
var p: Player
var arena: Node = null

var step := 0                    ## 지금 단계 (STEP_NAMES)
var st := 0.0                    ## 지금 단계 경과 (실제 초)
var buffered := false            ## 신호 전에 누른 클릭이 있음
var cut_by := ""                 ## 일섬을 부른 것: buffer | click | auto
var signal_real := -1.0          ## 신호 (빗방울 착지) 실제 시각
var fire_real := -1.0            ## 철견 발사 실제 시각 (quickdraw 타격)
var arrive_real := -1.0          ## 총알이 공백 앞에 와서 거의 멈춘 실제 시각 (이때부터 입력 = 일섬)
var cut_real := -1.0             ## 일섬 실제 시각
var resume_real := -1.0          ## 시간 재개 (= sheathe "착") 실제 시각
var split_real := -1.0           ## 총알이 갈라지는 실제 시각
var timeline: Array = []         ## [단계, 실제 시각] — 테스트 · 디버그
var done := false
var flash_frames := 0            ## 그려진 흰 화면 프레임 수 (번개 1 + 흑백 반전 2 + 여운 번개 1 — 테스트)

var _hb: AudioStreamPlayer = null
var _rain0 := 0.35               # 피날레 전 rain_loop 볼륨 (12 에서 되돌림)
var _cam_from := {}              # { center, zoom } — 1 정적 시작 때 카메라
var _cam := {}                   # 지금 카메라 (Main.cam_override 로 넘김)
var _base := Vector2.ZERO        # 대치 화면 중심
var _cx_range := Vector2.ZERO    # 화면 중심 x 범위 (카메라가 벽에 막히지 않는 곳)
var _side := 1.0                 # 공백 → 철견 방향 (x 부호)
var _bx_from := 0.0
var _bx := 0.0
var _flags := {}                 # 단계 안에서 한 번만 하는 일
var _qd := {}                    # quickdraw 예약 (Audio.play_synced_real)
var _thunder_at := -1.0
var _flash_ticks := 0            # 흰 화면 + 검은 실루엣 남은 틱 (번개 · 흑백 반전)
var _drop := {}                  # 빗방울 { from, to, pos }
var _ripple := {}                # 물결 원 { pos, t }
var _ring_t := -1.0              # 공백 둘레 2겹 원 (신호부터)
var _auto_flash := -1.0
var _line := {}                  # 일섬 흰 선 { y, t }
var _bullet := {}                # 멈춘 총알 { pos, dir }
var _halves: Array = []          # 갈라진 두 조각 { pos, vel, t }
var _cutflash := -1.0            # 철견 몸 대각선 흰 선
var _topple := -1.0
var _cam_ret := {}               # 12 카메라 되돌림 { from_c, from_z, t }
var _bstart := Vector2.ZERO      # 총알 출발 (총구) · 멈출 곳 (공백 앞)
var _bstop := Vector2.ZERO
var _qi := {}                    # 검기 { a, b, y, t } — 멈춘 세계 동안 t 가 멈춤
var _xcut := {}                  # 철견 몸을 가르는 X 자 { c, t }
var _stop_ring := -1.0           # 시간 정지 순간 퍼지는 고리 (실제 시간)
var _tint := 0.0                 # 멈춘 세계 색 0~1


func setup(m: Node, boss: BossCheolgyeon) -> void:
	main = m
	b = boss
	p = m.player
	arena = m.room.get_node_or_null("Arena")
	name = "FinaleDuel"
	z_index = 100
	z_as_relative = false


func _ready() -> void:
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
	match step:
		1: _tick_still(click)
		2: _tick_face(click)
		3: _tick_flash(click)
		4: _tick_twitch()
		5: _tick_drop(click)
		6: _tick_signal(click)
		7:
			if st >= C.FIN_INVERT_FRAMES * rd - 1e-6:
				_enter(8)
		8: _tick_freeze()
		10: _tick_split(rd)
		11: _tick_fall()
		12: _tick_after()
	_tick_fx(rd)
	main.cam_override = _cam
	p.queue_redraw()
	queue_redraw()


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
		4: pass
		5: _enter_drop()
		6: _enter_signal()
		8: _enter_freeze()
		10: _enter_split()
		11: _enter_fall()
		12: _enter_after()


## 총알이 앞에 오기 전 클릭: 버퍼 (총알이 앞에 오는 순간 일섬)
func _buffer(click: bool) -> void:
	if click:
		buffered = true


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


func _tick_still(click: bool) -> void:
	_buffer(click)
	if st >= C.FIN_RISE_AT and not _flags.has("rise"):
		_flags.rise = true
		b.body.pose("idle", C.FIN_RISE)
	if st >= C.FIN_STILL:
		_enter(2)


# ---- 2) 대치: 철견이 물러나 화면 양 끝에 마주 섬, 줌 1.0 → 1.15
func _enter_face() -> void:
	_side = signf(b.global_position.x - p.global_position.x)
	if _side == 0.0:
		_side = -float(b.facing)
	# 두 사람을 화면 양 끝에: 가운데(cx)를 카메라가 벽에 막히지 않는 범위 안에 두고, 둘 다 그 양옆 자리로 물러섬
	var w: float = main.room.size_px().x
	var half_view: float = Config.view.w / 2.0 / C.FIN_ZOOM
	var hd: float = C.FIN_FACE_DIST / 2.0
	var lo := maxf(half_view, hd + 24.0)
	var hi := minf(w - half_view, w - hd - 24.0)
	var cx := (p.global_position.x + b.global_position.x) / 2.0
	_cx_range = Vector2(lo, hi) if lo <= hi else Vector2(w / 2.0, w / 2.0)
	cx = clampf(cx, _cx_range.x, _cx_range.y)
	_bx_from = b.global_position.x
	_bx = clampf(cx + _side * hd, 24.0, w - 24.0)
	var px := clampf(cx - _side * hd, 24.0, w - 24.0)
	var walk := absf(px - p.global_position.x)
	p.auto_walk = { "x": px, "speed": clampf(walk / (C.FIN_FACE * 0.6), 40.0, Config.player.run_speed), "face": int(_side) }
	_base = Vector2(cx, float(_cam_from.center.y))


func _tick_face(click: bool) -> void:
	_buffer(click)
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


# ---- 3) 번개
func _tick_flash(click: bool) -> void:
	_buffer(click)
	if st >= C.FIN_FLASH:
		_enter(4)


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


# ---- 5) 빗방울: 심장 소리 멈춤, 모자 챙 끝에서 아주 느리게 떨어짐, 빗줄기 10% · rain_loop 0.2
func _enter_drop() -> void:
	Audio.stop_loop(_hb, 0.0)
	_hb = null
	if arena != null:
		arena.rain_mul = C.FIN_DROP_RAIN_MUL
	Audio.set_loop_volume(Audio.ambience_player(), C.FIN_DROP_RAIN_VOL, 0.3)
	var from := brim_tip()
	_drop = { "from": from, "to": Vector2(from.x, b.global_position.y - 1.0), "pos": from }
	signal_real = now() + C.FIN_DROP
	fire_real = signal_real + C.FIN_DRAW_DELAY
	Audio.play_synced_real("drip", signal_real)
	_qd = Audio.play_synced_real("quickdraw", fire_real)     # 철견이 뽑아 쏘는 순간에 맞춰


func _tick_drop(click: bool) -> void:
	_buffer(click)
	var u := clampf(st / C.FIN_DROP, 0.0, 1.0)
	var e := u * (0.55 + 0.45 * u)                   # 아주 느리게 — 끝으로 갈수록 살짝 빨라짐
	_drop.pos = Vector2(_drop.from).lerp(_drop.to, e)
	var lean := Vector2(_side * C.FIN_CAM_LEAN, C.FIN_DROP_CAM * _smooth(u))
	_cam = { "center": _base + lean, "zoom": C.FIN_ZOOM }
	if now() >= signal_real - 1e-6:
		_enter(6)


# ---- 6) 신호: 물결 원 → 철견이 먼저 뽑아 쏨 → 총알이 점점 느려지며 공백 바로 앞에서 거의 멈춤 (월드도 느려짐) → 입력
func _enter_signal() -> void:
	_ripple = { "pos": _drop.to, "t": 0.0 }
	_drop = {}


func _tick_signal(click: bool) -> void:
	var arrived := arrive_real >= 0.0
	if click:
		if arrived:
			_cut("click")
			return
		buffered = true                       # 총알이 오기 전 클릭 → 오는 순간 일섬
	if _bullet.is_empty() and now() >= fire_real - 1e-6:
		_fire()
	if _bullet.is_empty():
		return
	var d: Vector2 = _bullet.dir
	if not arrived:
		var u := clampf((now() - fire_real) / C.FIN_BULLET_TRAVEL, 0.0, 1.0)
		var e := 1.0 - pow(1.0 - u, 3.0)      # 처음엔 빠르고 점점 느려짐
		_bullet.pos = _bstart.lerp(_bstop, e)
		_bullet.speed = 3.0 * pow(1.0 - u, 2.0) * _bstart.distance_to(_bstop) / C.FIN_BULLET_TRAVEL
		if u >= 1.0:
			_arrive()
		return
	# 앞에 떠 있음: 아주 조금씩 다가오며 떨림
	var held := now() - arrive_real
	_bullet.pos = _bstop + d * C.FIN_BULLET_CREEP * held
	_bullet.speed = C.FIN_BULLET_CREEP
	_bullet.jit = Vector2(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)) * C.FIN_BULLET_JITTER
	if held >= C.FINALE_AUTO_TIME - C.FIN_AUTO_FLASH and _auto_flash < 0.0:
		_auto_flash = 0.0
	if held >= C.FINALE_AUTO_TIME - 1e-6:
		_cut("auto")


## 철견 발사: 뽑아 쏜 자세 · 총구 섬광 · 반동 흔들림 · 월드가 느려지며 총알 시간
func _fire() -> void:
	var oc := p.center()
	b.body.snap("draw_fire")
	var m := b.body.muzzle(0)
	var dir := (oc - m).normalized()
	b.body.set_aim(0, dir.angle())
	m = b.body.muzzle(0)
	dir = (oc - m).normalized()
	_bstart = m
	_bstop = oc - dir * C.FIN_BULLET_AHEAD
	_bullet = { "pos": m, "dir": dir, "speed": 0.0, "jit": Vector2.ZERO }
	main.effects.burst(m, 10, Config.colors.attack, 160.0, dir.angle(), 0.5, 0.3, { "glow": true, "streak": true })
	main.effects.approach_flash(m)
	if arena != null:
		arena.flash_light(m, 70.0, 0.4)
	main.add_shake(3.0, 0.12, dir.angle())
	TimeManager.set_slow(C.FIN_BULLET_SLOW)
	Audio.play("slowmo_in", C.FIN_SLOWMO_VOL, 1.0, true)
	timeline.append([-6, now()])               # 발사


## 총알이 공백 앞에 옴: 2겹 원 → 입력 대기 (먼저 눌렀으면 바로 일섬)
func _arrive() -> void:
	arrive_real = now()
	_bullet.pos = _bstop
	_ring_t = 0.0
	timeline.append([-7, now()])               # 앞에 옴
	if buffered:
		_cut("buffer")


# ---- 7) 일섬: 흑백 반전 2프레임 · 철견 뒤 40px 로 순간이동 (잔상 6) · 화면을 가로지르는 흰 선 · 검기 · X 자 · 불꽃 · 흔들림
func _cut(by: String) -> void:
	cut_by = by
	cut_real = now()
	TimeManager.set_slow(1.0)
	Audio.sfx("execute")
	Audio.swing()
	_ring_t = -1.0
	_auto_flash = -1.0
	var orig := p.global_position
	var oc := p.center()
	if _bullet.is_empty():                      # (안전) 아직 안 쐈으면 지금 쏜 것으로
		_fire()
		_bullet.pos = _bstop
	_bullet.jit = Vector2.ZERO
	# 공백: 철견을 관통해 뒤편으로
	p.finale_pose = "cut_end"
	p.facing = int(_side)
	var w: float = main.room.size_px().x
	var dest_x := clampf(b.global_position.x + _side * C.FIN_CUT_BEHIND, 12.0, w - 12.0)
	for i in C.FIN_GHOSTS:
		var k := (float(i) + 0.5) / C.FIN_GHOSTS
		p.add_ghost(Vector2(lerpf(orig.x, dest_x, k), orig.y))
	p.global_position = Vector2(dest_x, orig.y)
	p.velocity = Vector2.ZERO
	_line = { "y": oc.y, "t": 0.0 }
	_flash_ticks = C.FIN_INVERT_FRAMES
	# 검기 · X 자 · 불꽃 (불꽃 · 충격파는 월드 시간이라 멈춘 세계에서 공중에 멈춤)
	var bc := b.center()
	var ang := 0.0 if _side > 0.0 else PI
	_qi = { "a": oc.x - _side * C.FIN_QI_OVER, "b": p.center().x + _side * C.FIN_QI_OVER, "y": oc.y, "t": 0.0 }
	_xcut = { "c": bc, "t": 0.0 }
	var CC: Dictionary = Config.colors
	# 불꽃은 이미 퍼진 자리에서 시작 → 멈춘 세계에서 폭발이 공중에 활짝 핀 채로 멈춤
	for i in C.FIN_SPARKS + C.FIN_SPARKS / 2:
		var core := i < C.FIN_SPARKS
		var a := ang + randf_range(-1.0, 1.0) * (1.1 if core else 1.6)
		var v := Vector2.from_angle(a) * (300.0 if core else 220.0) * randf_range(0.35, 1.0)
		var pre := randf_range(0.02, 0.1)
		main.effects.spawn(bc + v * pre, v, randf_range(0.6, 1.0) * (0.6 if core else 0.7),
			CC.trail_core if core else CC.trail_outer, { "glow": true, "streak": true })
	main.effects.burst(_bullet.pos, 10, CC.parry, 160.0, ang + PI, 1.2, 0.4, { "glow": true, "streak": true })
	main.effects.ring(bc, 46.0, 0.35, 3.0, Color.WHITE)
	main.effects.ring(bc, 26.0, 0.25, 2.0, CC.trail_outer)
	main.add_shake(C.FIN_SLASH_SHAKE, C.FIN_SLASH_SHAKE_TIME, ang)
	_enter(7)


# ---- 8) 멈춘 세계: 시간 정지, 모든 소리 무음. 마지막 0.45초 납도 → "착" 과 동시에 시간 재개
func _enter_freeze() -> void:
	TimeManager.hold(true)
	_stop_ring = 0.0
	Audio.fade_all_sfx(C.FIN_SFX_CUT)
	Audio.set_loop_volume(Audio.ambience_player(), 0.0, C.FIN_SFX_CUT)
	resume_real = now() + C.FIN_FREEZE
	split_real = resume_real + C.FIN_SPLIT_DELAY
	Audio.play_synced_real("sheathe", resume_real)
	Audio.play_synced_real("bullet_split", split_real)


func _tick_freeze() -> void:
	var s0: float = C.FIN_FREEZE - C.FIN_SHEATHE
	if st >= s0:
		p.finale_pose = "sheathe"
		p.finale_k = clampf((st - s0) / C.FIN_SHEATHE, 0.0, 1.0)
	if now() >= resume_real - 1e-6:
		# 9) 납도 = 시간 재개 (슬로우 복귀 없이 즉시)
		TimeManager.hold(false)
		p.finale_pose = ""
		p.finale_k = 0.0
		main.add_shake(C.FIN_RESUME_SHAKE, 0.15, PI / 2.0)
		timeline.append([9, now()])
		_enter(10)


# ---- 10) 갈라진 총알
func _enter_split() -> void:
	Audio.set_loop_volume(Audio.ambience_player(), C.FIN_RAIN_VOL, 0.1)


func _tick_split(rd: float) -> void:
	if not _bullet.is_empty():
		if now() >= split_real - 1e-6:
			var d: Vector2 = _bullet.dir
			var n := d.orthogonal()
			for sgn in [-1.0, 1.0]:
				_halves.append({ "pos": Vector2(_bullet.pos) + n * sgn, "vel": d * C.FIN_SPLIT_SPEED + n * sgn * C.FIN_SPLIT_SPREAD, "t": 0.0 })
			_bullet = {}
			timeline.append([-10, now()])            # 갈라진 순간
		else:
			_bullet.pos += Vector2(_bullet.dir) * C.FIN_SPLIT_SPEED * rd
	if st >= C.FIN_SPLIT_DELAY + C.FIN_SPLIT - 1e-6:
		_enter(11)


# ---- 11) 쓰러짐: 대각선 흰 선 + kill_sound + 흔들림 8px, 페도라는 바람에 · 쌍권총은 바닥에 → "…빠르군." → 무릎 → 앞으로
func _enter_fall() -> void:
	_cutflash = 0.0
	Audio.kill()
	main.add_shake(C.FIN_FALL_SHAKE, 0.35, -PI / 2.0 + _side * 0.6)
	main.finale_boss_down(b, C.FIN_FALL, C.FIN_FALL + C.FIN_AFTER)
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
		_enter(12)


# ---- 12) 여운: 빗줄기 · rain_loop 원래대로, 번개 한 번 + thunder, 레터박스 해제, 무전 (출구는 Main 타이머로 2초 뒤)
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
	timeline.append([13, now()])
	_cam = {}
	main.cam_override = {}
	main.letterbox_time = -1.0
	main.finale_done(self)
	queue_free()


## 디버그 (F8 · F10 · F11 로 피날레를 벗어남): 잡아 둔 것을 모두 되돌리고 사라짐
func abort() -> void:
	if done:
		return
	done = true
	TimeManager.hold(false)
	TimeManager.set_slow(1.0)
	Audio.stop_loop(_hb, 0.0)
	Audio.cancel_synced(_qd)
	Audio.set_loop_volume(Audio.ambience_player(), _rain0, 0.2)
	if arena != null:
		arena.rain_mul = 1.0
	if is_instance_valid(p):
		p.finale_pose = ""
		p.auto_walk = {}
		p.roll_enabled = true
	main.cam_override = {}
	main.letterbox_time = -1.0
	queue_free()


# ---------------------------------------------------------------- 효과 (실제 시간)
func _tick_fx(rd: float) -> void:
	if not _ripple.is_empty():
		_ripple.t += rd
		if _ripple.t >= C.FIN_RIPPLE:
			_ripple = {}
	if _ring_t >= 0.0:
		_ring_t += rd
	if _auto_flash >= 0.0:
		_auto_flash += rd
	if not _line.is_empty():
		_line.t += rd
		if _line.t >= C.FIN_LINE_TIME:
			_line = {}
	for h in _halves:
		h.t += rd
		h.pos += Vector2(h.vel) * rd
	_halves = _halves.filter(func(h): return h.t < 0.6)
	if _cutflash >= 0.0:
		_cutflash += rd
		if _cutflash >= C.FIN_CUT_FLASH:
			_cutflash = -1.0
	if _topple >= 0.0:
		_topple += rd
	# 검기 · X 자: 멈춘 세계 동안엔 번쩍인 그대로
	if not TimeManager.held:
		if not _qi.is_empty():
			_qi.t += rd
			if _qi.t >= C.FIN_QI_TIME:
				_qi = {}
		if not _xcut.is_empty():
			_xcut.t += rd
			if _xcut.t >= C.FIN_QI_TIME:
				_xcut = {}
	if _stop_ring >= 0.0:
		_stop_ring += rd
		if _stop_ring >= C.FIN_STOP_RING_TIME:
			_stop_ring = -1.0
	_tint = minf(1.0, _tint + rd / 0.1) if step == 8 else maxf(0.0, _tint - rd / 0.15)


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


# ---------------------------------------------------------------- 그리기 (월드 좌표, 어둠 · 비 위)
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
	# 멈춘 세계: 화면이 푸르스름하게
	if _tint > 0.0:
		var tc: Color = C.FIN_STOP_TINT
		draw_rect(main.view_rect().grow(32.0), Color(tc, tc.a * _tint))
	# 빗방울
	if not _drop.is_empty():
		var dp: Vector2 = _drop.pos
		var sz: Vector2 = C.FIN_DROP_SIZE
		draw_rect(Rect2((dp - sz / 2.0).round(), sz), C.FIN_DROP_COLOR)
		draw_rect(Rect2((dp - sz / 2.0).round() - Vector2.ONE, sz + Vector2(2, 2)), Color(C.FIN_DROP_COLOR, 0.25))
	# 물결 원 (납작한 타원)
	if not _ripple.is_empty():
		var u: float = float(_ripple.t) / C.FIN_RIPPLE
		draw_set_transform(Vector2(_ripple.pos), 0.0, Vector2(1.0, 0.3))
		draw_arc(Vector2.ZERO, 2.0 + C.FIN_RIPPLE_R * u, 0.0, TAU, 32, Color(C.FIN_DROP_COLOR, 1.0 - u), 1.0)
		if u > 0.3:
			draw_arc(Vector2.ZERO, 1.0 + C.FIN_RIPPLE_R * (u - 0.3), 0.0, TAU, 24, Color(C.FIN_DROP_COLOR, (1.0 - u) * 0.6), 1.0)
		draw_set_transform_matrix(Transform2D.IDENTITY)
	# 공백 둘레 2겹 원 (OPPORTUNITY): 줄어들다 최소 크기에서 유지
	if _ring_t >= 0.0:
		var rem := C.FIN_RING_TIME - _ring_t
		var held := rem <= 0.0
		var info := { "remaining": -0.001 if held else rem, "aim_time": C.FIN_RING_TIME, "locked": held,
			"k": clampf(_ring_t / C.FIN_RING_TIME, 0.0, 1.0), "parryable": true, "attack_type": Config.ATK_OPPORTUNITY }
		Effects.draw_approach(self, p.center(), info)
		if _auto_flash >= 0.0:
			var a := 1.0 - clampf(_auto_flash / C.FIN_AUTO_FLASH, 0.0, 1.0)
			draw_circle(p.center().round(), Config.approach.APPROACH_TARGET_RADIUS + 4.0, Color(1, 1, 1, 0.85 * a))
	# 총알 (날아오는 동안 꼬리 · 앞에 떠 있으면 떨림) · 갈라진 두 조각
	if not _bullet.is_empty():
		var bp: Vector2 = (Vector2(_bullet.pos) + Vector2(_bullet.get("jit", Vector2.ZERO))).round()
		var sp: float = float(_bullet.get("speed", 0.0))
		if sp > 8.0 and step == 6:
			var tail := minf(40.0, sp * 0.06)
			draw_line(bp - Vector2(_bullet.dir) * tail, bp, Color(Config.colors.attack, 0.45), 1.0)
		var pulse := 0.3 + 0.15 * sin(now() * 18.0) if arrive_real >= 0.0 else 0.3
		draw_rect(Rect2(bp - Vector2(2, 2), Vector2(4, 4)), Color(Config.colors.attack, pulse))
		draw_rect(Rect2(bp - Vector2(1, 1), Vector2(2, 2)), Config.colors.attack)
	for h in _halves:
		var a := clampf(1.0 - float(h.t) / 0.6, 0.0, 1.0)
		draw_rect(Rect2(Vector2(h.pos).round() - Vector2(1, 0), Vector2(2, 1)), Color(Config.colors.attack, a))
	# 일섬: 화면 전체를 가로지르는 흰 선 3px → 0px
	if not _line.is_empty():
		var w: float = C.FIN_LINE_W * (1.0 - float(_line.t) / C.FIN_LINE_TIME)
		if w > 0.05:
			var v: Rect2 = main.view_rect()
			var y: float = _line.y
			draw_line(Vector2(v.position.x - 8, y), Vector2(v.end.x + 8, y), Color(1, 1, 1, 0.35), w + 2.0)
			draw_line(Vector2(v.position.x - 8, y), Vector2(v.end.x + 8, y), Color.WHITE, w)
	# 검기: 하늘 · 분홍 · 흰 3겹 초승달 띠 (베어 넘긴 길을 따라)
	if not _qi.is_empty():
		var k: float = clampf(float(_qi.t) / C.FIN_QI_TIME, 0.0, 1.0)
		var CC: Dictionary = Config.colors
		var layers := [[CC.trail_outer, 1.0, 0.45], [CC.trail_mid, 0.6, 0.75], [Color.WHITE, 0.28, 1.0]]
		for L in layers:
			_draw_qi(float(_qi.a), float(_qi.b), float(_qi.y), C.FIN_QI_THICK * float(L[1]) * (1.0 - k * 0.6),
				Color(L[0], float(L[2]) * (1.0 - k)), k)
	# 철견 몸을 가르는 X 자
	if not _xcut.is_empty():
		var k: float = clampf(float(_xcut.t) / C.FIN_QI_TIME, 0.0, 1.0)
		var c: Vector2 = _xcut.c
		for dv in [Vector2(14, -20), Vector2(-14, -20)]:
			var a0: Vector2 = c - dv * (1.0 + k * 0.3)
			var a1: Vector2 = c + dv * (1.0 + k * 0.3)
			draw_line(a0, a1, Color(Config.colors.trail_outer, 0.4 * (1.0 - k)), 5.0)
			draw_line(a0, a1, Color(1, 1, 1, 1.0 - k), 2.0 * (1.0 - k) + 0.5)
	# 시간 정지 순간 퍼지는 고리
	if _stop_ring >= 0.0:
		var u: float = _stop_ring / C.FIN_STOP_RING_TIME
		var e := 1.0 - pow(1.0 - u, 3.0)
		var rc: Vector2 = _xcut.get("c", b.center())
		draw_arc(rc, 8.0 + C.FIN_STOP_RING_R * e, 0.0, TAU, 64, Color(0.8, 0.9, 1.0, 0.6 * (1.0 - u)), 2.0)
		draw_arc(rc, 4.0 + C.FIN_STOP_RING_R * 0.6 * e, 0.0, TAU, 48, Color(1, 1, 1, 0.35 * (1.0 - u)), 1.0)
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
	if thick <= 0.2 or col.a <= 0.01:
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
