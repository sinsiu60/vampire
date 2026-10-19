extends Control
class_name ControlsScreen
## 첫 실행 조작법 (scenes/Controls.tscn, 플레이테스트 빌드): 로고 뒤 · 타이틀 전에 한 번 (Settings.controls_seen).
## 이동 / 점프 / 베기 (패링) / 구르기 키 — 옵션에서 바꾼 키 그대로. 아무 키 · 클릭 → finished.

signal finished

const ROWS := [["이동", ""], ["점프", "jump"], ["베기 (패링)", "slash"], ["구르기", "roll"]]
const READY_AFTER := 0.6         ## 로고를 건너뛴 키가 이어서 눌리지 않게

var t := 0.0
var _done := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size = Vector2(Config.view.w, Config.view.h)


func key_text(action: String) -> String:
	if action == "":
		return "%s / %s  (← →)" % [Settings.action_key_name("move_left"), Settings.action_key_name("move_right")]
	return Settings.action_key_name(action)


func _input(event: InputEvent) -> void:
	if _done or t < READY_AFTER:
		return
	var press: bool = (event is InputEventKey and event.pressed and not event.echo) or (event is InputEventMouseButton and event.pressed)
	if not press:
		return
	get_viewport().set_input_as_handled()
	_done = true
	UIKit.sfx("select")
	finished.emit()


func _process(delta: float) -> void:
	t += delta
	queue_redraw()


func _draw() -> void:
	var S := UIKit.style()
	var W: float = Config.view.w
	var H: float = Config.view.h
	draw_rect(Rect2(0, 0, W, H), Color.BLACK)
	var a := clampf(t / 0.3, 0.0, 1.0)
	UIKit.text(self, "조작법", Vector2(W / 2.0, 52), 22, Color(S.ACCENT, a), "center", true)
	draw_rect(Rect2(roundf(W / 2.0 - 40), 68, 80, 1), Color(S.ACCENT, 0.4 * a))
	var x0 := W / 2.0 - 110.0
	var x1 := W / 2.0 + 110.0
	for i in ROWS.size():
		var y := 96.0 + i * 22.0
		UIKit.text(self, String(ROWS[i][0]), Vector2(x0, y), S.SIZE_BIG, Color(S.TEXT, a))
		UIKit.text(self, key_text(ROWS[i][1]), Vector2(x1, y), S.SIZE_BIG, Color(S.ACCENT, a), "right")
		draw_rect(Rect2(roundf(x0), roundf(y + 9), x1 - x0, 1), Color(S.TEXT, 0.08 * a))
	UIKit.text(self, "칼이 닿는 순간 · 총을 쏘는 순간 베면 패링 — 보라색 공격은 구르기로", Vector2(W / 2.0, 190), 9, Color(S.TEXT, 0.6 * a), "center")
	UIKit.text(self, "ESC 일시정지 · R 다시 시작 · F9 스크린샷", Vector2(W / 2.0, 203), 9, Color(S.TEXT, 0.45 * a), "center")
	if t >= READY_AFTER and fmod(t, 1.0) < 0.7:
		UIKit.text(self, "아무 키나 누르세요", Vector2(W / 2.0, 232), S.SIZE, S.TEXT, "center")
