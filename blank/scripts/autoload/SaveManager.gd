extends Node
## 저장 (오토로드 SaveManager) — user://save.json.
## 1단계: 타이틀이 쓰는 has_save · delete 만. 저장 시점 · 내용 · 이어하기는 4단계에서.

const PATH := "user://save.json"


func has_save() -> bool:
	return FileAccess.file_exists(PATH)


func delete_save() -> void:
	if has_save():
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


func load_data() -> Dictionary:
	if not has_save():
		return {}
	var d = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	return d if d is Dictionary else {}
