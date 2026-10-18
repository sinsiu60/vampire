class_name TextData
## 대사 · 텍스트 데이터 (res://data/*.json) — 읽어서 캐시.
##  chapter_texts.json  장 시작 · 클리어 카드 { "1": { intro: [줄], number, title, clear: [줄] } }
##  radio_lines.json    잡음 무전 { 키: [줄, ...] } (2단계)
##  boss_lines.json     보스 대사 { 키: 문장 } (2단계)

const CHAPTERS := "res://data/chapter_texts.json"
const RADIO := "res://data/radio_lines.json"
const BOSS := "res://data/boss_lines.json"

static var _cache := {}


static func load_json(path: String) -> Dictionary:
	if _cache.has(path):
		return _cache[path]
	var out := {}
	if FileAccess.file_exists(path):
		var data = JSON.parse_string(FileAccess.get_file_as_string(path))
		if data is Dictionary:
			out = data
		else:
			push_warning("TextData: %s 를 읽지 못함" % path)
	_cache[path] = out
	return out


static func chapter(n: int) -> Dictionary:
	return load_json(CHAPTERS).get(str(n), {})


## 잡음 무전 한 묶음 (여러 줄) — 없으면 빈 배열
static func radio(key: String) -> Array:
	var v = load_json(RADIO).get(key, [])
	if v is String:
		return [v]
	return v if v is Array else []


## 보스 대사 한 문장 — 없으면 키 그대로 (빠진 걸 바로 알아보게)
static func boss(key: String) -> String:
	return String(load_json(BOSS).get(key, key))
