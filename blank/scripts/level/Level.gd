extends Room
class_name Level
## 1장 이어진 큰 맵 (선형 진행). 구간 씬 (rooms/ch1/room_01.tscn … seg_gate_01.tscn) 을 가로로 이어 붙여 방 하나로 만듦 — 실행할 때.
## 구간 씬은 예전 방 그대로 (Terrain · Entrance · Exit · PlayerSpawn · Enemies · RadioTrigger · Gate · Checkpoint …) — 에디터에서 따로 고침.
## 이어 붙이기:
##  - 지형: 첫 구간은 왼쪽 벽, 마지막 구간은 오른쪽 벽만 남기고 구간 사이 벽 기둥은 빼고 붙임 (바닥 높이가 다르면 턱 · 낭떠러지)
##  - 문: 첫 구간의 Entrance, 마지막 구간의 Exit (보스방 문) 만 남기고 구간 사이 문은 뺌. 관문 셔터 (Gate 아래 Door) 는 그대로
##  - 체크포인트: 첫 구간 PlayerSpawn = 시작, 나머지 구간의 PlayerSpawn · Checkpoint 노드 = 체크포인트 (x 순)
##  - 적 · 그 밖의 노드는 위치만 옮겨 그대로. 골목 조명 (lamp_xs) 도 합침. 배경음 · 아트 스타일은 첫 구간 것
## 구간 = 체크포인트 하나에서 다음 체크포인트 전까지 (GameState.checkpoint). 죽으면 마지막 체크포인트에서, 그 앞 구간의 적은 없앰.

@export var segments: Array[PackedScene] = []

var checkpoints: Array = []      ## 체크포인트 발 위치 (Vector2, x 순) — [0] = 시작 위치
var segment_x: Array = []        ## 구간 씬마다 시작 x (px)


func _ready() -> void:
	_build()


func _build() -> void:
	var tile: float = Config.room.tile
	var off := 0                                       # 다음 구간이 붙을 칸 x
	var lamps := PackedFloat32Array()
	var en := get_node_or_null("Enemies")
	if en == null:
		en = Node2D.new()
		en.name = "Enemies"
		add_child(en)
	var cps: Array = []
	var n := segments.size()
	for i in n:
		var seg: Node2D = segments[i].instantiate()
		var tm: TileMapLayer = seg.get_node("Terrain")
		if i == 0:
			terrain.tile_set = tm.tile_set
			ambience = String(seg.get("ambience"))
			ambience_volume = float(seg.get("ambience_volume"))
			paint_terrain = bool(seg.get("paint_terrain"))
			art_style = String(seg.get("art_style"))
		var r := tm.get_used_rect()
		var start := 0 if i == 0 else 1
		var end := r.end.x - 1 if i == n - 1 else r.end.x - 2
		var shift := off - start
		for c in tm.get_used_cells():
			if c.x < start or c.x > end:
				continue
			terrain.set_cell(c + Vector2i(shift, 0), tm.get_cell_source_id(c), tm.get_cell_atlas_coords(c), tm.get_cell_alternative_tile(c))
		var px := Vector2(shift * tile, 0)
		segment_x.append(off * tile)
		for lx in seg.get("lamp_xs"):
			lamps.append(float(lx) + px.x)
		for child in seg.get_children():
			if child == tm:
				continue
			var nm := String(child.name)
			match nm:
				"Entrance":
					if i == 0:
						_adopt(child, self, px, "Entrance")
				"Exit":
					if i == n - 1:
						_adopt(child, self, px, "Exit")
				"PlayerSpawn":
					if i == 0:
						_adopt(child, self, px, "PlayerSpawn")
					else:
						cps.append((child as Node2D).position + px)
				"Enemies":
					for e in child.get_children():
						_adopt(e, en, px, "S%d_%s" % [i + 1, e.name])
				_:
					if child is Checkpoint:
						cps.append((child as Node2D).position + px)
					else:
						_adopt(child, self, px, "S%d_%s" % [i + 1, nm])
		off = shift + end + 1
		seg.free()
	lamp_xs = lamps
	terrain.update_internals()
	checkpoints = [spawn_position()]
	cps.sort_custom(func(a, b): return a.x < b.x)
	checkpoints.append_array(cps)
	GameState.zone_count = checkpoints.size()
	# 문 · 관문 같은 노드가 바닥에 그려지도록 Enemies 를 맨 뒤로 (적이 위에)
	move_child(en, get_child_count() - 1)


## 구간 씬의 노드를 이 방으로 옮김 (위치 + px, 이름 바꿈)
func _adopt(node: Node, to: Node, px: Vector2, new_name: String) -> void:
	node.get_parent().remove_child(node)
	node.owner = null
	if node is Node2D:
		(node as Node2D).position += px
	node.name = new_name
	to.add_child(node)


## 시작 위치 = 지금 체크포인트 (GameState.checkpoint)
func spawn_position() -> Vector2:
	if checkpoints.is_empty():
		return $PlayerSpawn.global_position
	return checkpoints[clampi(GameState.checkpoint, 0, checkpoints.size() - 1)]


func zone_count() -> int:
	return checkpoints.size()


## x 가 속한 구간 (지난 체크포인트 중 가장 뒤)
func zone_of(x: float) -> int:
	var z := 0
	for i in checkpoints.size():
		if x >= float(checkpoints[i].x):
			z = i
	return z


## 구간 i 의 x 범위 [시작, 끝)
func zone_range(i: int) -> Vector2:
	var a: float = checkpoints[i].x if i > 0 else -INF
	var b: float = checkpoints[i + 1].x if i + 1 < checkpoints.size() else INF
	return Vector2(a, b)


## 체크포인트 i 에서 다시 시작: 그 앞 구간의 적은 없애고, 지난 관문은 끝난 것으로
func prune_before(i: int) -> void:
	if i <= 0 or i >= checkpoints.size():
		return
	var x: float = checkpoints[i].x
	for e in get_node("Enemies").get_children():
		if e is Node2D and (e as Node2D).global_position.x < x:
			e.free()
	for g in get_tree().get_nodes_in_group("gates"):
		if is_ancestor_of(g) and g.trigger_x() < x:
			g.skip()
