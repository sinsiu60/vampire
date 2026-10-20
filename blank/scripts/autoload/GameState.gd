extends Node
## 진행 상태 (오토로드): 지금 장 · 방 번호 · 체크포인트, 클리어한 방.
## 1장 = 이어진 큰 맵 (rooms/ch1/level_01.tscn — 구간 씬을 이어 붙인 Level) + 보스방 (room_06).
## 큰 맵 안은 체크포인트로 나뉜 구간: 죽어서 R 로 재시작하면 마지막 체크포인트부터 (그 앞 구간의 적은 없음).
## 예전 방 씬 (room_01 ~ 05) 은 이제 큰 맵의 구간 — 따로 열려면 room_override.

signal room_changed
signal checkpoint_changed        ## 보스 체크포인트가 새로 정해짐 (SaveManager 가 저장)

const CHAPTERS := {
	1: {
		"name": "비 내리는 뒷골목 시장",
		"rooms": [
			"res://rooms/ch1/level_01.tscn",     # 이어진 맵: 시장 입구 → 골목 → 관문
			"res://rooms/ch1/room_06.tscn",      # 철견 보스방
		],
	},
}

var chapter := 1
var room := 1                    ## 1부터
var checkpoint := 0              ## 큰 맵 안 체크포인트 (0 = 시작) — 다시 시작 · 이어하기 위치
var zone_count := 1              ## 지금 방의 구간 수 (Level 이면 체크포인트 수, 아니면 1) — Level 이 정함
var cleared := {}                ## "1-3" → true (클리어한 방)
var boss_checkpoint := {}:       ## 보스 체크포인트 { key: "1-2" (room_key), phase, dead? } — 죽으면 R 로 지금 페이즈 시작부터
	set(v):
		boss_checkpoint = v
		if not v.is_empty():
			checkpoint_changed.emit()
var stats := {}                  ## 장 통계 { time (실제 초), deaths, parries, counters } — 새로 시작에 0, 저장 · 이어하기에 같이
var chapter_cleared := 0         ## 마지막으로 클리어한 장 (0 = 없음)
var death_log: Array = []        ## 사망 기록 (이번 실행 동안, R 재시작에도 유지) [{ pattern, attack, type, err, room }] — 최근이 끝
var death_counts := {}           ## 패턴 이름 → 사망 수
var radio_seen := {}             ## 한 번만 나오는 무전 (RadioTrigger 키) — 이번 실행 동안
var seen_intros := {}            ## 처음 만나는 적 소개를 이미 본 종류 (Config.intro.NAMES 키) — 이번 실행 동안, F11 초기화
var room_death_counts := {}      ## 방 키 ("1-3") → 사망 수 (디버그 표시)
var room_override := ""          ## 비어 있지 않으면 이 방 씬을 대신 엶 (테스트·옛 테스트 방 res://scenes/Room.tscn)


func _init() -> void:
	reset_stats()


func reset_stats() -> void:
	stats = { "time": 0.0, "deaths": 0, "parries": 0, "counters": 0 }


func add_stat(key: String, n := 1) -> void:
	stats[key] = int(stats.get(key, 0)) + n


## 새로 시작: 1장 처음부터 — 클리어 · 체크포인트 · 본 적 소개 · 통계 · 무전 기록 지움
func new_game() -> void:
	chapter = 1
	chapter_cleared = 0
	cleared.clear()
	seen_intros.clear()
	radio_seen.clear()
	reset_stats()
	go_to(1)


func room_path() -> String:
	if room_override != "":
		return room_override
	return CHAPTERS[chapter].rooms[room - 1]


func room_count() -> int:
	return CHAPTERS[chapter].rooms.size()


func chapter_name() -> String:
	return CHAPTERS[chapter].name


func is_last_room() -> bool:
	return room >= room_count()


func room_key(c := -1, r := -1) -> String:
	return "%d-%d" % [chapter if c < 0 else c, room if r < 0 else r]


## 구간까지 붙인 키 — 큰 맵이면 "1-1.3" (3번째 구간), 아니면 room_key() (기록 · 디버그)
func zone_key() -> String:
	if zone_count > 1:
		return "%s.%d" % [room_key(), checkpoint + 1]
	return room_key()


func mark_cleared() -> void:
	cleared[room_key()] = true


func is_cleared(c := -1, r := -1) -> bool:
	return cleared.has(room_key(c, r))


## 다음 방으로. 마지막 방이었으면 false (장 끝)
func advance() -> bool:
	if is_last_room():
		return false
	room += 1
	checkpoint = 0
	zone_count = 1
	boss_checkpoint = {}
	room_changed.emit()
	return true


## 방 번호로 바로 (디버그 F6 · 장 처음부터)
func go_to(r: int) -> void:
	room = clampi(r, 1, room_count())
	checkpoint = 0
	zone_count = 1
	boss_checkpoint = {}
	room_changed.emit()


func reset_chapter() -> void:
	cleared.clear()
	go_to(1)


## "1장 - 방 3/6"
func label() -> String:
	if room_override != "":
		return "연습 방 (Shift+F12 = 돌아가기)"
	if zone_count > 1:
		return "%d장 - 방 %d/%d · 구간 %d/%d" % [chapter, room, room_count(), checkpoint + 1, zone_count]
	return "%d장 - 방 %d/%d" % [chapter, room, room_count()]


## 사망 원인 기록: cause = { pattern (예 "④ 속사"), attack (예 "속사"), type (Config.ATK_*), err (패링 오차 글자) }
func log_death(cause: Dictionary) -> void:
	var c := cause.duplicate()
	c.room = zone_key()
	death_log.append(c)
	if death_log.size() > 50:
		death_log.pop_front()
	var k: String = c.get("pattern", "?")
	death_counts[k] = int(death_counts.get(k, 0)) + 1
	room_death_counts[c.room] = int(room_death_counts.get(c.room, 0)) + 1


## 이 방의 사망 기록 (최근이 끝)
func room_deaths(key := "") -> Array:
	var k := zone_key() if key == "" else key
	return death_log.filter(func(d): return d.get("room", "") == k)


## 처음 만나는 적 소개 기록 지우기 (F11)
func reset_intros() -> void:
	seen_intros.clear()


## 사망 뒤 늦게 누른 클릭 → 마지막 기록의 오차를 '+xxms 늦음' 으로
func update_last_death_err(err: String) -> void:
	if not death_log.is_empty():
		death_log[-1].err = err
