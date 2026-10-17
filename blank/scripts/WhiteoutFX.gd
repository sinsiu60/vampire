extends Node2D
class_name WhiteoutFX
## 섬광탄 하얀 화면 (Main.whiteout 0~1). 월드 맨 위에 흰 화면을 덮고, 플레이어와 철견의 실루엣만 희미하게.
## 원 · 조준선 · 불꽃은 모두 덮여 안 보임 (HUD 와 화면 효과 셰이더는 그 위). 수치는 Config.boss.

var main: Node


func _ready() -> void:
	z_index = 4000
	z_as_relative = false


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	if main == null:
		return
	var w: float = main.whiteout
	if w <= 0.0:
		return
	var r: Rect2 = main.view_rect().grow(8.0)
	draw_rect(r, Color(1, 1, 1, w))
	var sil := Color(0.2, 0.22, 0.28, float(Config.boss.FLASH_SILHOUETTE) * w)
	var p: Player = main.player
	if p != null and not p.dead:
		_draw_parts(p.body_parts(), p.global_position, sil)
	var b: BossCheolgyeon = main.boss
	if b != null and is_instance_valid(b) and not b.dead:
		_draw_parts(b.capture_silhouette(), b.global_position, sil)
	draw_set_transform_matrix(Transform2D.IDENTITY)


func _draw_parts(parts: Array, origin: Vector2, col: Color) -> void:
	for part in parts:
		var xf: Transform2D = part.xf
		draw_set_transform_matrix(Transform2D(0.0, origin) * xf)
		for s in part.shapes:
			if s[0] == "rect":
				draw_rect(s[1], col)
			else:
				draw_colored_polygon(s[1], col)
