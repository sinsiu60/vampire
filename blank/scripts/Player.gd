extends CharacterBody2D
class_name Player
## 플레이어: 이동 · 가변 점프(코요테 타임 + 점프 버퍼) · 흰 실루엣 그리기
## 노드 원점 = 발 중앙. 충돌 박스는 Config.player 의 w×h 로 _ready 에서 맞춤.
## (베기·패링은 다음 단계에서 추가)

signal died

var facing := 1                 # 1 = 오른쪽, -1 = 왼쪽
var dead := false

var _coyote := 0.0              # 남은 코요테 타임
var _jump_buf := 0.0            # 남은 점프 버퍼
var _jumping := false           # 점프로 상승 중 (가변 점프 컷 대상)

# 애니메이션 (프로토타입과 같은 프레임 단위 보간)
var _lean := 0.0                # 몸 기울기 (라디안)
var _sx := 1.0                  # squash & stretch
var _sy := 1.0
var _run_phase := 0.0           # 달리기 다리 주기


func _ready() -> void:
	var c: Dictionary = Config.player
	var shape := RectangleShape2D.new()
	shape.size = Vector2(c.w, c.h)
	$Collision.shape = shape
	$Collision.position = Vector2(0, -c.h / 2.0)
	floor_snap_length = 2.0


## 몸 중심 (베기·조준 기준점)
func center() -> Vector2:
	return global_position + Vector2(0, -Config.player.h / 2.0)


func _physics_process(delta: float) -> void:
	if dead:
		return
	var c: Dictionary = Config.player
	var was_on_floor := is_on_floor()

	# 수평 이동: 목표 속도로 가속/감속, 방향 전환은 더 빠릿하게
	var ax := int(Input.is_action_pressed("move_right")) - int(Input.is_action_pressed("move_left"))
	if ax != 0:
		facing = ax
	var accel: float
	if was_on_floor:
		accel = c.ground_accel if ax != 0 else c.ground_decel
	else:
		accel = c.air_accel if ax != 0 else c.air_decel
	if ax != 0 and signf(velocity.x) == -ax:
		accel *= c.turn_accel_mul
	velocity.x = move_toward(velocity.x, ax * c.run_speed, accel * delta)

	# 점프: 버퍼(착지 직전 누른 입력 기억) + 코요테 타임(발판을 벗어난 직후에도 허용)
	if Input.is_action_just_pressed("jump"):
		_jump_buf = c.jump_buffer
	else:
		_jump_buf = maxf(0.0, _jump_buf - delta)
	if was_on_floor:
		_coyote = c.coyote_time
	else:
		_coyote = maxf(0.0, _coyote - delta)

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

	# 중력 (하강 중엔 더 무겁게)
	var g: float = c.gravity * (c.fall_gravity_mul if velocity.y > 0.0 else 1.0)
	velocity.y = minf(velocity.y + g * delta, c.max_fall)

	var vy_before := velocity.y
	move_and_slide()
	_animate(delta, was_on_floor, vy_before, jumped)
	queue_redraw()


func _animate(delta: float, was_on_floor: bool, vy_before: float, jumped: bool) -> void:
	var a: Dictionary = Config.anim
	var c: Dictionary = Config.player
	# 기울이기: 속도 방향으로
	var target_lean: float = clampf(velocity.x / c.run_speed, -1.0, 1.0) * a.lean_max
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
	# 달리기 다리 주기
	if is_on_floor():
		_run_phase += absf(velocity.x) * delta * 0.28


func _draw() -> void:
	if dead:
		return
	# 발을 기준으로 기울이고(lean) 늘이고 줄임(sx, sy). 방향은 x 배율 부호로
	draw_set_transform(Vector2.ZERO, _lean, Vector2(facing * _sx, _sy))
	var col: Color = Config.colors.player
	# 다리
	if not is_on_floor():
		var tuck := 1 if velocity.y < 0.0 else 0
		draw_rect(Rect2(-3, -6, 2, 5 - tuck), col)
		draw_rect(Rect2(1, -6, 2, 4), col)
		draw_rect(Rect2(2, -3, 2, 1), col)
	else:
		var s1 := sin(_run_phase)
		var s2 := sin(_run_phase + PI)
		var lift1 := maxf(0.0, roundf(-cos(_run_phase) * 1.5))
		var lift2 := maxf(0.0, roundf(cos(_run_phase) * 1.5))
		draw_rect(Rect2(-3 + roundf(s1 * 2.5), -6, 2, 6 - lift1), col)
		draw_rect(Rect2(0 + roundf(s2 * 2.5), -6, 2, 6 - lift2), col)
	# 몸통 + 머리 + 뒷머리
	draw_rect(Rect2(-3, -13, 6, 7), col)
	draw_rect(Rect2(-2, -17, 5, 4), col)
	draw_rect(Rect2(-4, -17, 2, 2), col)
	# 칼집 (등 뒤에 비스듬히)
	for p in [Vector2(-4, -11), Vector2(-5, -10), Vector2(-6, -9), Vector2(-3, -12)]:
		draw_rect(Rect2(p, Vector2.ONE), col)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
