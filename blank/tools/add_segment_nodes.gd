extends Node
## 1장 구간 씬들에 구간 정보 (segment_id · segment_name · is_gate · is_boss) 와 기본 노드 (Props · CameraBounds · TransitionZones) 를
## 넣고 다시 저장하는 도구 (한 번). 이미 있는 노드는 그대로. 실행: 이 스크립트를 붙인 빈 씬을 띄움 (오토로드가 있어야 함).

const DIR := "res://rooms/ch1/"


func _ready() -> void:
	for nm in SegmentKit.CH1:
		var d: Array = SegmentKit.CH1[nm]
		var path: String = DIR + nm + ".tscn"
		var root: Node = (load(path) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
		SegmentKit.finish(root, d[0], d[1], d[2], d[3])
		var ps := PackedScene.new()
		var err := ps.pack(root)
		if err == OK:
			err = ResourceSaver.save(ps, path)
		root.free()
		print("add_segment_nodes: ", nm, " → ", error_string(err))
	get_tree().quit()
