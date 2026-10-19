extends Node
## 플레이테스트 기록 (오토로드 PlaytestLogger). Config.PLAYTEST_MODE (또는 환경 변수 BLANK_PLAYTEST=1) 일 때만 동작.
## 게임을 켜면 세션 ID (날짜시간, 예 2026-10-19_14-03-22) 를 만들고 user://playtest/<세션ID>.csv 에 이벤트를 한 줄씩 씀.
## 이벤트마다 바로 파일에 flush — 게임이 강제 종료돼도 그 순간까지 남음.
##
## 열: time (게임을 켠 뒤 실제 초), play_time (장 통계 플레이 시간 — 일시정지 · 타이틀 제외), room ("1-3", 타이틀이면 "-"),
##     event, detail ("키=값; 키=값")
## 이벤트: session_start · new_game · continue · room_enter · room_clear · death · parry_success · parry_fail · parry_fail_update ·
##         roll · counter_success · boss_phase · pause · resume · to_title · option_change · chapter_clear · quit

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
	log_event("quit", { "reason": reason } if reason != "" else {})


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
