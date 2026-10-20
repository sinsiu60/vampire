@tool
extends Marker2D
class_name GateSpawn
## 관문 웨이브의 적 하나 (Gate/WaveN 아래에 놓음). 위치 x = 착지 지점 (y 는 그 아래 첫 바닥 · 발판으로 맞춰짐).
## 플레이어와 너무 가깝거나 (MIN_PLAYER_DIST) 다른 착지 지점과 겹치면 (MIN_SPAWN_DIST) 가까운 빈 곳으로 비켜남.

const SCENES := {
	"melee": "res://scenes/EnemyMelee.tscn",
	"charger": "res://scenes/EnemyMelee.tscn",
	"gunner": "res://scenes/EnemyGunner.tscn",
	"burst": "res://scenes/EnemyGunner.tscn",
	"grenadier": "res://scenes/EnemyGrenadier.tscn",
}
const LABELS := { "melee": "근접", "charger": "돌격", "gunner": "총", "burst": "연사", "grenadier": "척탄" }

## 적 종류: 근접 적 · 돌격병 · 총잡이 · 연사병 · 척탄병
@export_enum("melee", "charger", "gunner", "burst", "grenadier") var kind := "melee":
	set(v):
		kind = v
		queue_redraw()


## 이 종류의 적 하나 (아직 트리 밖)
func make_enemy() -> Node2D:
	var e: Node2D = (load(SCENES.get(kind, SCENES.melee)) as PackedScene).instantiate()
	match kind:
		"charger":
			e.set("variant", "charger")
		"burst":
			e.set("burst_count", 2)
	return e


func _draw() -> void:
	if not Engine.is_editor_hint():
		return
	var c := Color("#F02832")
	draw_arc(Vector2.ZERO, 6.0, 0.0, TAU, 16, c, 1.0)
	draw_line(Vector2(0, -6), Vector2(0, -26), Color(c, 0.4), 1.0)
	draw_string(ThemeDB.fallback_font, Vector2(-12, -30), String(LABELS.get(kind, kind)), HORIZONTAL_ALIGNMENT_LEFT, -1, 10, c)
