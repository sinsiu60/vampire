extends Control
## 조준점 (하늘색 십자). 운영체제 커서는 숨기고 이걸 그린다. HUD(CanvasLayer) 아래에 둔다.


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	Input.mouse_mode = Input.MOUSE_MODE_HIDDEN


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	var m := get_viewport().get_mouse_position().round()
	var c: Color = Config.colors.ui
	draw_rect(Rect2(m.x - 4, m.y, 3, 1), c)
	draw_rect(Rect2(m.x + 2, m.y, 3, 1), c)
	draw_rect(Rect2(m.x, m.y - 4, 1, 3), c)
	draw_rect(Rect2(m.x, m.y + 2, 1, 3), c)
