extends Control
class_name HUD
## 화면 글자 (480×270 HUD 레이어): 남은 적 수 · 켜진 디버그 표시 · 조작 안내(처음 몇 초) · CLEAR / 사망 ·
## F5 패링 입력 오차 · F2 타격감 패널 · F3/F4 시간 디버그 줄

static var play_t := 0.0         ## 첫 판 시작 후 경과 (재시작해도 이어짐 — 안내는 처음 몇 초만)

var main: Node


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	process_mode = Node.PROCESS_MODE_ALWAYS


func _physics_process(_delta: float) -> void:
	play_t += 1.0 / Config.fps
	queue_redraw()


func _draw() -> void:
	if main == null:
		return
	var C: Dictionary = Config.colors
	var W: float = Config.view.w
	var H: float = Config.view.h
	var ui: Color = C.ui
	# 남은 적 수 · 켜진 디버그
	Fonts.text(self, "남은 적 %d" % main.enemies().size(), Vector2(8, 10), 10, Color(ui, 0.85), "left", true, true)
	var flags := []
	if Debug.aim_debug: flags.append("AIM DEBUG")
	if Debug.timing: flags.append("TIMING")
	if Audio.muted: flags.append("MUTE")
	if not flags.is_empty():
		Fonts.text(self, "  ".join(flags), Vector2(W - 8, 10), 10, Color(ui, 0.85), "right", true, true)
	# F5: 패링 입력 오차 (오른쪽 아래)
	var tm: Dictionary = main.timing_msg
	if Debug.timing and not tm.is_empty() and tm.t < 2.5:
		var col: Color = C.parry if tm.ok else C.attack
		col.a = clampf(2.5 - tm.t, 0.0, 1.0)
		Fonts.text(self, tm.text, Vector2(W - 8, H - 24), 12, col, "right", true, true)
	if Debug.juice_panel:
		_draw_juice_panel()
	if Debug.slow or Debug.step:
		_draw_time_debug()
	# 조작 안내 (첫 판 몇 초)
	if play_t < Config.hint_time:
		var a := 0.75 * clampf(Config.hint_time - play_t, 0.0, 1.0)
		Fonts.text(self, "A/D 이동 · Space 점프 · 클릭 베기 — 칼이 닿는 순간 / 총을 쏘는 순간 베면 패링",
			Vector2(W / 2.0, H - 10), 10, Color(ui, a), "center")
	# CLEAR / 사망
	if main.game_state == "clear":
		_glow_text("CLEAR", Vector2(W / 2.0, H / 2.0 - 18), 28, true)
		_glow_text("방의 적을 모두 처치했다  ·  R 다시 하기", Vector2(W / 2.0, H / 2.0 + 10), 12, false)
	elif main.game_state == "dead":
		_glow_text("R  —  재시작", Vector2(W / 2.0, H / 2.0), 12, false)


func _glow_text(s: String, p: Vector2, size: int, mono: bool) -> void:
	var ui: Color = Config.colors.ui
	for off in [Vector2(-1, 0), Vector2(1, 0), Vector2(0, -1), Vector2(0, 1)]:
		Fonts.text(self, s, p + off, size, Color(ui, 0.25), "center", mono, true)
	Fonts.text(self, s, p, size, ui, "center", mono, true)


func _draw_juice_panel() -> void:
	var x := 8.0
	var y0 := 24.0
	var lh := 11.0
	var n := Settings.JUICE.size()
	var ui: Color = Config.colors.ui
	draw_rect(Rect2(x - 4, y0 - 8, 148, lh * (n + 3) + 4), Color(0, 0, 0, 0.7))
	Fonts.text(self, "F2 타격감 토글", Vector2(x, y0), 10, ui, "left", false, true)
	for i in n:
		var j: Dictionary = Settings.JUICE[i]
		var on := Settings.on(j.key)
		Fonts.text(self, "%d %s %s" % [(i + 1) % 10, "■" if on else "□", j.label], Vector2(x, y0 + lh * (i + 1)), 10,
			Color(ui, 1.0 if on else 0.4))
	Fonts.text(self, "-  전부 켜기/끄기", Vector2(x, y0 + lh * (n + 1)), 10, Color(ui, 0.7))
	Fonts.text(self, "듣기: Z 휘두르기 X 처치 C 패링 V 사격", Vector2(x, y0 + lh * (n + 2)), 10, Color(ui, 0.7))


## F3/F4: 시간 조작 상태 + 패링 시퀀스 / 킬 연출 타임라인 위치
func _draw_time_debug() -> void:
	var K: Dictionary = Config.kill
	var W: float = Config.view.w
	var parts := []
	if Debug.step:
		parts.append("F4 프레임 진행 (F4 다음 · Enter 해제)")
	else:
		parts.append("F3 슬로우 %d%%" % roundi(Config.debug.SLOW_SCALE * 100))
	parts.append("#%d" % Debug.frame)
	var seq: ParrySeq = main.seq
	if seq.active:
		parts.append("패링 시퀀스 %d/%df ×%.2f" % [seq.k, seq.kill_tick, seq.scale_at(seq.k)])
	var kf: int = main.kill_frame
	if kf >= 0 and kf < 40:
		parts.append("킬 +%df" % kf)
		var left := TimeManager.kill_stop_left()
		parts.append("타임스톱 %d/%d" % [K.KILL_HITSTOP_FRAMES - left, K.KILL_HITSTOP_FRAMES] if left > 0 else "조작 가능")
		var bf: int = main.effects.first_beam_frame()
		if bf >= 0:
			parts.append("빛줄기 %d/%d" % [bf, K.BEAM_FRAMES])
		parts.append("흔들림 %.1fpx" % main.camera.offset.length())
	draw_rect(Rect2(0, 18, W, 13), Color(0, 0, 0, 0.6))
	Fonts.text(self, "  ·  ".join(parts), Vector2(W / 2.0, 25), 10, Config.colors.ui, "center", false, true)
