@tool
extends Node2D
class_name CameraBounds
## 이 구간에서 카메라가 보여 줄 수 있는 가장 큰 영역 (구간 씬 좌표, px). 구간 씬마다 하나 (scenes/Segment.tscn).
## 비워 두면 (크기 0) 구간 지형 전체. 이어진 맵에서는 Level 이 월드 좌표로 옮겨 Level.segment_info[i].bounds 에 둠.
## 에디터에서만 노란 점선 사각형으로 보임.

@export var rect := Rect2():
	set(v):
		rect = v
		queue_redraw()


func _draw() -> void:
	if not Engine.is_editor_hint() or rect.size == Vector2.ZERO:
		return
	var c := Color(1.0, 0.85, 0.3, 0.8)
	var p := [rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)]
	for i in 4:
		draw_dashed_line(p[i], p[(i + 1) % 4], c, 1.0, 6.0)
