extends Control
class_name Logo
## "시우 공방" 로고: 0.6초 나타남 → 0.8초 유지 → 0.6초 사라짐 (합계 2초, 실제 시간 틱 기준).
## 검은 화면 가운데 하늘색 글자(번짐) + 글자 아래로 그어지는 한 줄.

signal finished

var t := 0.0
var _font: SystemFont


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_font = SystemFont.new()
	_font.font_names = PackedStringArray(["sans-serif"])
	_font.font_weight = 700


var _done := false


func _physics_process(_delta: float) -> void:
	var L: Dictionary = Config.logo
	t += 1.0 / Config.fps
	queue_redraw()
	if t >= L.fade_in + L.hold + L.fade_out:
		_finish()


## 아무 키나 · 클릭 → 건너뛰기
func _input(event: InputEvent) -> void:
	if t < 0.1:
		return
	if (event is InputEventKey and event.pressed and not event.echo) or (event is InputEventMouseButton and event.pressed):
		get_viewport().set_input_as_handled()
		_finish()


func _finish() -> void:
	if _done:
		return
	_done = true
	set_physics_process(false)
	finished.emit()


func alpha() -> float:
	var L: Dictionary = Config.logo
	var a := 1.0
	if t < L.fade_in:
		a = t / L.fade_in
	elif t > L.fade_in + L.hold:
		a = 1.0 - (t - L.fade_in - L.hold) / L.fade_out
	a = clampf(a, 0.0, 1.0)
	return a * a * (3.0 - 2.0 * a)


func _draw() -> void:
	var L: Dictionary = Config.logo
	var W: float = Config.view.w
	var H: float = Config.view.h
	draw_rect(Rect2(0, 0, W, H), Color.BLACK)
	var col: Color = Config.colors.ui
	var a := alpha()
	var fs := 26
	var text: String = L.text
	var tw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var base := Vector2(roundf(W / 2.0 - tw / 2.0), roundf(H / 2.0 - 4.0 + fs * 0.35))
	# 번짐 (프로토타입 shadowBlur 10 대신 옅게 여러 번)
	for off in [Vector2(-1, 0), Vector2(1, 0), Vector2(0, -1), Vector2(0, 1)]:
		draw_string(_font, base + off * 1.5, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(col, a * 0.25))
	draw_string(_font, base, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(col, a))
	# 글자 아래로 그어지는 한 줄
	var k := clampf(t / (L.fade_in + L.hold), 0.0, 1.0)
	var lw := 90.0 * (1.0 - pow(1.0 - k, 3.0))
	draw_rect(Rect2(roundf(W / 2.0 - lw / 2.0), roundf(H / 2.0 + 14.0), roundf(lw), 1), Color(col, a))
