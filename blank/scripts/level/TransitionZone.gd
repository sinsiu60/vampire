@tool
extends Node2D
class_name TransitionZone
## 구간 전환 선 (구간 씬의 TransitionZones 아래에 놓음 — 위치는 자유, 꼭 구간 끝일 필요 없음).
## 두께 8px · 길이 length 의 얇은 띠: RIGHT / LEFT 면 세로로 (이 노드 x 가 선, y 부터 아래로 length), UP / DOWN 이면 가로로.
## 플레이어 몸 중심이 direction 쪽으로 선을 지나는 틱에 CameraRig 가 next_segment_id 구간으로 전환 (카메라가 미끄러짐).
## one_way (기본) = 지나면 선 뒤에 보이지 않는 벽 (지형 층 — 되돌아갈 수 없음 · 뒤에서 총알 · 시야도 막음).
## 에디터에서만 주황 띠로 보임.

@export var next_segment_id := ""
@export_enum("RIGHT", "LEFT", "UP", "DOWN") var direction := "RIGHT"
@export var one_way := true
@export var length := 432.0:
	set(v):
		length = v
		queue_redraw()

const THICK := 8.0

var passed := false               ## 이미 지남 (다시 전환하지 않음)
var _wall: StaticBody2D = null


func _ready() -> void:
	if Engine.is_editor_hint():
		return
	add_to_group("transition_zones")


func dir_vector() -> Vector2:
	match direction:
		"LEFT":
			return Vector2.LEFT
		"UP":
			return Vector2.UP
		"DOWN":
			return Vector2.DOWN
	return Vector2.RIGHT


func _horizontal() -> bool:
	return direction == "RIGHT" or direction == "LEFT"


## 선의 다른 축 범위 안인가
func _in_span(p: Vector2) -> bool:
	var g := global_position
	if _horizontal():
		return p.y >= g.y and p.y <= g.y + length
	return p.x >= g.x and p.x <= g.x + length


## a → b 로 움직이며 direction 쪽으로 선을 지났나
func crossed(a: Vector2, b: Vector2) -> bool:
	if not _in_span(b):
		return false
	var g := global_position
	match direction:
		"RIGHT":
			return a.x < g.x and b.x >= g.x
		"LEFT":
			return a.x > g.x and b.x <= g.x
		"UP":
			return a.y > g.y and b.y <= g.y
		"DOWN":
			return a.y < g.y and b.y >= g.y
	return false


## p 가 이미 선을 지난 쪽에 있나
func behind(p: Vector2) -> bool:
	var g := global_position
	match direction:
		"RIGHT":
			return p.x >= g.x
		"LEFT":
			return p.x <= g.x
		"UP":
			return p.y <= g.y
		"DOWN":
			return p.y >= g.y
	return false


## 지난 뒤 벽 (one_way 일 때만): 선 바로 뒤쪽 (지나온 쪽) 두께 8px
func set_wall(on: bool) -> void:
	on = on and one_way
	if on and _wall == null:
		_wall = StaticBody2D.new()
		_wall.name = "Wall"
		_wall.collision_layer = Config.layers.terrain
		_wall.collision_mask = 0
		var cs := CollisionShape2D.new()
		var rs := RectangleShape2D.new()
		var d := dir_vector()
		if _horizontal():
			rs.size = Vector2(THICK, length)
			cs.position = Vector2(-d.x * THICK / 2.0, length / 2.0)
		else:
			rs.size = Vector2(length, THICK)
			cs.position = Vector2(length / 2.0, -d.y * THICK / 2.0)
		cs.shape = rs
		_wall.add_child(cs)
		add_child(_wall)
	elif not on and _wall != null:
		_wall.queue_free()
		_wall = null


func wall_on() -> bool:
	return _wall != null


func _draw() -> void:
	if not Engine.is_editor_hint():
		return
	var c := Color(1.0, 0.55, 0.2, 0.45)
	if _horizontal():
		draw_rect(Rect2(-THICK / 2.0, 0, THICK, length), c)
	else:
		draw_rect(Rect2(0, -THICK / 2.0, length, THICK), c)
