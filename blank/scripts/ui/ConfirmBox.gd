extends Control
class_name ConfirmBox
## 확인창: 가운데 판 + 문장 + [예 / 아니오] (키보드 · 마우스). answered(yes) 신호. ESC = 아니오.

signal answered(yes: bool)

var message := ""
var _menu: MenuList


func _ready() -> void:
	size = Vector2(Config.view.w, Config.view.h)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_menu = MenuList.new()
	_menu.line_h = 14.0
	add_child(_menu)
	_menu.chosen.connect(func(id): _answer(id == "yes"))
	_menu.cancelled.connect(func(): _answer(false))
	visible = false


func ask(text: String, yes_label := "예", no_label := "아니오") -> void:
	message = text
	visible = true
	_menu.set_items([{ "id": "yes", "label": yes_label, "enabled": true }, { "id": "no", "label": no_label, "enabled": true }])
	_menu.index = 1                       # 기본은 "아니오" (실수로 지우지 않게)
	_layout()
	queue_redraw()


func is_open() -> bool:
	return visible


func _answer(yes: bool) -> void:
	visible = false
	answered.emit(yes)


func _layout() -> void:
	var W: float = Config.view.w
	var H: float = Config.view.h
	var r := _box()
	_menu.position = Vector2(r.position.x, r.end.y - 34)
	_menu.size = Vector2(r.size.x, 28)
	size = Vector2(W, H)


func _box() -> Rect2:
	var W: float = Config.view.w
	var H: float = Config.view.h
	var w := maxf(200.0, UIKit.width(message, 11) + 32.0)
	return Rect2(roundf(W / 2.0 - w / 2.0), roundf(H / 2.0 - 34), roundf(w), 70)


func _draw() -> void:
	if not visible:
		return
	draw_rect(Rect2(Vector2.ZERO, Vector2(Config.view.w, Config.view.h)), Color(0, 0, 0, 0.45))
	var r := _box()
	UIKit.panel(self, r)
	UIKit.text(self, message, Vector2(r.get_center().x, r.position.y + 16), 11, UIKit.style().TEXT, "center")
