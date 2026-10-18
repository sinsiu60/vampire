extends Node
## 저장 (오토로드 SaveManager) — user://save.json. 옵션 설정은 따로 user://settings.json (Settings).
## 저장 시점: 방 클리어 뒤 다음 방으로 넘어갈 때 (Boot.next_room) · 보스 페이즈 체크포인트 (GameState.checkpoint_changed) · 장 클리어.
## 내용: 지금 장 · 방, 보스 체크포인트, 본 적 소개 기록, 장 통계 (플레이 시간 · 사망 · 패링 성공 · 반격 성공), 클리어한 장.
## 이어하기 = 저장된 방 (또는 보스 페이즈) 처음부터. 장 클리어 기록이면 클리어 화면으로.

const PATH := "user://save.json"
const VERSION := 1

var enabled := true              ## 테스트용 방 (room_override) · 단독 실행에선 저장 안 함
var last_reason := ""            ## 마지막 저장 이유 (room | checkpoint | chapter_clear) — 테스트 · 디버그
var save_count := 0
var _summary := ""               # 요약 캐시 (저장 · 삭제하면 다시)


func _ready() -> void:
	GameState.checkpoint_changed.connect(_on_checkpoint)


func has_save() -> bool:
	return FileAccess.file_exists(PATH)


func delete_save() -> void:
	if has_save():
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))
	_summary = ""


func load_data() -> Dictionary:
	if not has_save():
		return {}
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	return d if d is Dictionary else {}


## 지금 GameState 를 저장
func save_game(reason: String) -> void:
	if not enabled or GameState.room_override != "":
		return
	var cp: Dictionary = GameState.boss_checkpoint
	var d := {
		"version": VERSION,
		"chapter": GameState.chapter,
		"room": GameState.room,
		"boss_checkpoint": cp if cp.get("key", "") == GameState.room_key() else {},
		"seen_intros": GameState.seen_intros.keys(),
		"stats": GameState.stats.duplicate(),
		"chapter_cleared": GameState.chapter_cleared,
		"reason": reason,
		"saved_at": Time.get_datetime_string_from_system(),
	}
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f == null:
		push_warning("SaveManager: %s 를 쓸 수 없음" % PATH)
		return
	f.store_string(JSON.stringify(d, "\t"))
	f.close()
	last_reason = reason
	save_count += 1
	_summary = ""


## 저장 내용을 GameState 로 (이어하기). 저장이 없으면 false
func apply_save() -> bool:
	var d := load_data()
	if d.is_empty():
		return false
	GameState.room_override = ""
	GameState.chapter = int(d.get("chapter", 1))
	GameState.chapter_cleared = int(d.get("chapter_cleared", 0))
	GameState.go_to(int(d.get("room", 1)))
	# 지금 방보다 앞의 방은 클리어한 것으로
	GameState.cleared.clear()
	for r in range(1, GameState.room):
		GameState.cleared[GameState.room_key(GameState.chapter, r)] = true
	var cp: Variant = d.get("boss_checkpoint", {})
	if cp is Dictionary and not (cp as Dictionary).is_empty():
		var c: Dictionary = cp
		if c.has("phase"):
			c.phase = int(c.phase)
		GameState.boss_checkpoint = c
	GameState.seen_intros.clear()
	for k in d.get("seen_intros", []):
		GameState.seen_intros[String(k)] = true
	GameState.reset_stats()
	var st: Variant = d.get("stats", {})
	if st is Dictionary:
		for k in GameState.stats:
			if (st as Dictionary).has(k):
				GameState.stats[k] = float(st[k]) if k == "time" else int(st[k])
	return true


## 저장된 게 장 클리어 기록인가 (이어하기 → 클리어 화면)
func is_chapter_clear_save(d := {}) -> bool:
	var data := load_data() if d.is_empty() else d
	return String(data.get("reason", "")) == "chapter_clear"


func _on_checkpoint() -> void:
	var cp: Dictionary = GameState.boss_checkpoint
	if cp.get("key", "") != GameState.room_key():
		return
	if get_tree().get_first_node_in_group("game") == null:
		return                                  # 이어하기가 체크포인트를 되돌리는 중 (게임 아직 없음)
	save_game("checkpoint")


## "1:05:09" / "4:07"
static func format_time(sec: float) -> String:
	var s := int(sec)
	if s >= 3600:
		return "%d:%02d:%02d" % [s / 3600, (s / 60) % 60, s % 60]
	return "%d:%02d" % [s / 60, s % 60]


## 디버그 표시용 한 줄 요약 (캐시)
func summary() -> String:
	if _summary == "":
		_summary = _make_summary()
	return _summary


func _make_summary() -> String:
	var d := load_data()
	if d.is_empty():
		return "저장: 없음"
	var cp: Dictionary = d.get("boss_checkpoint", {})
	var where := "%d장 방 %d" % [int(d.get("chapter", 1)), int(d.get("room", 1))]
	if cp.get("dead", false):
		where += " · 보스 처치"
	elif cp.has("phase"):
		where += " · 보스 페이즈 %d" % int(cp.phase)
	if String(d.get("reason", "")) == "chapter_clear":
		where = "%d장 클리어" % int(d.get("chapter_cleared", 1))
	var st: Dictionary = d.get("stats", {})
	return "저장: %s · %s · 사망 %d · 패링 %d · 반격 %d · 소개 %d (%s)" % [where, format_time(float(st.get("time", 0))),
		int(st.get("deaths", 0)), int(st.get("parries", 0)), int(st.get("counters", 0)), (d.get("seen_intros", []) as Array).size(), String(d.get("reason", ""))]
