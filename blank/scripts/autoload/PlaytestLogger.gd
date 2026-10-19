extends Node
## 플레이테스트 기록 (오토로드 PlaytestLogger). Config.PLAYTEST_MODE (또는 환경 변수 BLANK_PLAYTEST=1) 일 때만 동작.
## 게임을 켜면 세션 ID (날짜시간, 예 2026-10-19_14-03-22) 를 만들고 user://playtest/<세션ID>.csv 에 이벤트를 한 줄씩 씀.
## 이벤트마다 바로 파일에 flush — 게임이 강제 종료돼도 그 순간까지 남음.
##
## 열: time (게임을 켠 뒤 실제 초), play_time (장 통계 플레이 시간 — 일시정지 · 타이틀 제외), room ("1-3", 타이틀이면 "-"),
##     event, detail ("키=값; 키=값")
## 이벤트: session_start · new_game · continue · room_enter · room_clear · death · parry_success · parry_fail · parry_fail_update ·
##         roll · counter_success · boss_phase · pause · resume · to_title · option_change · chapter_clear · quit
##
## 요약 리포트: 1장 클리어 · 게임 종료 때 user://playtest/<세션ID>_summary.txt (이번 세션 이벤트로 계산, 다시 쓰면 최신으로 덮어씀)

const DIR := "user://playtest"
const HEADER := "time,play_time,room,event,detail"

var active := false
var session_id := ""
var path := ""
var count := 0                   ## 쓴 이벤트 수 (테스트)
var last_event := {}             ## 마지막 이벤트 { event, detail } (테스트)

var _file: FileAccess
var _t0 := 0
var _room_start := {}            # 방 키 → 처음 들어온 플레이 시간 (방 소요 시간 = 처음 들어옴 → 클리어, 재시작 포함)
var _room_tries := {}            # 방 키 → 들어온 횟수
var _pause_at := -1.0
var _quit_logged := false
var summary_path := ""
var session_play := 0.0          ## 이번 세션 플레이 시간 (게임 화면 · 일시정지 제외, Main 이 tick)
var _room_time := {}             # 방 키 → 이번 세션 그 방에 있던 플레이 시간
var _events: Array = []          # 이번 세션 이벤트 { event, detail, room, play } (요약 계산)
var feedbacks: Array = []        ## 이번 세션 설문 응답 (FeedbackScreen) — summary 끝 [피드백]
var _last_room := "-"            # 마지막으로 들어간 방 (종료 기록 — 종료 순간엔 게임이 이미 치워져 있을 수 있음)


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var env := OS.get_environment("BLANK_PLAYTEST")
	active = Config.PLAYTEST_MODE if env == "" else env not in ["0", "false", "off"]
	if not active:
		return
	_t0 = Time.get_ticks_msec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIR))
	session_id = Time.get_datetime_string_from_system(false, true).replace(":", "-").replace(" ", "_")
	path = "%s/%s.csv" % [DIR, session_id]
	# 같은 초에 두 번 켜면 뒤에 번호
	var n := 2
	while FileAccess.file_exists(path):
		path = "%s/%s_%d.csv" % [DIR, session_id, n]
		n += 1
	session_id = path.get_file().get_basename()
	summary_path = "%s/%s_summary.txt" % [DIR, session_id]
	_file = FileAccess.open(path, FileAccess.WRITE)
	if _file == null:
		push_warning("PlaytestLogger: %s 를 열 수 없음" % path)
		active = false
		return
	_file.store_line(HEADER)
	_file.flush()
	GameState.checkpoint_changed.connect(_on_checkpoint)
	log_event("session_start", { "version": String(Config.ui_style.VERSION), "difficulty": Settings.difficulty,
		"os": OS.get_name(), "date": Time.get_datetime_string_from_system(false, true) })


# ================================================================ 쓰기
## 이벤트 한 줄 (바로 flush)
func log_event(event: String, detail := {}) -> void:
	if not active or _file == null:
		return
	var t := (Time.get_ticks_msec() - _t0) / 1000.0
	var play := float(GameState.stats.get("time", 0.0))
	var parts := PackedStringArray()
	for k in detail:
		parts.append("%s=%s" % [k, _fmt(detail[k])])
	var row := "%.3f,%.2f,%s,%s,%s" % [t, play, _csv(room_label()), _csv(event), _csv("; ".join(parts))]
	_file.store_line(row)
	_file.flush()
	count += 1
	last_event = { "event": event, "detail": detail }
	_events.append({ "event": event, "detail": detail, "room": room_label(), "play": session_play })
	if event in ["chapter_clear", "quit"]:
		write_summary()


## 게임 화면에서 흐른 플레이 시간 (Main 이 물리 틱마다, 일시정지 · 장 클리어 뒤 제외)
func tick(delta: float) -> void:
	if not active:
		return
	session_play += delta
	var k := room_label()
	_room_time[k] = float(_room_time.get(k, 0.0)) + delta


## 설문을 띄울지: 1장 클리어 뒤엔 늘, 일시정지 → 타이틀로 는 이번 세션에 아직 설문을 안 했을 때만
func should_ask_feedback(where: String) -> bool:
	return active and (where == "chapter_clear" or feedbacks.is_empty())


## 설문 응답 { where, fun, annoy, parry, comment } 또는 { where, skipped } → csv 한 줄 + summary 다시 씀 (끝에 [피드백])
func add_feedback(r: Dictionary) -> void:
	if not active:
		return
	var d := r.duplicate()
	d.at = Time.get_datetime_string_from_system(false, true)
	feedbacks.append(d)
	log_event("feedback", r)
	write_summary()


## OS 파일 탐색기로 기록 폴더 열기 (타이틀 "기록 폴더 열기")
func open_folder() -> Error:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIR))
	return OS.shell_open(ProjectSettings.globalize_path(DIR))


func _fmt(v: Variant) -> String:
	if v is float:
		return str(snappedf(v, 0.01))
	if v is bool:
		return "yes" if v else "no"
	return str(v)


func _csv(s: String) -> String:
	if s.contains(",") or s.contains("\"") or s.contains("\n"):
		return "\"%s\"" % s.replace("\"", "\"\"")
	return s


## 지금 방 ("1-3") — 게임 화면이 아니면 "-", 연습 방이면 "practice"
func room_label() -> String:
	var boot := get_tree().get_first_node_in_group("boot") if is_inside_tree() else null
	if boot == null or String(boot.get("screen_name")) != "game":
		if boot != null or get_tree().get_first_node_in_group("game") == null:
			return "-"
	if GameState.room_override != "":
		return "practice"
	return GameState.room_key()


# ================================================================ 이벤트 (Main · Boot · 메뉴가 부름)
## 방 시작 (처음 들어옴 · 사망 뒤 재시작 모두). retry = 이 방 몇 번째 시도인지
func room_enter() -> void:
	if not active:
		return
	var k := room_label()
	_last_room = k
	_room_tries[k] = int(_room_tries.get(k, 0)) + 1
	if not _room_start.has(k):
		_room_start[k] = float(GameState.stats.get("time", 0.0))
	log_event("room_enter", { "try": _room_tries[k] })


## 방 클리어: 처음 들어온 뒤 걸린 플레이 시간 (재시작 포함) · 시도 횟수
func room_clear() -> void:
	if not active:
		return
	var k := room_label()
	var start := float(_room_start.get(k, GameState.stats.get("time", 0.0)))
	log_event("room_clear", { "room_time": float(GameState.stats.get("time", 0.0)) - start, "tries": int(_room_tries.get(k, 1)),
		"deaths": int(GameState.room_death_counts.get(GameState.room_key(), 0)) })
	_room_start.erase(k)
	_room_tries.erase(k)


## 사망: cause = { pattern (적 종류 · 보스 패턴), attack, type, err, err_ms? }, boss_phase (-1 = 보스 아님)
func death(cause: Dictionary, boss_phase := -1) -> void:
	var d := { "enemy": String(cause.get("pattern", "?")) }
	if boss_phase >= 0:
		d.enemy = "철견"
		d.pattern = String(cause.get("pattern", "?"))
		d.phase = boss_phase
	d.attack = String(cause.get("attack", "?"))
	d.type = _type_name(String(cause.get("type", "")))
	if cause.has("err_ms"):
		d.err_ms = cause.err_ms
	d.err = String(cause.get("err", ""))
	log_event("death", d)
	# 패링할 수 있는 공격에 죽음 = 패링 실패
	if String(cause.get("type", "")) != Config.ATK_EVADE:
		var f := { "type": d.type, "enemy": d.enemy, "attack": d.attack, "err": d.err }
		if d.has("pattern"):
			f.pattern = d.pattern
			f.phase = d.phase
		if cause.has("err_ms"):
			f.err_ms = cause.err_ms
		log_event("parry_fail", f)


## 늦게 누른 클릭으로 바로 앞 패링 실패의 오차가 정해짐 (+ms 늦음)
func parry_fail_update(err_ms: int) -> void:
	log_event("parry_fail_update", { "err_ms": err_ms, "err": "+%dms 늦음" % err_ms })


## 패링 성공: err_ms = 베기 시작 - 공격 순간 (음수 = 일찍), source = 사격 · 근접 · 철견 근접
func parry_success(err_ms: int, attack_type: String, source: String, enemy := "") -> void:
	var d := { "err_ms": err_ms, "type": _type_name(attack_type), "source": source }
	if enemy != "":
		d.enemy = enemy
	log_event("parry_success", d)


## 구르기 한 번 (끝날 때): dodged = 구르는 동안 맞았을 공격이 무적으로 통과했는지
func roll(dodged: bool, what := "") -> void:
	var d := { "dodged": dodged }
	if what != "":
		d.dodged_attack = what
	log_event("roll", d)


func counter_success(target: String) -> void:
	log_event("counter_success", { "target": target })


func pause(on: bool) -> void:
	if not active:
		return
	if on:
		_pause_at = Time.get_ticks_msec() / 1000.0
		log_event("pause")
	else:
		var d := {}
		if _pause_at >= 0.0:
			d.paused_for = Time.get_ticks_msec() / 1000.0 - _pause_at
		_pause_at = -1.0
		log_event("resume", d)


## 옵션 바꿈: 이전 · 이후 스냅샷 (Settings.snapshot) 을 비교해 바뀐 것마다 한 줄
func options_changed(before: Dictionary, after: Dictionary, where: String) -> void:
	if not active:
		return
	for k in after:
		if k == "bindings":
			for a in after.bindings:
				if str(before.get("bindings", {}).get(a, {})) != str(after.bindings[a]):
					log_event("option_change", { "key": "bind_" + String(a), "to": Settings.action_key_name(a), "where": where })
			continue
		if str(before.get(k)) != str(after[k]):
			log_event("option_change", { "key": k, "from": before.get(k), "to": after[k], "where": where })


## 게임 종료 (창 닫기 · 타이틀 "종료") — 한 번만
func quit(reason := "") -> void:
	if not active or _quit_logged:
		return
	_quit_logged = true
	var d := { "last_room": _last_room }
	if reason != "":
		d.reason = reason
	log_event("quit", d)


func _on_checkpoint() -> void:
	var cp: Dictionary = GameState.boss_checkpoint
	if cp.get("key", "") != GameState.room_key() or get_tree().get_first_node_in_group("game") == null:
		return
	if cp.get("dead", false):
		log_event("boss_phase", { "phase": "defeated" })
	else:
		var ph := int(cp.get("phase", 0))
		log_event("boss_phase", { "phase": { 0: "opening", 4: "finale" }.get(ph, ph) })


static func _type_name(t: String) -> String:
	match t:
		Config.ATK_NORMAL:
			return "NORMAL"
		Config.ATK_OPPORTUNITY:
			return "OPPORTUNITY"
		Config.ATK_EVADE:
			return "EVADE"
	return t.to_upper() if t != "" else "?"


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		quit("window_closed")


func _exit_tree() -> void:
	quit("exit")
	if _file != null:
		_file.close()
		_file = null


# ================================================================ 요약 리포트
## <세션ID>_summary.txt 쓰기 (덮어씀)
func write_summary() -> void:
	if not active or summary_path == "":
		return
	var f := FileAccess.open(summary_path, FileAccess.WRITE)
	if f == null:
		push_warning("PlaytestLogger: %s 를 쓸 수 없음" % summary_path)
		return
	f.store_string(summary_text())
	f.close()


static func _time(sec: float) -> String:
	var s := int(round(sec))
	if s >= 3600:
		return "%d시간 %02d분 %02d초" % [s / 3600, (s / 60) % 60, s % 60]
	if s >= 60:
		return "%d분 %02d초" % [s / 60, s % 60]
	return "%d초" % s


static func _pct(a: int, n: int) -> String:
	return "-" if n == 0 else "%d%% (%d/%d)" % [roundi(100.0 * a / n), a, n]


## 방 키 정렬 ("1-2" < "1-10")
static func _room_order(k: String) -> int:
	var p := k.split("-")
	return int(p[0]) * 100 + int(p[1]) if p.size() == 2 else 99999


func _of(event: String) -> Array:
	return _events.filter(func(e): return e.event == event)


## 요약 글 (summary.txt 내용)
func summary_text() -> String:
	var L := PackedStringArray()
	L.append("공백 (BLANK) 플레이테스트 요약")
	L.append("세션 %s · %s · %s · 기록 %s" % [session_id, String(Config.ui_style.VERSION), OS.get_name(), path.get_file()])
	L.append("작성 %s" % Time.get_datetime_string_from_system(false, true))
	L.append("")
	# ---- 개요
	var cleared := not _of("chapter_clear").is_empty()
	var rooms_seen := {}
	for e in _of("room_enter"):
		if String(e.room) not in ["-", "practice"]:
			rooms_seen[e.room] = true
	var keys: Array = rooms_seen.keys()
	keys.sort_custom(func(a, b): return _room_order(a) < _room_order(b))
	var last_room: String = keys.back() if not keys.is_empty() else "-"
	L.append("[개요]")
	L.append("총 플레이 시간: %s (게임 화면 · 일시정지 제외) / 켜 둔 시간 %s" % [_time(session_play), _time((Time.get_ticks_msec() - _t0) / 1000.0)])
	L.append("1장 클리어: %s" % ("예" if cleared else "아니오"))
	L.append("마지막 도달 방: %s" % last_room)
	L.append("난이도: %s" % _difficulty_text())
	L.append("사망: %d번" % _of("death").size())
	L.append("")
	# ---- 방별
	var clear_time := {}
	for e in _of("room_clear"):
		clear_time[e.room] = float(e.detail.get("room_time", 0.0))
	var deaths_by_room := {}
	for e in _of("death"):
		deaths_by_room[e.room] = int(deaths_by_room.get(e.room, 0)) + 1
	L.append("[방별]  방 | 머문 시간 | 클리어까지 | 사망")
	for k in keys:
		var ct := _time(clear_time[k]) if clear_time.has(k) else "클리어 못 함"
		L.append("  %s | %s | %s | %d" % [k, _time(float(_room_time.get(k, 0.0))), ct, int(deaths_by_room.get(k, 0))])
	if keys.is_empty():
		L.append("  (들어간 방 없음)")
	L.append("")
	# ---- 철견
	var boss_deaths: Array = _of("death").filter(func(e): return e.detail.has("phase"))
	L.append("[철견]")
	if boss_deaths.is_empty() and _of("boss_phase").is_empty():
		L.append("  만나지 않음")
	else:
		var reached := PackedStringArray()
		for e in _of("boss_phase"):
			var nm: String = { "opening": "오프닝", "finale": "피날레", "defeated": "처치" }.get(str(e.detail.phase), "페이즈 %s" % str(e.detail.phase))
			reached.append("%s %s" % [nm, _time(float(e.play))])
		L.append("  페이즈 도달: %s" % (", ".join(reached) if not reached.is_empty() else "-"))
		var by_phase := {}
		var by_pattern := {}
		for e in boss_deaths:
			var ph := int(e.detail.phase)
			by_phase[ph] = int(by_phase.get(ph, 0)) + 1
			var pt := String(e.detail.get("pattern", "?"))
			by_pattern[pt] = int(by_pattern.get(pt, 0)) + 1
		L.append("  사망 %d번 — 페이즈 1: %d · 2: %d · 3: %d" % [boss_deaths.size(), int(by_phase.get(1, 0)), int(by_phase.get(2, 0)), int(by_phase.get(3, 0))])
		var pts: Array = by_pattern.keys()
		pts.sort_custom(func(a, b): return by_pattern[a] > by_pattern[b])
		L.append("  패턴별 사망 Top 3:")
		for i in mini(3, pts.size()):
			L.append("    %d. %s — %d번" % [i + 1, pts[i], by_pattern[pts[i]]])
		if pts.is_empty():
			L.append("    (없음)")
	L.append("")
	# ---- 패링
	var ok := _of("parry_success")
	var fail := _fail_list()
	L.append("[패링]")
	L.append("  성공률: %s" % _pct(ok.size(), ok.size() + fail.size()))
	var errs: Array = []
	for e in ok + fail:
		if e.detail.has("err_ms"):
			errs.append(int(e.detail.err_ms))
	if errs.is_empty():
		L.append("  평균 입력 오차: - (오차가 기록된 패링 없음)")
	else:
		var sum := 0.0
		var abs_sum := 0.0
		var early := 0
		var late := 0
		for v in errs:
			sum += v
			abs_sum += absf(v)
			if v < 0: early += 1
			elif v > 0: late += 1
		var mean := sum / errs.size()
		var lean := "일찍 누르는 경향" if mean < -15.0 else ("늦게 누르는 경향" if mean > 15.0 else "치우침 거의 없음")
		L.append("  평균 입력 오차: %+dms (%s) · 평균 절대 오차 %dms · 일찍 %d번 / 늦게 %d번 (오차 기록 %d번)" % [roundi(mean), lean, roundi(abs_sum / errs.size()), early, late, errs.size()])
	var no_input := fail.filter(func(e): return not e.detail.has("err_ms")).size()
	if no_input > 0:
		L.append("  누르지 않고 맞음: %d번" % no_input)
	L.append("  공격 종류별 성공률:")
	for ty in ["NORMAL", "OPPORTUNITY"]:
		var a := ok.filter(func(e): return e.detail.get("type", "") == ty).size()
		var b := fail.filter(func(e): return e.detail.get("type", "") == ty).size()
		L.append("    %s: %s" % [ty, _pct(a, a + b)])
	var evade := _of("death").filter(func(e): return e.detail.get("type", "") == "EVADE").size()
	L.append("    EVADE (패링 불가): 사망 %d번" % evade)
	L.append("")
	# ---- 구르기 · 반격
	var rolls := _of("roll")
	var dodged := rolls.filter(func(e): return e.detail.get("dodged", false)).size()
	L.append("[구르기 · 반격]")
	L.append("  구르기 %d번 · 그중 공격을 피한 구르기 %d번" % [rolls.size(), dodged])
	L.append("  반격 성공 %d번" % _of("counter_success").size())
	L.append("")
	# ---- 기타
	L.append("[기타]")
	L.append("  일시정지 %d번 · 옵션 변경 %d번" % [_of("pause").size(), _of("option_change").size()])
	var q := _of("quit")
	if not q.is_empty():
		var why: String = { "title_menu": "타이틀 \"종료\"", "window_closed": "창 닫기", "exit": "프로그램 종료" }.get(String(q.back().detail.get("reason", "")), "-")
		L.append("  종료: %s · 마지막 방 %s" % [why, String(q.back().detail.get("last_room", "-"))])
	# ---- 설문 (있으면 맨 끝)
	if not feedbacks.is_empty():
		L.append("")
		L.append("[피드백]")
		for i in feedbacks.size():
			var fb: Dictionary = feedbacks[i]
			var wh: String = { "chapter_clear": "1장 클리어 뒤", "to_title": "타이틀로 나갈 때" }.get(String(fb.get("where", "")), String(fb.get("where", "")))
			L.append("  #%d (%s · %s)" % [i + 1, wh, String(fb.get("at", ""))])
			if fb.get("skipped", false):
				L.append("    건너뜀")
				continue
			L.append("    1) 가장 재밌었던 순간: %s" % _or_dash(fb.get("fun", "")))
			L.append("    2) 가장 짜증났던 곳: %s" % _or_dash(fb.get("annoy", "")))
			L.append("    3) 패링 타이밍: %s" % _or_dash(fb.get("parry", "")))
			L.append("    4) 한 줄 의견: %s" % _or_dash(fb.get("comment", "")))
	return "\n".join(L) + "\n"


static func _or_dash(v: Variant) -> String:
	var t := String(v).strip_edges()
	return t if t != "" else "-"


## 패링 실패 목록 (늦게 누른 클릭으로 바로 앞 실패의 오차가 정해졌으면 그 값으로)
func _fail_list() -> Array:
	var out: Array = []
	for e in _events:
		if e.event == "parry_fail":
			out.append({ "event": e.event, "detail": (e.detail as Dictionary).duplicate(), "room": e.room })
		elif e.event == "parry_fail_update" and not out.is_empty():
			out.back().detail.err_ms = e.detail.err_ms
	return out


## 시작 난이도 → 바뀐 값들 → 지금
func _difficulty_text() -> String:
	var start := ""
	for e in _events:
		if e.event == "session_start":
			start = String(e.detail.get("difficulty", ""))
	var chain := PackedStringArray([start.to_upper()])
	for e in _of("option_change"):
		if e.detail.get("key", "") == "difficulty":
			chain.append(String(e.detail.get("to", "")).to_upper())
	return " → ".join(chain) if chain.size() > 1 else "%s (바꾸지 않음)" % start.to_upper()

