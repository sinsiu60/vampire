extends Control
class_name HUD
## 화면 글자 (480×270 HUD 레이어): 남은 적 수 · 켜진 디버그 표시 · 조작 안내(처음 몇 초) · CLEAR / 사망 ·
## F5 패링 입력 오차 · F2 타격감 패널 · F3/F4 시간 디버그 줄 · "출구가 열렸다" · 장 클리어 ·
## (디버그 모드) 왼쪽 아래 "1장 - 방 3/6"

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
	# 레터박스 (철견 페이즈 전환 연출)
	var lb: float = main.letterbox
	if lb > 0.0:
		var bh: float = roundf(CheolgyeonConfig.LETTERBOX_H * (1.0 - pow(1.0 - lb, 2.0)))
		draw_rect(Rect2(0, 0, W, bh), Color.BLACK)
		draw_rect(Rect2(0, H - bh, W, bh), Color.BLACK)
	# 남은 적 수 · 켜진 디버그
	Fonts.text(self, "남은 적 %d" % main.enemies().size(), Vector2(8, 10), 10, Color(ui, 0.85), "left", true, true)
	var flags := []
	if Debug.aim_debug: flags.append("AIM DEBUG")
	if Debug.timing: flags.append("TIMING")
	if main.boss != null and is_instance_valid(main.boss) and main.boss.viewer: flags.append("포즈 뷰어")
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
	# 출구 열림 · CLEAR (출구 없는 옛 테스트 방) · 장 클리어 · 사망
	var t: float = main.open_msg_t
	var R: Dictionary = Config.rooms
	if t >= 0.0 and t < R.OPEN_MSG_TIME:
		var a := clampf((R.OPEN_MSG_TIME - t) / 0.4, 0.0, 1.0) * clampf(t / 0.1, 0.0, 1.0)
		Fonts.text(self, "출구가 열렸다  →", Vector2(W / 2.0, 40), 12, Color(ui, a), "center", false, true)
	if main.game_state == "clear" and main.room.exit_door() == null:
		_glow_text("CLEAR", Vector2(W / 2.0, H / 2.0 - 18), 28, true)
		_glow_text("방의 적을 모두 처치했다  ·  R 다시 하기", Vector2(W / 2.0, H / 2.0 + 10), 12, false)
	elif main.game_state == "chapter_clear":
		_glow_text("%d장 클리어" % GameState.chapter, Vector2(W / 2.0, H / 2.0 - 18), 24, false)
		_glow_text("%s  ·  R 처음부터" % GameState.chapter_name(), Vector2(W / 2.0, H / 2.0 + 10), 12, false)
	elif main.game_state == "dead":
		_glow_text("R  —  재시작", Vector2(W / 2.0, H / 2.0), 12, false)
	_draw_boss()
	_draw_radio()
	# 디버그 모드: 지금 장 · 방
	if Debug.debug_mode():
		Fonts.text(self, GameState.label(), Vector2(8, H - 22), 9, Color(ui, 0.7), "left", false, true)


## 철견: 화면 위 하늘색 체력 칸 9개 (반격 베기 명중마다 하나씩 빔) · 휘청 중이면 칸이 깜빡임
## F9 포즈 뷰어: 왼쪽에 포즈 목록 (숫자 키)
func _draw_boss() -> void:
	var b: BossCheolgyeon = main.boss
	if b == null or not is_instance_valid(b) or b.dead:
		return
	var W: float = Config.view.w
	var ui: Color = Config.colors.ui
	var n: int = CheolgyeonConfig.HP
	var cw := 12.0
	var gap := 3.0
	var x0 := roundf(W / 2.0 - (cw * n + gap * (n - 1)) / 2.0)
	Fonts.text(self, CheolgyeonConfig.NAME, Vector2(W / 2.0, 9), 9, Color(ui, 0.85), "center", false, true)
	var blink: bool = b.is_staggered() and fmod(HUD.play_t, 0.12) < 0.06
	for i in n:
		var r := Rect2(x0 + i * (cw + gap), 16, cw, 4)
		if i < b.hp:
			var c: Color = Color.WHITE if blink and i == b.hp - 1 else ui
			draw_rect(r, c)
			draw_rect(r.grow(1.0), Color(ui, 0.25), false, 1.0)
		else:
			draw_rect(r, Color(ui, 0.4), false, 1.0)
	# 대사 (화면 아래, 한 자씩)
	var ls: Dictionary = b.line_state()
	if not ls.is_empty():
		var H: float = Config.view.h
		var full: String = ls.text
		var k := clampi(int(ls.t * ls.cps), 0, full.length())
		var y := H - 36.0
		draw_rect(Rect2(0, y - 8, W, 16), Color(0, 0, 0, 0.55))
		Fonts.text(self, CheolgyeonConfig.NAME, Vector2(10, y), 9, Color(ui, 0.8), "left", false, true)
		Fonts.text(self, full.substr(0, k), Vector2(W / 2.0, y), 11, Color.WHITE, "center", false, true)
	if b.viewer:
		_draw_pose_viewer(b)
	elif Debug.debug_mode():
		_draw_boss_timing(b)


## 디버그: 패턴 이름 + "패턴 시작 → 첫 플레이어 행동" · 행동 간격 · 패턴 사이 공백 (ms, 1초 넘으면 빨강)
func _draw_boss_timing(b: BossCheolgyeon) -> void:
	var d: Dictionary = b.dbg
	if d.is_empty():
		return
	var W: float = Config.view.w
	var ui: Color = Config.colors.ui
	var red: Color = Config.colors.attack
	var parts := [["P%d %s%s" % [b.phase, d.name, " (이어 붙임 %d)" % d.chain if d.get("chain", 0) > 0 else ""], ui]]
	if d.gap >= 0.0:
		parts.append(["공백 %dms" % roundi(d.gap * 1000.0), red if d.gap > 0.4 + 1e-3 else Color(ui, 0.75)])
	if d.first >= 0.0:
		parts.append(["시작→행동 %dms" % roundi(d.first * 1000.0), red if d.first > 1.0 else Color(ui, 0.75)])
	if d.since_prev >= 0.0:
		parts.append(["앞 패턴 행동→ %dms" % roundi(d.since_prev * 1000.0), red if d.since_prev > 1.0 else Color(ui, 0.75)])
	if d.max_gap > 0.0:
		parts.append(["행동 간격 최대 %dms" % roundi(d.max_gap * 1000.0), red if d.max_gap > 1.0 else Color(ui, 0.75)])
	# 가운데 정렬로 한 줄: 조각마다 폭을 재서 이어 붙임
	var y := 30.0
	var texts := parts.map(func(q): return q[0])
	var full := "  ·  ".join(texts)
	var w_total := Fonts.width(full, 9, false, true)
	var x := roundf(W / 2.0 - w_total / 2.0)
	for i in parts.size():
		var tx: String = parts[i][0] + ("  ·  " if i < parts.size() - 1 else "")
		Fonts.text(self, parts[i][0], Vector2(x, y), 9, parts[i][1], "left", false, true)
		x += Fonts.width(tx, 9, false, true)


func _draw_pose_viewer(b: BossCheolgyeon) -> void:
	var ui: Color = Config.colors.ui
	var poses: Array = b.pose_list()
	var x := 8.0
	var y0 := 30.0
	var lh := 10.0
	draw_rect(Rect2(x - 4, y0 - 8, 132, lh * (poses.size() + 2) + 4), Color(0, 0, 0, 0.7))
	Fonts.text(self, "F9 포즈 뷰어 (숫자 키)", Vector2(x, y0), 10, ui, "left", false, true)
	for i in poses.size():
		var key := str((i + 1) % 10) if i < 10 else "Shift+%d" % (i - 9)
		var on: bool = b.body.pose_name == poses[i]
		Fonts.text(self, "%s  %s" % [key, poses[i]], Vector2(x, y0 + lh * (i + 1)), 9, Color(ui, 1.0 if on else 0.55))
	Fonts.text(self, "같은 키 = 다시 전환", Vector2(x, y0 + lh * (poses.size() + 1)), 9, Color(ui, 0.55))


## 보스방 문이 열리는 동안: 화면 아래 잡음 섞인 무전 한 줄 (글자가 한 자씩 들어오고, 잡음 글자 · 지직 줄 · 흔들림)
const NOISE_GLYPHS := "░▒▓#%/\\=-"
const RADIO_CPS := 16.0          # 초당 글자 수


func _draw_radio() -> void:
	var r: Dictionary = main.radio_state()
	if r.is_empty():
		return
	var W: float = Config.view.w
	var H: float = Config.view.h
	var ui: Color = Config.colors.ui
	var a: float = r.alpha * clampf(r.t / 0.15, 0.0, 1.0)
	var y := H - 36.0
	draw_rect(Rect2(0, y - 8, W, 16), Color(0, 0, 0, 0.55 * a))
	# 지직거리는 잡음 줄
	for i in 6:
		var x := randf() * W
		draw_rect(Rect2(roundf(x), roundf(y - 8 + randf() * 16), roundf(randf_range(3, 24)), 1), Color(ui, randf_range(0.05, 0.25) * a))
	var full: String = r.text
	var n := clampi(int((r.t - 0.1) * RADIO_CPS), 0, full.length())
	var noise := clampf(0.35 - r.t * 0.12, 0.06, 0.35)        # 처음엔 잡음이 많고 점점 또렷해짐
	var shown := ""
	for i in n:
		var ch := full[i]
		if ch != " " and randf() < noise:
			ch = NOISE_GLYPHS[randi() % NOISE_GLYPHS.length()]
		shown += ch
	if n < full.length():
		shown += NOISE_GLYPHS[randi() % NOISE_GLYPHS.length()]
	var jx := roundf(randf_range(-1, 1)) if randf() < 0.15 else 0.0
	Fonts.text(self, "◂ 무전 ▸", Vector2(10, y), 9, Color(ui, 0.6 * a), "left", false, true)
	Fonts.text(self, shown, Vector2(W / 2.0 + jx, y), 11, Color(ui, a), "center", false, true)


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
	draw_rect(Rect2(x - 4, y0 - 8, 186, lh * (n + 5) + 4), Color(0, 0, 0, 0.7))
	Fonts.text(self, "F2 타격감 토글", Vector2(x, y0), 10, ui, "left", false, true)
	for i in n:
		var j: Dictionary = Settings.JUICE[i]
		var on := Settings.on(j.key)
		Fonts.text(self, "%d %s %s" % [(i + 1) % 10, "■" if on else "□", j.label], Vector2(x, y0 + lh * (i + 1)), 10,
			Color(ui, 1.0 if on else 0.4))
	Fonts.text(self, "-  전부 켜기/끄기", Vector2(x, y0 + lh * (n + 1)), 10, Color(ui, 0.7))
	Fonts.text(self, "듣기: Z 휘두르기 X 처치 C 패링 V 사격", Vector2(x, y0 + lh * (n + 2)), 10, Color(ui, 0.7))
	var si: int = Debug.sound_i
	var cur: String = Debug.SOUND_TEST[si] if si >= 0 else "-"
	if cur == "rain_loop":
		cur += " (켜짐)" if Debug._rain != null and is_instance_valid(Debug._rain) else " (꺼짐)"
	Fonts.text(self, "B 보스 효과음 차례로: %s" % cur, Vector2(x, y0 + lh * (n + 3)), 10, Color(ui, 0.7))
	var sync_names := ["뽑기+발사", "내려치기+칼"]
	Fonts.text(self, "N 싱크 테스트 0.6초 뒤: %s" % (sync_names[Debug.sync_i] if Debug.sync_i >= 0 else "-"), Vector2(x, y0 + lh * (n + 4)), 10, Color(ui, 0.7))


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
