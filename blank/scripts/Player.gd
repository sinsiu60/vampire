extends CharacterBody2D
class_name Player
const CG := preload("res://scripts/boss/CheolgyeonConfig.gd")   # 반격 베기 자동 돌진 수치
## 플레이어: 이동 · 가변 점프(코요테 타임 + 점프 버퍼) · 마우스 방향 베기 + 돌진 · 구르기 (Shift) · 흰 실루엣 그리기
## 노드 원점 = 발 중앙. 충돌 박스는 Config.player 의 w×h 로 _ready 에서 맞춤.

signal slashed(angle: float)     ## 베기 시작 (효과음·패링 판정이 듣는다)
signal died                      ## 원히트 사망
signal whiffed                   ## 헛스윙 (패링·처치 없이 끝난 베기)

var facing := 1                  # 1 = 오른쪽, -1 = 왼쪽
var dead := false
var input_locked := false        ## 패링 시퀀스 중 입력 잠금 (Main 이 켜고 끔). 그동안 근접 공격에 맞지도 않음

# ---- 베기
var slash_t := -1.0              ## 베기 시작 후 경과 시간 (-1 = 베는 중 아님)
var slash_angle := 0.0           ## 베는 방향 (라디안, 화면 좌표: +y 아래)
var slash_used := false          ## 이번 베기가 패링/처치에 쓰였는가 (아니면 헛스윙)
var last_slash_t := -INF         ## 마지막 베기 시작 시각 (월드 시간) — 사격 타이밍 패링 판정
var _slash_flip := 1             # 베는 방향(위→아래 / 아래→위)을 번갈아
var _slash_cd := 0.0             # 다음 베기까지 남은 시간
var _whiff_checked := false
var _dash_t := 0.0               # 돌진 남은 시간
var _air_up_used := false        # 공중 위쪽 돌진을 이미 썼나
var _trail := {}                 # 반달 베기 궤적 { ticks, angle, flip } (비어 있으면 없음)
var _queued_slash := false       # 히트스톱 중 누른 클릭 (월드가 다시 흐를 때 처리)
var _lunge := false              # 지금 돌진이 반격 베기 자동 돌진인가 (끝나면 멈춤)
var _smear := {}                 # 스미어 프레임 (돌진 첫 몇 틱 · 명중 순간 몸 왜곡) { ticks, max, dir, P, from, spikes } — SmearFX
var _dash_from := Vector2.ZERO   # 이번 베기 돌진을 시작한 몸 중심 (전역) — 명중 스미어 궤적의 꼬리
var _dash_dir := Vector2.RIGHT   # 이번 베기 돌진 방향
var impact_smears := 0           ## 명중 스미어 수 (테스트)
var _stun := 0.0                 # 경직 남은 시간 (철견이 막으면 0.2초) — 그동안 조작 불가
var counter_lunges := 0          ## 반격 베기 자동 돌진 횟수 (테스트 · 디버그)

# ---- 구르기 (Config.roll): 이동 방향(없으면 바라보는 방향)으로 64px · 0.3초, 처음 0.25초 무적, 바닥에서만
var roll_enabled := true         ## 피날레 결투처럼 받아치기만 하는 곳에서 끔
var finale_pose := ""            ## 피날레 연출 자세: "" | "cut_end" (휘두른 끝, 칼을 뻗은 채) | "sheathe" (칼을 칼집에 — finale_k 0 → 1)
var finale_k := 0.0
var auto_walk := {}              ## 입력이 잠긴 동안 연출이 시키는 걸음 { x (목표), speed, face } — 피날레 대치에서 물러섬
var rolls := 0                   ## 구른 횟수 (테스트 · 디버그)
var _roll_t := -1.0              # 구르기 경과 (-1 = 구르는 중 아님)
var _roll_dir := 1
var _roll_cd := 0.0              # 다음 구르기까지 (구르기가 끝난 뒤부터 셈)
var _roll_ghost := 0.0
var _roll_dust := 0.0
var _roll_buf := 0.0             # 구르기 입력 버퍼 (베기 돌진 · 히트스톱 중에 눌러도 ROLL_BUFFER 초 동안 기억)

# ---- 이동
var _coyote := 0.0
var _jump_buf := 0.0
var _jumping := false

# ---- 애니메이션 (프로토타입과 같은 프레임 단위 보간)
var _lean := 0.0
var _sx := 1.0
var _sy := 1.0
var _run_phase := 0.0
var _tick := 0
var _ghosts: Array = []          # 잔상 { pos(전역 발 위치), parts, t, strong }
var _scarf: Array = []           # 머플러 마디 { p, pp } (전역, verlet)


func _ready() -> void:
	var c: Dictionary = Config.player
	var shape := RectangleShape2D.new()
	shape.size = Vector2(c.w, c.h)
	$Collision.shape = shape
	$Collision.position = Vector2(0, -c.h / 2.0)
	floor_snap_length = 2.0
	collision_layer = Config.layers.player
	collision_mask = Config.layers.terrain | Config.layers.platform   # 지형만 (적과는 몸으로 부딪히지 않음)
	add_to_group("player")


## 몸 중심 (베기·조준 기준점, 전역 좌표)
func center() -> Vector2:
	return global_position + _center_local()


## 이번 베기가 패링/처치에 쓰임 → 쿨타임 없이 바로 다음 베기 가능 (헛스윙했을 때만 WHIFF_COOLDOWN)
## 리듬 패링: 연사의 다음 탄을 곧바로 받아칠 수 있게
func mark_used() -> void:
	slash_used = true
	_slash_cd = 0.0


## F4 프레임 진행 중 멈춘 사이 누른 입력 (Debug 가 넘겨줌)
func queue_slash() -> void:
	_queued_slash = true


func queue_jump() -> void:
	_jump_buf = Config.player.jump_buffer


## 칼 끝 (베는 방향 radius × 0.8) — 근접 패링 불꽃·링 위치
func tip() -> Vector2:
	return center() + Vector2.from_angle(slash_angle) * float(Config.slash.radius) * 0.8


func _center_local() -> Vector2:
	return Vector2(0, -Config.player.h / 2.0)


## 몸통 사각형 (전역 좌표) — 피격 판정
func body_rect() -> Rect2:
	var c: Dictionary = Config.player
	return Rect2(global_position - Vector2(c.w / 2.0, c.h), Vector2(c.w, c.h))


## 원히트 사망 (조각·파편 연출은 6단계)
func die(_angle: float) -> void:
	if dead:
		return
	dead = true
	velocity = Vector2.ZERO
	$Collision.set_deferred("disabled", true)
	queue_redraw()
	died.emit()


func is_slashing() -> bool:
	return slash_t >= 0.0


## 근접 패링 판정 창 안인가
func in_parry_window() -> bool:
	return slash_t >= 0.0 and slash_t < Config.slash.parry_window


## 점(반지름 r)이 지금 칼 부채꼴 안에 있는가 (전역 좌표). range_mul = 판정 거리 배율
func slash_hits(p: Vector2, r := 0.0, range_mul := 1.0) -> bool:
	if not is_slashing():
		return false
	var S: Dictionary = Config.slash
	var d := p - center()
	var dist := d.length()
	if dist > S.radius * range_mul + r:
		return false
	if dist < 6.0 + r:
		return true
	return absf(angle_difference(slash_angle, d.angle())) <= S.arc_half + asin(minf(1.0, r / dist))


## 사각형(적 몸통 등, 전역 좌표)이 칼에 닿았는가: 가장 가까운 점 + 중심점으로 판정
func slash_hits_rect(rect: Rect2, range_mul := 1.0) -> bool:
	var c := center()
	var q := Vector2(clampf(c.x, rect.position.x, rect.end.x), clampf(c.y, rect.position.y, rect.end.y))
	return slash_hits(q, 0.0, range_mul) or slash_hits(rect.get_center(), 3.0, range_mul)


func _physics_process(delta: float) -> void:
	if dead:
		return
	var c: Dictionary = Config.player
	var S: Dictionary = Config.slash
	# 히트스톱 중: 아무것도 하지 않고 입력만 모아 둠 (프로토타입처럼 멈춘 동안 누른 클릭도 살림)
	var ctl := not input_locked and _stun <= 0.0
	if TimeManager.frozen:
		if ctl and Input.is_action_just_pressed("roll"):
			_roll_buf = Config.roll.ROLL_BUFFER
		if ctl and Input.is_action_just_pressed("slash") and not is_rolling():
			_queued_slash = true
		if ctl and Input.is_action_just_pressed("jump"):
			_jump_buf = c.jump_buffer
		return
	# 스미어: 멈추지 않은 틱에만 줄어듦 (히트스톱 동안엔 늘어난 모습 그대로 멈춤)
	if not _smear.is_empty():
		_smear.ticks -= 1
		if _smear.ticks <= 0:
			_end_smear()
	var was_on_floor := is_on_floor()

	# ---- 베기 타이머 · 헛스윙 · 경직
	_slash_cd = maxf(0.0, _slash_cd - delta)
	_stun = maxf(0.0, _stun - delta)
	_roll_cd = maxf(0.0, _roll_cd - delta)
	# ---- 구르기 중: 이동 · 점프 · 베기(패링) 입력은 무시
	if is_rolling():
		_roll_tick(delta, was_on_floor)
		return
	if Input.is_action_just_pressed("roll") and ctl:
		_roll_buf = Config.roll.ROLL_BUFFER
	var want_roll := _roll_buf > 0.0 and ctl
	_roll_buf = maxf(0.0, _roll_buf - delta)
	# 바닥 위 또는 바닥에서 ROLL_GROUND_SNAP px 안 (베기 돌진으로 살짝 뜬 순간 — 헛스윙 직후 구르기). 점프 중엔 불가
	var grounded := was_on_floor or (velocity.y >= -60.0 and test_move(global_transform, Vector2(0, Config.roll.ROLL_GROUND_SNAP)))
	if want_roll and roll_enabled and grounded and _roll_cd <= 0.0 and _dash_t <= 0.0:
		_roll_buf = 0.0
		var rx := int(Input.is_action_pressed("move_right")) - int(Input.is_action_pressed("move_left"))
		_start_roll(rx)
		_roll_tick(delta, was_on_floor)
		return
	if is_slashing():
		slash_t += delta
		# 패링 창(PARRY_EARLY)과 직접 베기 판정(hit_time)이 끝날 때까지 아무것도 못 쳤으면 잠시 베기 불가
		if not _whiff_checked and slash_t >= maxf(Config.shot.PARRY_EARLY, S.hit_time):
			_whiff_checked = true
			if not slash_used:
				_slash_cd = maxf(_slash_cd, Config.shot.WHIFF_COOLDOWN)
				whiffed.emit()
		if slash_t >= S.duration:
			slash_t = -1.0
	if ctl and (Input.is_action_just_pressed("slash") or _queued_slash) and _slash_cd <= 0.0:
		_start_slash(get_global_mouse_position())
	_queued_slash = false

	# ---- 점프 입력 타이머 (돌진 중에도 계속 셈)
	if ctl and Input.is_action_just_pressed("jump"):
		_jump_buf = c.jump_buffer
	else:
		_jump_buf = maxf(0.0, _jump_buf - delta)
	if was_on_floor:
		_coyote = c.coyote_time
		_air_up_used = false
	else:
		_coyote = maxf(0.0, _coyote - delta)

	# ---- 돌진 중: 입력·중력 무시하고 베는 방향으로 쭉
	if _dash_t > 0.0:
		_dash_t -= delta
		if _dash_t <= 0.0:
			velocity *= 0.0 if _lunge else S.dash_keep
			_lunge = false
		var vy_dash := velocity.y
		move_and_slide()
		_animate(delta, was_on_floor, vy_dash, false)
		queue_redraw()
		return

	# ---- 수평 이동: 목표 속도로 가속/감속, 방향 전환은 더 빠릿하게
	var ax := int(Input.is_action_pressed("move_right")) - int(Input.is_action_pressed("move_left")) if ctl else 0
	var top: float = c.run_speed
	if not ctl and not auto_walk.is_empty():
		var dx: float = float(auto_walk.x) - global_position.x
		ax = int(signf(dx)) if absf(dx) > 1.0 else 0
		top = minf(float(auto_walk.speed), absf(dx) * 10.0 + 8.0)       # 도착하면서 감속
		facing = int(auto_walk.face)
		if ax == 0:
			velocity.x = 0.0
	elif ax != 0 and not is_slashing():
		facing = ax
	var accel: float
	if was_on_floor:
		accel = c.ground_accel if ax != 0 else c.ground_decel
	else:
		accel = c.air_accel if ax != 0 else c.air_decel
	if ax != 0 and signf(velocity.x) == -ax:
		accel *= c.turn_accel_mul
	velocity.x = move_toward(velocity.x, ax * top, accel * delta)

	# ---- 점프: 버퍼 + 코요테 타임
	var jumped := false
	if _jump_buf > 0.0 and _coyote > 0.0:
		velocity.y = -c.jump_speed
		_jump_buf = 0.0
		_coyote = 0.0
		_jumping = true
		jumped = true
	# 가변 점프: 상승 중 Space 를 떼면 상승 속도를 깎음
	if _jumping and velocity.y < 0.0 and not Input.is_action_pressed("jump"):
		velocity.y *= c.jump_cut_mul
		_jumping = false
	if velocity.y >= 0.0:
		_jumping = false

	# ---- 중력 (하강 중엔 더 무겁게)
	var g: float = c.gravity * (c.fall_gravity_mul if velocity.y > 0.0 else 1.0)
	velocity.y = minf(velocity.y + g * delta, c.max_fall)

	var vy_before := velocity.y
	move_and_slide()
	_animate(delta, was_on_floor, vy_before, jumped)
	queue_redraw()


## 반격 베기 자동 돌진 { angle, speed } — 휘청 중인 철견이 없거나 멀면 빈 Dictionary
func _counter_lunge() -> Dictionary:
	var b = null
	for n in get_tree().get_nodes_in_group("counter_targets"):   # 철견 · 연습 더미
		if not n.dead and n.can_counter():
			b = n
			break
	if b == null:
		return {}
	var to: Vector2 = b.center() - center()
	if to.length() > Config.diff.COUNTER_LUNGE_RANGE:
		return {}
	var dist := maxf(0.0, to.length() - CG.COUNTER_STOP)
	# 돌진은 _dash_t 가 남아 있는 틱에만 움직임 (0.08초 = 4틱) — 그 틱 수로 나눠야 정확히 COUNTER_STOP 앞에 멈춤
	var move_ticks := maxi(1, ceili(CG.COUNTER_LUNGE_TIME * Config.fps - 1e-6) - 1)
	return { "angle": to.angle(), "speed": dist / (float(move_ticks) / Config.fps) }


func is_rolling() -> bool:
	return _roll_t >= 0.0


## 구르기 무적 중인가 (히트스캔 탄 · 근접 공격 · 충격파 · 보라색 공격 모두 통과)
func is_invincible() -> bool:
	return _roll_t >= 0.0 and _roll_t < Config.roll.ROLL_IFRAME


func _start_roll(dir: int) -> void:
	_roll_t = 0.0
	_roll_dir = dir if dir != 0 else facing
	facing = _roll_dir
	# 베던 중이면 끊음 (구르기 중엔 패링 판정 없음)
	slash_t = -1.0
	_trail = {}
	_queued_slash = false
	_jump_buf = 0.0
	_jumping = false
	_roll_ghost = 0.0
	_roll_dust = 0.0
	rolls += 1
	Audio.roll()
	_roll_dust_puff(5)


## 구르는 한 틱: 일정한 속도로 굴러감 (중력은 그대로), 0.04초마다 잔상, 바닥 먼지
func _roll_tick(delta: float, was_on_floor: bool) -> void:
	var R: Dictionary = Config.roll
	var c: Dictionary = Config.player
	_roll_t += delta
	velocity.x = _roll_dir * R.ROLL_DISTANCE / R.ROLL_TIME
	velocity.y = minf(velocity.y + c.gravity * delta, c.max_fall)
	_roll_ghost -= delta
	if _roll_ghost <= 0.0:
		_roll_ghost = R.GHOST_EVERY
		_ghosts.append({ "pos": global_position, "parts": body_parts(), "t": 0.0, "strong": true })
	_roll_dust -= delta
	if _roll_dust <= 0.0 and is_on_floor():
		_roll_dust = R.DUST_EVERY
		_roll_dust_puff(2)
	var vy := velocity.y
	move_and_slide()
	_animate(delta, was_on_floor, vy, false)
	if _roll_t >= R.ROLL_TIME:
		# 끝나는 즉시 베기 가능
		_roll_t = -1.0
		_roll_cd = R.ROLL_COOLDOWN
		_slash_cd = 0.0
		velocity.x *= 0.35
	queue_redraw()


func _roll_dust_puff(n: int) -> void:
	var main := get_tree().get_first_node_in_group("game")
	if main == null:
		return
	var dust: Array = Config.colors.dust
	for i in n:
		var v := randf_range(30.0, 80.0)
		main.effects.spawn(global_position + Vector2(-_roll_dir * 3.0 + randf_range(-2, 2), -1.0),
			Vector2(-_roll_dir * v, -randf_range(10.0, 40.0)), randf_range(0.2, 0.35), dust[i % dust.size()], { "size": 2.0, "grav": 90.0 })


## 경직: sec 초 동안 조작 불가 + push 속도로 밀려남 (철견이 칼을 막았을 때)
func stun(sec: float, push: Vector2) -> void:
	_stun = maxf(_stun, sec)
	_dash_t = 0.0
	_lunge = false
	velocity = push


func is_stunned() -> bool:
	return _stun > 0.0


## 마우스 방향으로 베기 시작 + 같은 방향으로 짧게 돌진
func _start_slash(aim: Vector2) -> void:
	var S: Dictionary = Config.slash
	var a := (aim - center()).angle()
	# 반격 베기: 휘청 중인 철견이 COUNTER_LUNGE_RANGE 안이면 철견에게 자동 돌진하며 벰
	var lunge := _counter_lunge()
	if not lunge.is_empty():
		a = lunge.angle
	slash_angle = a
	slash_t = 0.0
	slash_used = false
	last_slash_t = TimeManager.world_time
	_whiff_checked = false
	_slash_cd = S.cooldown
	_slash_flip = -_slash_flip
	_trail = { "ticks": 0, "angle": a, "flip": _slash_flip }
	var d := Vector2(cos(a), sin(a))
	if absf(d.x) > 0.15:
		facing = int(signf(d.x))
	# 공중 위쪽 돌진은 착지 전까지 1회 — 무한 체공 방지
	if not is_on_floor() and d.y < 0.0:
		if S.air_up_once and _air_up_used:
			d.y = 0.0
		_air_up_used = true
	if is_on_floor() and d.y > 0.0 and lunge.is_empty():
		d.y = 0.0
	velocity = d * S.dash_speed
	_dash_t = S.dash_time
	_lunge = not lunge.is_empty()
	if _lunge:
		velocity = Vector2.from_angle(a) * float(lunge.speed)
		_dash_t = CG.COUNTER_LUNGE_TIME
		counter_lunges += 1
	_dash_from = center()
	_dash_dir = velocity.normalized() if velocity.length() > 1.0 else Vector2.from_angle(a)
	_begin_smear(_dash_dir)
	_jumping = false
	# 돌진 방향으로 늘어남
	_sx = 1.0 + Config.anim.dash_stretch
	_sy = 1.0 - Config.anim.dash_stretch * 0.5
	Audio.swing()
	slashed.emit(a)


func _animate(delta: float, was_on_floor: bool, vy_before: float, jumped: bool) -> void:
	var a: Dictionary = Config.anim
	var c: Dictionary = Config.player
	var J: Dictionary = Config.juice
	# 반달 궤적 수명: HOLD 프레임 꽉 찬 채 + FADE 초 동안 사라짐
	if not _trail.is_empty():
		_trail.ticks += 1
		if _trail.ticks > J.SLASH_TRAIL_HOLD + J.SLASH_TRAIL_FADE * Config.fps:
			_trail = {}
	# 기울이기: 속도 방향으로 (돌진 중엔 똑바로)
	var target_lean: float = 0.0 if _dash_t > 0.0 else clampf(velocity.x / c.run_speed, -1.0, 1.0) * a.lean_max
	_lean = lerpf(_lean, target_lean, 0.25)
	# 늘이고 줄이기: 점프 순간 세로로, 착지 순간 납작하게 (낙하 속도에 비례)
	if jumped:
		_sy = 1.0 + a.jump_stretch
		_sx = 1.0 - a.jump_stretch * 0.6
	if is_on_floor() and not was_on_floor and vy_before > 60.0:
		var k: float = clampf(vy_before / c.max_fall, 0.3, 1.0) * a.land_squash
		_sy = 1.0 - k
		_sx = 1.0 + k
	_sx = lerpf(_sx, 1.0, a.spring_back)
	_sy = lerpf(_sy, 1.0, a.spring_back)
	if is_on_floor():
		_run_phase += absf(velocity.x) * delta * 0.28
	_tick += 1
	# 잔상: 돌진(또는 아주 빠를 때)은 매 틱 진하게, 전력 질주는 몇 틱마다 옅게
	var sp := velocity.length()
	var dashing: bool = (_dash_t > 0.0 or sp > c.run_speed * 1.4) and not is_rolling()
	if dashing or (is_on_floor() and absf(velocity.x) > c.run_speed * 0.9 and _tick % int(a.ghost_every_run) == 0):
		_ghosts.append({ "pos": global_position, "parts": body_parts(), "t": 0.0, "strong": dashing })
	for gh in _ghosts:
		gh.t += delta
	_ghosts = _ghosts.filter(func(gh): return gh.t < a.ghost_time)
	_update_scarf(delta, sp)


## 머플러 목 위치 (전역)
func neck() -> Vector2:
	return global_position + Vector2(-facing + sin(_lean) * 12.0, -12.0 * _sy)


## 머플러 (verlet 로프): 목에 고정, 나머지는 관성 + 중력 + 펄럭임, 3번 길이 맞춤
func _update_scarf(dt: float, sp: float) -> void:
	var a: Dictionary = Config.anim
	var nk := neck()
	if _scarf.is_empty() or _scarf[0].p.distance_to(nk) > 40.0:
		# 처음이거나 순간이동했으면 목 아래로 늘어뜨린 채 다시 만듦
		_scarf = []
		for i in int(a.scarf_nodes):
			var q := Vector2(nk.x, global_position.y - Config.player.h + 4.0 + i)
			_scarf.append({ "p": q, "pp": q })
	_scarf[0].p = nk
	var moving := clampf(sp / Config.player.run_speed, 0.2, 1.0)    # 서 있어도 살짝 펄럭임
	var k := dt * dt * 60.0
	var n := _scarf.size()
	for i in range(1, n):
		var nd: Dictionary = _scarf[i]
		var v: Vector2 = (nd.p - nd.pp) * a.scarf_drag
		nd.pp = nd.p
		nd.p += v + Vector2(-facing * a.scarf_trail * k,
			a.scarf_gravity * k + sin(_tick * 0.35 + i * 0.9) * a.scarf_wave * moving * k * (float(i) / n))
	for it in 3:
		for i in range(1, n):
			var na: Dictionary = _scarf[i - 1]
			var nb: Dictionary = _scarf[i]
			var d: Vector2 = nb.p - na.p
			var dl := maxf(d.length(), 1e-6)
			var diff: float = (dl - a.scarf_seg) / dl
			if i == 1:
				nb.p -= d * diff
			else:
				na.p += d * diff * 0.5
				nb.p -= d * diff * 0.5


func _draw() -> void:
	if dead:
		return
	var col: Color = Config.colors.player
	# 잔상 (흰 실루엣이 옅게 남음)
	for gh in _ghosts:
		var k: float = 1.0 - gh.t / Config.anim.ghost_time
		var c := Color(col, k * (0.45 if gh.strong else 0.22))
		var off: Vector2 = gh.pos - global_position
		for part in gh.parts:
			draw_set_transform_matrix(Transform2D(0.0, off) * part.xf)
			for sh in part.shapes:
				draw_rect(sh[1], c)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	_draw_scarf()
	if _smear.is_empty():
		_draw_body()
	else:
		_draw_smear()
	_draw_trail()


## 돌진 첫 몇 틱: 몸을 진행 방향으로 늘이고 색을 갈라 그림 (일반 베기 = SLASH, 반격 돌진 = COUNTER + 뜨거운 궤적)
func _begin_smear(dir: Vector2, counter := _lunge, from := center()) -> void:
	if not Settings.on("smear"):
		_end_smear()
		return
	z_index = 0
	var P: Dictionary = Config.smear.COUNTER if counter else Config.smear.SLASH
	_smear = { "ticks": int(P.TICKS), "max": int(P.TICKS), "dir": dir, "P": P, "from": from,
		"spikes": SmearFX.make_spikes(dir, int(P.SPIKES), P.SPIKE_LEN, float(P.SPREAD)) }


## 베기가 적에 닿은 순간 (Main): 돌진 시작 스미어가 이미 끝났어도 여기서 다시 — 바로 이어지는 히트스톱 · 킬 스톱 동안
## 늘어난 모습이 그대로 멈춰 임팩트 프레임이 됨. counter = 반격 명중 (반격 프리셋 + 돌진 시작점부터 궤적)
func impact_smear(counter := false) -> void:
	if dead or not Settings.on("smear"):
		return
	_begin_smear(_dash_dir, counter or _lunge, _dash_from)
	z_index = IMPACT_Z                # 빛줄기 · 3겹 궤적 (Effects z 10) 에 가리지 않게 — 스미어가 끝나면 원래대로
	impact_smears += 1
	queue_redraw()


const IMPACT_Z := 20             ## 명중 스미어 동안 플레이어 z (Effects 10 위, 발사 타이밍 원 30 아래)


func _end_smear() -> void:
	_smear = {}
	z_index = 0


func is_smearing() -> bool:
	return not _smear.is_empty()


func _draw_smear() -> void:
	var P: Dictionary = _smear.P
	var dir: Vector2 = _smear.dir
	var c := _center_local()
	var k: float = 1.0 - float(_smear.ticks) / float(_smear.max)     # 0 = 첫 틱 (가장 셈)
	if bool(P.TRAIL):
		SmearFX.draw_trail(self, to_local(_smear.from), c, float(P.TRAIL_W), k)
	SmearFX.draw_spikes(self, c, _smear.spikes, k)
	var st: float = lerpf(float(P.STRETCH), 1.0 + (float(P.STRETCH) - 1.0) * 0.5, k)
	var sq: float = lerpf(float(P.SQUASH), 1.0 - (1.0 - float(P.SQUASH)) * 0.5, k)
	SmearFX.draw_body(self, body_parts(), Transform2D.IDENTITY, SmearFX.stretch_xf(c, dir, st, sq, float(P.BACK)), dir, float(P.CHROMA))


func _draw_scarf() -> void:
	var n := _scarf.size()
	for i in range(1, n):
		var a := to_local(_scarf[i - 1].p)
		var b := to_local(_scarf[i].p)
		var w := 2.0 if i < n * 0.5 else 1.0
		draw_line(a, b, Config.colors.player, w)
		if w > 1.0:
			draw_circle(b, w * 0.5, Config.colors.player)     # 둥근 이음매


# 흰 실루엣. 발을 기준으로 기울이고(lean) 늘이고 줄임(sx, sy). 방향은 x 배율 부호로
func _draw_body() -> void:
	for part in body_parts():
		draw_set_transform_matrix(part.xf)
		for sh in part.shapes:
			draw_rect(sh[1], part.body)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## 잔상 하나 (pos = 전역 발 위치, 지금 자세) — 피날레 일섬 경로
func add_ghost(pos: Vector2, strong := true) -> void:
	_ghosts.append({ "pos": pos, "parts": body_parts(), "t": 0.0, "strong": strong })


## 피날레 자세: 낮게 내디딘 다리 · 앞으로 숙인 몸 + 칼 (1px 점들). 오른쪽을 볼 때 기준, facing 으로 뒤집음
func _finale_parts() -> Array:
	var sh := []
	sh.append(["rect", Rect2(-7, -5, 2, 5)])        # 뒷다리 (넓게)
	sh.append(["rect", Rect2(-6, -6, 2, 1)])
	sh.append(["rect", Rect2(3, -5, 2, 5)])         # 앞다리
	sh.append(["rect", Rect2(2, -6, 2, 1)])
	sh.append(["rect", Rect2(-3, -11, 6, 6)])       # 몸통 (낮게)
	sh.append(["rect", Rect2(-1, -15, 5, 4)])       # 머리 (앞으로)
	sh.append(["rect", Rect2(-3, -15, 2, 2)])       # 뒷머리
	# 칼집: 허리에서 뒤로 비스듬히
	var mouth := Vector2(-3, -7)
	var back := Vector2(-1.0, 0.45).normalized()
	for i in 6:
		var q := (mouth + back * float(i)).round()
		sh.append(["rect", Rect2(q, Vector2.ONE)])
	# 칼: cut_end = 앞 아래로 뻗음 · sheathe = 손이 칼집 입구 위로 와서 (k 0 ~ 0.4) 칼날이 미끄러져 들어감 (0.4 ~ 1)
	const BLADE := 13.0
	var hand := Vector2(6, -9)
	var dir := Vector2(1.0, 0.3).normalized()
	var vis := BLADE
	if finale_pose == "sheathe":
		var a := clampf(finale_k / 0.4, 0.0, 1.0)
		var b := clampf((finale_k - 0.4) / 0.6, 0.0, 1.0)
		var e := a * a * (3.0 - 2.0 * a)
		vis = BLADE * (1.0 - b * b)
		var d := dir.lerp(back, e).normalized()              # 칼끝이 칼집 쪽으로 돌아감
		var h := hand.lerp(mouth - back * BLADE, e) if b <= 0.0 else mouth - back * vis
		for i in int(vis):
			var q := (h + d * float(i)).round()
			sh.append(["rect", Rect2(q, Vector2.ONE)])
		sh.append(["rect", Rect2((h - d).round() + Vector2(-1, -1), Vector2(2, 2))])   # 손 · 칼자루
		return sh
	sh.append(["rect", Rect2(Vector2(3, -10), Vector2(3, 2))])   # 뻗은 팔
	for i in int(vis):
		var q := (hand + dir * float(i)).round()
		sh.append(["rect", Rect2(q, Vector2.ONE)])
	return sh


## 지금 자세의 실루엣 [{ xf, shapes, body, rim }] (노드 로컬) — 그리기와 사망 시 두 조각에 같이 씀
func body_parts() -> Array:
	var col: Color = Config.colors.player
	var sh := []
	if finale_pose != "":
		return [{ "xf": Transform2D(0.0, Vector2(facing, 1), 0.0, Vector2.ZERO), "shapes": _finale_parts(), "body": col, "rim": Color(0, 0, 0, 0) }]
	# 구르기: 몸을 둥글게 말아 회전
	if is_rolling():
		var u: float = clampf(_roll_t / Config.roll.ROLL_TIME, 0.0, 1.0)
		var rot: float = u * TAU * Config.roll.SPIN * _roll_dir
		sh.append(["rect", Rect2(-4, -4, 8, 8)])          # 웅크린 몸
		sh.append(["rect", Rect2(-3, -5, 6, 1)])
		sh.append(["rect", Rect2(-3, 4, 6, 1)])
		sh.append(["rect", Rect2(-5, -3, 1, 6)])
		sh.append(["rect", Rect2(4, -3, 1, 6)])
		sh.append(["rect", Rect2(1, -7, 4, 3)])           # 머리
		sh.append(["rect", Rect2(-5, 1, 2, 1)])           # 칼집
		return [{ "xf": Transform2D(rot, Vector2(0, -5)), "shapes": sh, "body": col, "rim": Color(0, 0, 0, 0) }]
	if not is_on_floor():
		var tuck := 1 if velocity.y < 0.0 else 0
		sh.append(["rect", Rect2(-3, -6, 2, 5 - tuck)])
		sh.append(["rect", Rect2(1, -6, 2, 4)])
		sh.append(["rect", Rect2(2, -3, 2, 1)])
	else:
		var lift1 := maxf(0.0, roundf(-cos(_run_phase) * 1.5))
		var lift2 := maxf(0.0, roundf(cos(_run_phase) * 1.5))
		sh.append(["rect", Rect2(-3 + roundf(sin(_run_phase) * 2.5), -6, 2, 6 - lift1)])
		sh.append(["rect", Rect2(roundf(sin(_run_phase + PI) * 2.5), -6, 2, 6 - lift2)])
	sh.append(["rect", Rect2(-3, -13, 6, 7)])      # 몸통
	sh.append(["rect", Rect2(-2, -17, 5, 4)])      # 머리
	sh.append(["rect", Rect2(-4, -17, 2, 2)])      # 뒷머리
	# 칼집 (베지 않을 때 등 뒤에 비스듬히)
	if not is_slashing() and _trail.is_empty():
		for p in [Vector2(-4, -11), Vector2(-5, -10), Vector2(-6, -9), Vector2(-3, -12)]:
			sh.append(["rect", Rect2(p, Vector2.ONE)])
	var xf := Transform2D(_lean, Vector2(facing * _sx, _sy), 0.0, Vector2.ZERO)
	return [{ "xf": xf, "shapes": sh, "body": col, "rim": Color(0, 0, 0, 0) }]


## 흰 반달 궤적을 넘겨받고 지움 (처치하면 그 자리에 3겹 킬 궤적) — { angle, flip } 또는 빈 Dictionary
func take_trail() -> Dictionary:
	var t := _trail
	_trail = {}
	queue_redraw()
	return t


## 처치 반동: 지금 속도만 정해 두면 킬 스톱이 끝난 뒤부터 적용됨
func recoil(angle: float) -> void:
	var J: Dictionary = Config.juice
	_dash_t = 0.0
	velocity.x = -cos(angle) * J.RECOIL_SPEED
	if not is_on_floor():
		velocity.y = -sin(angle) * J.RECOIL_SPEED * 0.5 - J.RECOIL_LIFT


# 반달 베기 궤적: SLASH_TRAIL_HOLD 프레임 동안 꽉 찬 채로 보인 뒤 빠르게 가늘어지며 사라짐
func _draw_trail() -> void:
	if _trail.is_empty():
		return
	var J: Dictionary = Config.juice
	var fade_ticks: float = J.SLASH_TRAIL_FADE * Config.fps
	var k: float = 0.0 if _trail.ticks <= J.SLASH_TRAIL_HOLD else (_trail.ticks - J.SLASH_TRAIL_HOLD) / fade_ticks
	if k >= 1.0:
		return
	# F2 에서 끄면 작고 얇은 기본 궤적
	var big := Settings.on("slash_trail")
	var r: float = (J.SLASH_TRAIL_RADIUS if big else float(Config.slash.radius)) + k * 4.0   # 사라지며 살짝 퍼짐
	var thick: float = r * (J.SLASH_TRAIL_THICK if big else 0.3) * (1.0 - k)
	var half: float = deg_to_rad(J.SLASH_TRAIL_ARC) if big else float(Config.slash.arc_half)
	var col: Color = Config.colors.player
	col.a = 1.0 - k * k
	DrawUtil.crescent(self, _center_local(), r, _trail.angle - half * _trail.flip, half * 2.0 * _trail.flip,
		0.0, 1.0, thick, col, 6.0 if big else 4.0)
