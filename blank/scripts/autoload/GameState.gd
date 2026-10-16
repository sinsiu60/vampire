extends Node
## 진행 상태 (오토로드): 지금 장 · 방 번호, 클리어한 방.
## 방 하나 = 씬 하나 (res://rooms/ch<장>/room_<번호>.tscn). 죽어서 R 로 재시작하면 같은 방을 처음부터 다시 만들고,
## 이전 방의 클리어 기록은 그대로 둔다.

signal room_changed

const CHAPTERS := {
	1: {
		"name": "비 내리는 뒷골목 시장",
		"rooms": [
			"res://rooms/ch1/room_01.tscn",
			"res://rooms/ch1/room_02.tscn",
			"res://rooms/ch1/room_03.tscn",
			"res://rooms/ch1/room_04.tscn",
			"res://rooms/ch1/room_05.tscn",
			"res://rooms/ch1/room_06.tscn",
		],
	},
}

var chapter := 1
var room := 1                    ## 1부터
var cleared := {}                ## "1-3" → true (클리어한 방)
var room_override := ""          ## 비어 있지 않으면 이 방 씬을 대신 엶 (테스트·옛 테스트 방 res://scenes/Room.tscn)


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


func mark_cleared() -> void:
	cleared[room_key()] = true


func is_cleared(c := -1, r := -1) -> bool:
	return cleared.has(room_key(c, r))


## 다음 방으로. 마지막 방이었으면 false (장 끝)
func advance() -> bool:
	if is_last_room():
		return false
	room += 1
	room_changed.emit()
	return true


## 방 번호로 바로 (디버그 F6 · 장 처음부터)
func go_to(r: int) -> void:
	room = clampi(r, 1, room_count())
	room_changed.emit()


func reset_chapter() -> void:
	cleared.clear()
	go_to(1)


## "1장 - 방 3/6"
func label() -> String:
	return "%d장 - 방 %d/%d" % [chapter, room, room_count()]
