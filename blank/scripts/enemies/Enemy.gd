extends CharacterBody2D
class_name Enemy
## 적 공통: 중력·지형 충돌, 발판 끝에서 멈추기, 몸통 사각형, 실루엣(림 라이트) 그리기 도우미.
## 노드 원점 = 발 중앙. cfg 는 하위 클래스가 Config.melee / Config.gunner 로 정함.

signal died(enemy: Enemy)

var cfg: Dictionary
var facing := -1                 # 처음엔 왼쪽(플레이어 시작 쪽)을 봄
var state := "idle"
var t := 0.0                     # 지금 상태에 들어온 뒤 경과 시간 (월드 시간)
var dead := false

const LAYER_TERRAIN := 1
const LAYER_ENEMY := 4


func _setup(c: Dictionary) -> void:
	cfg = c
	var shape := RectangleShape2D.new()
	shape.size = Vector2(c.w, c.h)
	$Collision.shape = shape
	$Collision.position = Vector2(0, -c.h / 2.0)
	collision_layer = LAYER_ENEMY
	collision_mask = LAYER_TERRAIN     # 플레이어와는 몸으로 부딪히지 않음 (프로토타입과 같게)
	floor_snap_length = 2.0
	add_to_group("enemies")


func set_state(s: String) -> void:
	state = s
	t = 0.0


## 몸통 사각형 (전역 좌표)
func body_rect() -> Rect2:
	return Rect2(global_position - Vector2(cfg.w / 2.0, cfg.h), Vector2(cfg.w, cfg.h))


func center() -> Vector2:
	return global_position + Vector2(0, -cfg.h / 2.0)


## 진행 방향 발밑에 지형이 있는가 (발판 끝에서 멈추기)
func can_step(dir: int) -> bool:
	if not Config.enemy.edge_stop or not is_on_floor() or dir == 0:
		return true
	var q := PhysicsPointQueryParameters2D.new()
	q.position = global_position + Vector2(dir * (cfg.w / 2.0 + 1.0), 2.0)
	q.collision_mask = LAYER_TERRAIN
	return not get_world_2d().direct_space_state.intersect_point(q, 1).is_empty()


func walk(dir: int, speed: float, accel: float, delta: float) -> void:
	var target := dir * speed
	if dir != 0 and not can_step(dir):
		target = 0.0
	velocity.x = move_toward(velocity.x, target, accel * delta)


func apply_physics(delta: float) -> void:
	velocity.y = minf(velocity.y + Config.enemy.gravity * delta, Config.enemy.max_fall)
	move_and_slide()


## 공격 판정 사각형 (전역). 공격 중이 아니면 빈 Rect2
func attack_box() -> Rect2:
	return Rect2()


## 처치됨 (연출은 6단계에서 Effects 로)
func die(_angle: float) -> void:
	if dead:
		return
	dead = true
	died.emit(self)
	queue_free()


# ---------------------------------------------------------------- 그리기 도우미
## 모양 목록 [[ "rect", Rect2 ] | [ "poly", PackedVector2Array ]] 을
## 림 색으로 상하좌우 1px 밀어 그린 뒤 본체 색으로 덮음 → 어두운 실루엣 + 1px 테두리
func draw_rimmed(shapes: Array, body: Color, rim: Color) -> void:
	for off in [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]:
		_draw_shapes(shapes, rim, off)
	_draw_shapes(shapes, body, Vector2.ZERO)


func _draw_shapes(shapes: Array, color: Color, off: Vector2) -> void:
	for s in shapes:
		if s[0] == "rect":
			draw_rect(Rect2(s[1].position + off, s[1].size), color)
		else:
			var pts: PackedVector2Array = s[1].duplicate()
			for i in pts.size():
				pts[i] += off
			draw_colored_polygon(pts, color)
