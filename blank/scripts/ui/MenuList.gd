extends Control
class_name MenuList
## 세로 메뉴 (키보드 방향키 · 엔터 · ESC + 마우스 가리키기 · 클릭). 항목 [{ id, label, enabled }].
## 선택된 항목은 강조색 + 왼쪽 ▸, 비활성 항목은 흐리게 (고를 수 없음). chosen(id) · cancelled 신호.

signal chosen(id: String)
signal cancelled
signal moved(index: int)

@export var line_h := 16.0
@export var font_size := 11
@export var align := "center"          ## center | left

var items: Array = []                  ## [{ id, label, enabled }]
var index := 0
var active := true                     ## false 면 입력을 받지 않음 (확인창이 떠 있는 동안 등)
var _hover := -1


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_items(list: Array, keep := false) -> void:
	items = list
	if not keep or index >= items.size() or not _enabled(index):
		index = _first_enabled()
	queue_redraw()


func set_enabled(id: String, on: bool) -> void:
	for it in items:
		if it.id == id:
			it.enabled = on
	if not _enabled(index):
		index = _first_enabled()
	queue_redraw()


func _enabled(i: int) -> bool:
	return i >= 0 and i < items.size() and bool(items[i].get("enabled", true))


func _first_enabled() -> int:
	for i in items.size():
		if _enabled(i):
			return i
	return 0


func item_rect(i: int) -> Rect2:
	var w := size.x
	return Rect2(Vector2(0, i * line_h), Vector2(w, line_h))


func _move(d: int) -> void:
	if items.is_empty():
		return
	var i := index
	for k in items.size():
		i = (i + d + items.size()) % items.size()
		if _enabled(i):
			break
	if i != index:
		index = i
		UIKit.sfx("move")
		moved.emit(index)
	queue_redraw()


func _choose(i: int) -> void:
	if not _enabled(i):
		return
	index = i
	UIKit.sfx("select")
	queue_redraw()
	chosen.emit(String(items[i].id))


func _input(event: InputEvent) -> void:
	if not active or not is_visible_in_tree():
		return
	if event is InputEventMouseMotion:
		var lp := get_local_mouse_position()
		var h := -1
		for i in items.size():
			if item_rect(i).has_point(lp):
				h = i
		if h != _hover:
			_hover = h
			if h >= 0 and _enabled(h) and h != index:
				index = h
				UIKit.sfx("move")
				moved.emit(index)
			queue_redraw()
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var lp := get_local_mouse_position()
		for i in items.size():
			if item_rect(i).has_point(lp):
				get_viewport().set_input_as_handled()
				_choose(i)
				return
		return
	if event.is_echo():
		return
	if event.is_action_pressed("ui_up"):
		get_viewport().set_input_as_handled()
		_move(-1)
	elif event.is_action_pressed("ui_down"):
		get_viewport().set_input_as_handled()
		_move(1)
	elif event.is_action_pressed("ui_accept"):
		get_viewport().set_input_as_handled()
		_choose(index)
	elif event.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		UIKit.sfx("back")
		cancelled.emit()


func _draw() -> void:
	var S := UIKit.style()
	for i in items.size():
		var r := item_rect(i)
		var on := _enabled(i)
		var sel := i == index and on
		var col: Color = S.ACCENT if sel else Color(S.TEXT, 1.0 if on else S.DIM)
		var label: String = items[i].label
		var y := r.position.y + r.size.y / 2.0
		if align == "center":
			UIKit.text(self, label, Vector2(r.size.x / 2.0, y), font_size, col, "center")
			if sel:
				var w := UIKit.width(label, font_size)
				UIKit.text(self, "▸", Vector2(r.size.x / 2.0 - w / 2.0 - 10.0, y), font_size, col, "center")
		else:
			UIKit.text(self, label, Vector2(12, y), font_size, col)
			if sel:
				UIKit.text(self, "▸", Vector2(2, y), font_size, col)
