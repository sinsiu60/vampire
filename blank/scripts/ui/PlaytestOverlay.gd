extends Control
class_name PlaytestOverlay
## 플레이테스트 빌드 표시 (Boot 가 게임 화면 맨 위 층에 둠): 오른쪽 아래 아주 작게 "PLAYTEST v0.1" + 스크린샷 등 짧은 안내.

var _notice := ""
var _t := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	process_mode = Node.PROCESS_MODE_ALWAYS
	size = Vector2(Config.view.w, Config.view.h)
	PlaytestLogger.notice.connect(func(t: String):
		_notice = t
		_t = 0.0)


func _process(delta: float) -> void:
	_t += delta
	queue_redraw()


func _draw() -> void:
	var S := UIKit.style()
	var W: float = Config.view.w
	var H: float = Config.view.h
	# 게임 중엔 맨 아래 조작 안내 줄과 겹치지 않게 한 줄 위
	var boot := get_tree().get_first_node_in_group("boot")
	var y := H - 21.0 if boot != null and String(boot.screen_name) == "game" else H - 4.0
	UIKit.text(self, "PLAYTEST %s" % String(S.VERSION), Vector2(W - 3, y), 8, Color(S.TEXT, 0.35), "right")
	if _notice != "" and _t < 2.0:
		var a := clampf((2.0 - _t) / 0.4, 0.0, 1.0)
		var w := UIKit.width(_notice, 9) + 10.0
		var r := Rect2(roundf(W - w - 4), 4, roundf(w), 13)
		draw_rect(r, Color(S.PANEL, S.PANEL.a * a))
		UIKit.text(self, _notice, r.get_center(), 9, Color(S.ACCENT, a), "center")
