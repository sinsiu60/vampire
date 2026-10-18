extends Control
class_name ChapterIntro
## 장 시작 카드 (scenes/ChapterIntro.tscn): 검은 화면에 한 줄씩 타이핑 (글자당 TYPE_CHAR, 줄 사이 TYPE_LINE_GAP).
## 클릭 · 엔터 · 스페이스: 치는 중이면 지금 줄을 바로 완성, 다 쳤으면 다음 줄로.
## 끝나면 화면 가운데 장 제목 CARD_TIME 초: "1장" (작게) / "비 내리는 시장" (크게) → finished (Boot 가 페이드 → 방 1).
## 문장은 res://data/chapter_texts.json

signal finished

var chapter := 1
var lines: Array = []
var line_i := 0                  ## 지금 치는 줄
var shown := 0                   ## 지금 줄에서 보인 글자 수
var phase := "type"              ## type | gap | card | done
var t := 0.0

var _acc := 0.0
var _card_t := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var d := TextData.chapter(chapter)
	lines = d.get("intro", [])
	if lines.is_empty():
		phase = "card"


func _input(event: InputEvent) -> void:
	var press := false
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		press = true
	elif event.is_action_pressed("ui_accept") and not event.is_echo():
		press = true
	if not press:
		return
	get_viewport().set_input_as_handled()
	advance()


## 클릭 한 번: 치는 중 → 줄 완성 / 다 쳤음 → 다음 줄 (마지막 줄이면 장 제목)
func advance() -> void:
	match phase:
		"type":
			shown = String(lines[line_i]).length()
			phase = "gap"
			_acc = 0.0
		"gap":
			_next_line()


func _next_line() -> void:
	line_i += 1
	shown = 0
	_acc = 0.0
	if line_i >= lines.size():
		phase = "card"
		_card_t = 0.0
	else:
		phase = "type"


func _process(delta: float) -> void:
	var S := UIKit.style()
	t += delta
	match phase:
		"type":
			_acc += delta
			var full: String = lines[line_i]
			while _acc >= float(S.TYPE_CHAR) and shown < full.length():
				_acc -= float(S.TYPE_CHAR)
				shown += 1
			if shown >= full.length():
				phase = "gap"
				_acc = 0.0
		"gap":
			_acc += delta
			if _acc >= float(S.TYPE_LINE_GAP):
				_next_line()
		"card":
			_card_t += delta
			if _card_t >= float(S.CARD_TIME):
				phase = "done"
				finished.emit()
	queue_redraw()


func _draw() -> void:
	var S := UIKit.style()
	var W: float = Config.view.w
	var H: float = Config.view.h
	draw_rect(Rect2(0, 0, W, H), Color.BLACK)
	if phase == "card" or phase == "done":
		var d := TextData.chapter(chapter)
		var k := clampf(minf(_card_t / 0.4, (float(S.CARD_TIME) - _card_t) / 0.4), 0.0, 1.0)
		UIKit.text(self, String(d.get("number", "")), Vector2(W / 2.0, H / 2.0 - 16), S.SIZE, Color(S.ACCENT, k), "center")
		UIKit.text(self, String(d.get("title", "")), Vector2(W / 2.0, H / 2.0 + 6), 22, Color(S.TEXT, k), "center", true)
		draw_rect(Rect2(roundf(W / 2.0 - 40), roundf(H / 2.0 + 22), 80, 1), Color(S.ACCENT, 0.5 * k))
		return
	# 지난 줄은 그대로, 지금 줄은 친 만큼 + 깜빡이는 커서
	var lh := 18.0
	var y0 := H / 2.0 - lh * (lines.size() - 1) / 2.0
	for i in mini(line_i + 1, lines.size()):
		var full: String = lines[i]
		var s := full if i < line_i else full.substr(0, shown)
		var col: Color = Color(S.TEXT, 0.55) if i < line_i else S.TEXT
		UIKit.text(self, s, Vector2(W / 2.0, y0 + i * lh), S.SIZE_BIG, col, "center")
		if i == line_i and fmod(t, 0.6) < 0.35:
			var w := UIKit.width(full, S.SIZE_BIG)
			var cx := W / 2.0 - w / 2.0 + UIKit.width(s, S.SIZE_BIG) + 2.0
			draw_rect(Rect2(roundf(cx), roundf(y0 + i * lh - 6), 1, 12), Color(S.ACCENT, 0.8))
