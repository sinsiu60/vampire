extends CharacterBody2D
class_name Player
## 플레이어: 이동 · 가변 점프(코요테 타임 + 점프 버퍼) · 마우스 방향 베기 + 돌진 · 흰 실루엣 그리기
## 노드 원점 = 발 중앙. 충돌 박스는 Config.player 의 w×h 로 _ready 에서 맞춤.

signal slashed(angle: float)     ## 베기 시작 (효과음·패링 판정이 듣는다)
signal whiffed                   ## 헛스윙 (패링·처치 없이 끝난 베기)

var facing := 1                  # 1 = 오른쪽, -1 = 왼쪽
var dead := false

# ---- 베기
var slash_t := -1.0              ## 베기 시작 후 경과 시간 (-1 = 베는 중 아님)
var slash_angle := 0.0           ## 베는 방향 (라디안, 화면 좌표: +y 아래)
var slash_used := false          ## 이번 베기가 패링/처치에 쓰였는가 (아니면 헛스윙) — 적 단계에서 세팅
var _slash_flip := 1             # 베는 방향(위→아래 / 아래→위)을 번갈아
var _slash_cd := 0.0             # 다음 베기까지 남은 시간
var _whiff_checked := false
var _dash_t := 0.0               # 돌진 남은 시간
var _air_up_used := false        # 공중 위쪽 돌진을 이미 썼나
var _trail := {}                 # 반달 베기 궤적 { ticks, angle, flip } (비어 있으면 없음)

# ---- 이동
var _coyote := 0.0
var _jump_buf := 0.0
var _jumping := false

# ---- 애니메이션 (프로토타입과 같은 프레임 단위 보간)
var _lean := 0.0
var _sx := 1.0
var _sy := 1.0
var _run_phase := 0.0


func _ready() -> void:
	var c: Dictionary = Config.player
	var shape := RectangleShape2D.new()
	shape.size = Vector2(c.w, c.h)
	$Collision.shape = shape
	$Collision.position = Vector2(0, -c.h / 2.0)
	floor_snap_length = 2.0


## 몸 중심 (베기·조준 기준점, 전역 좌표)
func center() -> Vector2:
	return global_position + _center_local()


func _center_local() -> Vector2:
	return Vector2(0, -Config.player.h / 2.0)


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
	var was_on_floor := is_on_floor()

	# ---- 베기 타이머 · 헛스윙
	_slash_cd = maxf(0.0, _slash_cd - delta)
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
	if Input.is_action_just_pressed("slash") and _slash_cd <= 0.0:
		_start_slash(get_global_mouse_position())

	# ---- 점프 입력 타이머 (돌진 중에도 계속 셈)
	if Input.is_action_just_pressed("jump"):
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
			velocity *= S.dash_keep
		var vy_dash := velocity.y
		move_and_slide()
		_animate(delta, was_on_floor, vy_dash, false)
		queue_redraw()
		return

	# ---- 수평 이동: 목표 속도로 가속/감속, 방향 전환은 더 빠릿하게
	var ax := int(Input.is_action_pressed("move_right")) - int(Input.is_action_pressed("move_left"))
	if ax != 0 and not is_slashing():
		facing = ax
	var accel: float
	if was_on_floor:
		accel = c.ground_accel if ax != 0 else c.ground_decel
	else:
		accel = c.air_accel if ax != 0 else c.air_decel
	if ax != 0 and signf(velocity.x) == -ax:
		accel *= c.turn_accel_mul
	velocity.x = move_toward(velocity.x, ax * c.run_speed, accel * delta)

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


## 마우스 방향으로 베기 시작 + 같은 방향으로 짧게 돌진
func _start_slash(aim: Vector2) -> void:
	var S: Dictionary = Config.slash
	var a := (aim - center()).angle()
	slash_angle = a
	slash_t = 0.0
	slash_used = false
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
	if is_on_floor() and d.y > 0.0:
		d.y = 0.0
	velocity = d * S.dash_speed
	_dash_t = S.dash_time
	_jumping = false
	# 돌진 방향으로 늘어남
	_sx = 1.0 + Config.anim.dash_stretch
	_sy = 1.0 - Config.anim.dash_stretch * 0.5
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


func _draw() -> void:
	if dead:
		return
	_draw_body()
	_draw_trail()


# 흰 실루엣. 발을 기준으로 기울이고(lean) 늘이고 줄임(sx, sy). 방향은 x 배율 부호로
func _draw_body() -> void:
	draw_set_transform(Vector2.ZERO, _lean, Vector2(facing * _sx, _sy))
	var col: Color = Config.colors.player
	if not is_on_floor():
		var tuck := 1 if velocity.y < 0.0 else 0
		draw_rect(Rect2(-3, -6, 2, 5 - tuck), col)
		draw_rect(Rect2(1, -6, 2, 4), col)
		draw_rect(Rect2(2, -3, 2, 1), col)
	else:
		var lift1 := maxf(0.0, roundf(-cos(_run_phase) * 1.5))
		var lift2 := maxf(0.0, roundf(cos(_run_phase) * 1.5))
		draw_rect(Rect2(-3 + roundf(sin(_run_phase) * 2.5), -6, 2, 6 - lift1), col)
		draw_rect(Rect2(roundf(sin(_run_phase + PI) * 2.5), -6, 2, 6 - lift2), col)
	draw_rect(Rect2(-3, -13, 6, 7), col)      # 몸통
	draw_rect(Rect2(-2, -17, 5, 4), col)      # 머리
	draw_rect(Rect2(-4, -17, 2, 2), col)      # 뒷머리
	# 칼집 (베지 않을 때 등 뒤에 비스듬히)
	if not is_slashing() and _trail.is_empty():
		for p in [Vector2(-4, -11), Vector2(-5, -10), Vector2(-6, -9), Vector2(-3, -12)]:
			draw_rect(Rect2(p, Vector2.ONE), col)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


# 반달 베기 궤적: SLASH_TRAIL_HOLD 프레임 동안 꽉 찬 채로 보인 뒤 빠르게 가늘어지며 사라짐
func _draw_trail() -> void:
	if _trail.is_empty():
		return
	var J: Dictionary = Config.juice
	var fade_ticks: float = J.SLASH_TRAIL_FADE * Config.fps
	var k: float = 0.0 if _trail.ticks <= J.SLASH_TRAIL_HOLD else (_trail.ticks - J.SLASH_TRAIL_HOLD) / fade_ticks
	if k >= 1.0:
		return
	var r: float = J.SLASH_TRAIL_RADIUS + k * 4.0              # 사라지며 살짝 퍼짐
	var thick: float = r * J.SLASH_TRAIL_THICK * (1.0 - k)
	var half: float = deg_to_rad(J.SLASH_TRAIL_ARC)
	var col: Color = Config.colors.player
	col.a = 1.0 - k * k
	DrawUtil.crescent(self, _center_local(), r, _trail.angle - half * _trail.flip, half * 2.0 * _trail.flip,
		0.0, 1.0, thick, col, 6.0)
