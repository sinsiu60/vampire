extends Node2D
class_name Room
## 방: TileMapLayer(Terrain) 로 지형을 그리고, PlayerSpawn 마커로 시작 위치를 알려줌.
## 타일: (0,0) 지형 윗면, (1,0) 지형 속, (2,0) 일방향 발판 — tiles/terrain.tres
## 에디터에서 Terrain 레이어에 직접 칠해서 방을 고칠 수 있음.

@onready var terrain: TileMapLayer = $Terrain


func spawn_position() -> Vector2:
	return $PlayerSpawn.global_position


## 방 크기 (px) — 카메라 한계로 사용
func size_px() -> Vector2:
	return Vector2(Config.room.w, Config.room.h)
