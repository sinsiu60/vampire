extends RefCounted
class_name SegmentKit
## 구간 씬 기본 노드를 갖춰 줌 (만드는 도구 · 옮기는 도구가 같이 씀):
##  Props (배경 소품) · CameraBounds (카메라 영역 — 지형 전체) · TransitionZones (+ 다음 구간이 있으면 오른쪽 끝에 TransitionZone 하나)
##  관문 구간: Gate 아래 CameraZone (gate — 셔터 사이) · 보스방: BossCamera (boss — 방 전체, 가운데 고정)
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


## 1장 이어진 맵 구간 순서 (rooms/ch1/level_01.tscn 의 segments 와 같게)
const CH1_ORDER := ["room_01", "room_02", "room_03", "room_04", "seg_alley_a", "room_05", "seg_gate_01", "seg_rest_a",
	"seg_climb", "seg_roof_a", "seg_roof_b", "seg_descent", "seg_alley_b", "seg_rest_b", "seg_gate_02"]


## 1장 구간 씬 이름으로 (CH1 에 있으면) 구간 정보를 넣음 — 다음 구간 id 는 CH1_ORDER 순서로
static func finish_ch1(root: Node, file_name: String) -> void:
	if CH1.has(file_name):
		var d: Array = CH1[file_name]
		var i := CH1_ORDER.find(file_name)
		var next := ""
		if i >= 0 and i + 1 < CH1_ORDER.size():
			next = String(CH1[CH1_ORDER[i + 1]][0])
		finish(root, d[0], d[1], d[2], d[3], next)


static func finish(root: Node, id: String, title: String, gate := false, boss := false, next_id := "") -> void:
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
		var r := (root.get_node("Terrain") as TileMapLayer).get_used_rect()
		cb.set("rect", Rect2(0, 0, r.end.x * Config.room.tile, r.end.y * Config.room.tile))
		_add(root, cb)
	var t: float = Config.room.tile
	var used := (root.get_node("Terrain") as TileMapLayer).get_used_rect()
	var tzs := root.get_node_or_null("TransitionZones")
	if tzs == null:
		tzs = Node2D.new()
		tzs.name = "TransitionZones"
		_add(root, tzs)
	# 다음 구간으로: 이어 붙일 때 이음매 (오른쪽 벽 기둥 자리 = 다음 구간 시작) 에 세로 선
	if next_id != "" and tzs.get_child_count() == 0:
		var z := Node2D.new()
		z.set_script(load("res://scripts/level/TransitionZone.gd"))
		z.name = "ToNext"
		z.set("next_segment_id", next_id)
		z.set("length", used.end.y * t)
		z.position = Vector2((used.end.x - 1) * t, 0)
		tzs.add_child(z)
		z.owner = root
	# 관문: 셔터 사이 카메라 영역 (관문이 시작할 때 켜짐)
	var g := root.get_node_or_null("Gate")
	if g != null and g.get_node_or_null("CameraZone") == null:
		var b := g.get_node_or_null("Back") as Node2D
		var f := g.get_node_or_null("Front") as Node2D
		if b != null and f != null:
			var cz := Node2D.new()
			cz.set_script(load("res://scripts/level/CameraZone.gd"))
			cz.name = "CameraZone"
			cz.set("kind", "gate")
			var x0 := minf(b.position.x, f.position.x) - t
			var x1 := maxf(b.position.x, f.position.x) + t
			cz.set("rect", Rect2(x0, -(g as Node2D).position.y, x1 - x0, used.end.y * t))
			g.add_child(cz)
			cz.owner = root
	# 보스방: 방 전체 · 가운데 고정
	if boss and root.get_node_or_null("BossCamera") == null:
		var bz := Node2D.new()
		bz.set_script(load("res://scripts/level/CameraZone.gd"))
		bz.name = "BossCamera"
		bz.set("kind", "boss")
		bz.set("rect", Rect2(0, 0, used.end.x * t, used.end.y * t))
		_add(root, bz)


static func _add(root: Node, child: Node) -> void:
	root.add_child(child)
	child.owner = root
