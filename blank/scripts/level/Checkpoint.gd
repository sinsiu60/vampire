@tool
extends Marker2D
class_name Checkpoint
## 체크포인트 (보이지 않음). 구간 씬에 놓으면 Level 이 모아서 x 순으로 씀 — 플레이어가 이 x 를 지나면 저장 · 기록,
## 죽으면 마지막 체크포인트 (발 위치 = 이 노드) 에서 다시. 구간 씬의 PlayerSpawn 도 (첫 구간 말고는) 체크포인트가 됨.
## 에디터에서만 작은 깃발로 보임.

func _draw() -> void:
	if not Engine.is_editor_hint():
		return
	draw_line(Vector2.ZERO, Vector2(0, -20), Color("#5AC8E6"), 1.0)
	draw_colored_polygon(PackedVector2Array([Vector2(0, -20), Vector2(8, -17), Vector2(0, -14)]), Color("#5AC8E6"))
