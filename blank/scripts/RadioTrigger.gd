extends Area2D
class_name RadioTrigger
## 방 씬에 놓는 무전 구역: 플레이어가 들어가면 key 의 무전 (data/radio_lines.json) 을 한 번 (이번 실행 동안 — 죽고 다시 해도 반복 안 함).
## 크기는 size (가운데 기준). 다른 충돌 모양을 자식으로 직접 넣어도 됨.

@export var key := ""
@export var size := Vector2(96, 64)

var fired := false


func _ready() -> void:
	collision_layer = 0
	collision_mask = Config.layers.player
	monitoring = true
	if get_child_count() == 0:
		var cs := CollisionShape2D.new()
		var rs := RectangleShape2D.new()
		rs.size = size
		cs.shape = rs
		add_child(cs)
	body_entered.connect(_on_body)
	fired = GameState.radio_seen.has(key)


func _on_body(b: Node) -> void:
	if fired or key == "" or not (b is Player):
		return
	fired = true
	GameState.radio_seen[key] = true
	var main := get_tree().get_first_node_in_group("game")
	if main != null:
		main.radio(key)
