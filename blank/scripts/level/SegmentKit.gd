extends RefCounted
class_name SegmentKit
## 구간 씬 기본 노드를 갖춰 줌 (만드는 도구 · 옮기는 도구가 같이 씀):
##  Props (배경 소품) · CameraBounds (카메라 영역 — 지형 전체) · TransitionZones (구간 넘어가는 지점, 3단계)
## 이미 있으면 건드리지 않음.

## 파일 → [segment_id, 이름, 관문, 보스] (rooms/ch1/level_01.tscn 순서 + 보스방)
const CH1 := {
	"room_01": ["market_1", "시장 입구 1 (근접)", false, false],
	"room_02": ["market_2", "시장 입구 2 (총잡이)", false, false],
	"room_03": ["market_3", "시장 입구 3 (연사병 · 돌격병)", false, false],
	"room_04": ["market_4", "시장 입구 4 (척탄병)", false, false],
	"seg_alley_a": ["alley_a", "골목 조합 A", false, false],
	"room_05": ["market_5", "종합 (방 5)", false, false],
	"seg_gate_01": ["gate_1", "관문 1", true, false],
	"seg_rest_a": ["rest_a", "쉬어가는 길 A", false, false],
	"seg_climb": ["climb", "비상계단", false, false],
	"seg_roof_a": ["roof_a", "옥상 A", false, false],
	"seg_roof_b": ["roof_b", "옥상 B", false, false],
	"seg_descent": ["descent", "내려가기", false, false],
	"seg_alley_b": ["alley_b", "골목 조합 B", false, false],
	"seg_rest_b": ["rest_b", "쉬어가는 길 B", false, false],
	"seg_gate_02": ["gate_2", "관문 2", true, false],
	"room_06": ["boss", "철견 (보스방)", false, true],
}


## 1장 구간 씬 이름으로 (CH1 에 있으면) 구간 정보를 넣음
static func finish_ch1(root: Node, file_name: String) -> void:
	if CH1.has(file_name):
		var d: Array = CH1[file_name]
		finish(root, d[0], d[1], d[2], d[3])


static func finish(root: Node, id: String, title: String, gate := false, boss := false) -> void:
	root.set("segment_id", id)
	root.set("segment_name", title)
	root.set("is_gate", gate)
	root.set("is_boss", boss)
	if root.get_node_or_null("Props") == null:
		var props := Node2D.new()
		props.name = "Props"
		_add(root, props)
	if root.get_node_or_null("CameraBounds") == null:
		var cb := Node2D.new()
		cb.set_script(load("res://scripts/level/CameraBounds.gd"))
		cb.name = "CameraBounds"
		var tm := root.get_node("Terrain") as TileMapLayer
		var r := tm.get_used_rect()
		var t: float = Config.room.tile
		cb.set("rect", Rect2(0, 0, r.end.x * t, r.end.y * t))
		_add(root, cb)
	if root.get_node_or_null("TransitionZones") == null:
		var tz := Node2D.new()
		tz.name = "TransitionZones"
		_add(root, tz)


static func _add(root: Node, child: Node) -> void:
	root.add_child(child)
	child.owner = root
