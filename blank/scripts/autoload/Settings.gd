extends Node
## 옵션 (오토로드). 옵션 화면 (타이틀 · 일시정지 공용) 에서 바꾸면 바로 적용 + user://settings.json 에 저장.
##  - 소리: vol_master · vol_music (배경음 = 빗소리 등 Music 버스) · vol_sfx (효과음 = World · Direct 버스) 0 ~ 1
##  - 화면: fullscreen · shake (화면 흔들림 강도 0 ~ 1.5, 5% 단위)
##  - 게임: difficulty (easy | normal | hard) · approach (발사 타이밍 원 표시)
##  - 조작: bindings { 동작: 입력 } — 공격 slash · 구르기 roll · 점프 jump · 이동 move_left / move_right (이동은 방향키도 그대로)
## 옛 user://settings.cfg 가 있으면 한 번 읽어 옮김. 타격감 토글(F2, 저장 안 함)도 여기: juice[key] = true/false

const PATH := "user://settings.json"
const OLD_PATH := "user://settings.cfg"
## 바꿀 수 있는 동작 (옵션 화면 순서) — 이름은 화면 표시
const BIND_ACTIONS := ["slash", "roll", "jump", "move_left", "move_right"]
const BIND_LABELS := { "slash": "공격", "roll": "구르기", "jump": "점프", "move_left": "왼쪽", "move_right": "오른쪽" }
const BIND_DEFAULTS := {
	"slash": { "type": "mouse", "code": MOUSE_BUTTON_LEFT },
	"roll": { "type": "key", "code": KEY_SHIFT },
	"jump": { "type": "key", "code": KEY_SPACE },
	"move_left": { "type": "key", "code": KEY_A },
	"move_right": { "type": "key", "code": KEY_D },
}
## 바꿔도 남는 보조 입력 (방향키 이동)
const BIND_EXTRA := { "move_left": [KEY_LEFT], "move_right": [KEY_RIGHT] }

## F2 패널 순서 = 숫자 키 1 ~ 0
const JUICE := [
	{ "key": "hitstop", "label": "타임스톱/히트스톱" },
	{ "key": "enemy_flash", "label": "피격 흰 섬광" },
	{ "key": "knockback", "label": "적 날아가기" },
	{ "key": "gore", "label": "피 + 자국" },
	{ "key": "slash_trail", "label": "베기 궤적(반달/3겹)" },
	{ "key": "shake", "label": "화면 흔들림" },
	{ "key": "recoil", "label": "플레이어 반동" },
	{ "key": "sound", "label": "사운드" },
	{ "key": "screen_flash", "label": "화면 섬광(패링)" },
	{ "key": "beam", "label": "빛줄기 + 흙먼지" },
	{ "key": "smear", "label": "스미어 (돌진 왜곡)" },     # = 키
]

var shake := 1.0
var approach := true
var difficulty := "normal"       ## 난이도 easy | normal | hard (Config.difficulty_presets)
var vol_master := 1.0
var vol_music := 1.0
var vol_sfx := 1.0
var fullscreen := false
var controls_seen := false       ## 첫 실행 조작법 화면을 봤음 (플레이테스트 빌드)
var bindings := {}               ## 동작 → { type: key | mouse, code }
var juice := {}
var roll_key: int:               ## 옛 이름 (구르기 키 물리 코드) — 마우스면 0
	get: return int(bindings.roll.code) if String(bindings.get("roll", {}).get("type", "")) == "key" else 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for j in JUICE:
		juice[j.key] = true
	for a in BIND_ACTIONS:
		bindings[a] = (BIND_DEFAULTS[a] as Dictionary).duplicate()
	load_settings()
	apply_bindings()
	Config.set_difficulty(difficulty)
	apply_audio.call_deferred()
	if fullscreen:
		apply_fullscreen.call_deferred()


# ---------------------------------------------------------------- 조작
static func _event_of(b: Dictionary) -> InputEvent:
	if String(b.get("type", "key")) == "mouse":
		var m := InputEventMouseButton.new()
		m.button_index = int(b.code) as MouseButton
		return m
	var k := InputEventKey.new()
	k.physical_keycode = int(b.code) as Key
	return k


## 동작마다 입력을 InputMap 에 반영 (project.godot 기본값을 덮어씀, 이동은 방향키도 남김)
func apply_bindings() -> void:
	for a in BIND_ACTIONS:
		if not InputMap.has_action(a):
			InputMap.add_action(a)
		InputMap.action_erase_events(a)
		InputMap.action_add_event(a, _event_of(bindings[a]))
		for extra in BIND_EXTRA.get(a, []):
			var k := InputEventKey.new()
			k.physical_keycode = extra
			InputMap.action_add_event(a, k)


## 이 입력을 이미 쓰는 다른 동작 (없으면 "")
func binding_owner(b: Dictionary, except := "") -> String:
	for a in BIND_ACTIONS:
		if a == except:
			continue
		var o: Dictionary = bindings[a]
		if String(o.type) == String(b.type) and int(o.code) == int(b.code):
			return a
		if String(b.type) == "key":
			for extra in BIND_EXTRA.get(a, []):
				if int(extra) == int(b.code):
					return a
	return ""


## 동작 a 의 입력을 b 로. 다른 동작이 쓰고 있으면 바꾸지 않고 그 동작 이름 (옵션 화면이 경고)
func set_binding(a: String, b: Dictionary) -> String:
	var owner := binding_owner(b, a)
	if owner != "":
		return owner
	bindings[a] = b
	apply_bindings()
	save_settings()
	return ""


static func binding_name(b: Dictionary) -> String:
	if String(b.get("type", "key")) == "mouse":
		match int(b.code):
			MOUSE_BUTTON_LEFT: return "마우스 왼쪽"
			MOUSE_BUTTON_RIGHT: return "마우스 오른쪽"
			MOUSE_BUTTON_MIDDLE: return "마우스 가운데"
		return "마우스 %d" % int(b.code)
	return OS.get_keycode_string(int(b.code) as Key)


func action_key_name(a: String) -> String:
	return binding_name(bindings.get(a, {}))


## 옛 구르기 키 바꾸기 (키 코드)
func set_roll_key(code: int) -> void:
	set_binding("roll", { "type": "key", "code": code })


# ---------------------------------------------------------------- 소리 · 화면
## 버스 볼륨: Master = 전체, Music = 배경음, World · Direct = 효과음
func apply_audio() -> void:
	_bus_vol("Master", vol_master)
	_bus_vol("Music", vol_music)
	_bus_vol("World", vol_sfx)
	_bus_vol("Direct", vol_sfx)


static func _bus_vol(name: String, v: float) -> void:
	var bi := AudioServer.get_bus_index(name)
	if bi >= 0:
		AudioServer.set_bus_volume_db(bi, linear_to_db(maxf(v, 0.0001)))


func set_volume(which: String, v: float) -> void:
	v = clampf(roundf(v * 10.0) / 10.0, 0.0, 1.0)
	match which:
		"master": vol_master = v
		"music": vol_music = v
		"sfx": vol_sfx = v
	apply_audio()


func apply_fullscreen() -> void:
	if DisplayServer.get_name() == "headless":
		return
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if fullscreen else DisplayServer.WINDOW_MODE_WINDOWED)


func set_fullscreen(on: bool) -> void:
	fullscreen = on
	apply_fullscreen()


## 키 이름 (옵션 메뉴 표시)
## 난이도 바꾸기 (옵션 메뉴 ← →). 보스 체력은 다음 재시작부터, 나머지는 바로
func set_difficulty(name: String) -> void:
	Config.set_difficulty(name)
	difficulty = Config.difficulty


func cycle_difficulty(dir: int) -> void:
	var L: Array = Config.DIFFICULTIES
	set_difficulty(L[clampi(L.find(difficulty) + dir, 0, L.size() - 1)])


func difficulty_label() -> String:
	return Config.DIFFICULTY_LABELS.get(difficulty, "NORMAL")


func roll_key_name() -> String:
	return action_key_name("roll")


func on(key: String) -> bool:
	return juice.get(key, true)


func toggle_juice(i: int) -> void:
	var k: String = JUICE[i].key
	juice[k] = not juice[k]


## 전부 켜져 있으면 전부 끄고, 아니면 전부 켬
func toggle_all_juice() -> void:
	var all := true
	for j in JUICE:
		all = all and juice[j.key]
	for j in JUICE:
		juice[j.key] = not all


func set_shake(v: float) -> void:
	shake = roundf(clampf(v, 0.0, 1.5) * 20.0) / 20.0


func load_settings() -> void:
	if not FileAccess.file_exists(PATH):
		_load_old()
		return
	var d = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	if not (d is Dictionary):
		return
	var v := float(d.get("shake", 1.0))
	if v >= 0.0 and v <= 1.5:
		shake = v
	approach = bool(d.get("approach", true))
	difficulty = String(d.get("difficulty", "normal"))
	vol_master = clampf(float(d.get("vol_master", 1.0)), 0.0, 1.0)
	vol_music = clampf(float(d.get("vol_music", 1.0)), 0.0, 1.0)
	vol_sfx = clampf(float(d.get("vol_sfx", 1.0)), 0.0, 1.0)
	fullscreen = bool(d.get("fullscreen", false))
	controls_seen = bool(d.get("controls_seen", false))
	var bd = d.get("bindings", {})
	if bd is Dictionary:
		for a in BIND_ACTIONS:
			if bd.has(a) and bd[a] is Dictionary and bd[a].has("code"):
				bindings[a] = { "type": String(bd[a].get("type", "key")), "code": int(bd[a].code) }


## 옛 settings.cfg (흔들림 · 타이밍 원 · 구르기 키 · 난이도) 를 한 번 옮김
func _load_old() -> void:
	var cf := ConfigFile.new()
	if cf.load(OLD_PATH) != OK:
		return
	var v: float = cf.get_value("options", "shake", 1.0)
	if v >= 0.0 and v <= 1.5:
		shake = v
	approach = bool(cf.get_value("options", "approach", true))
	bindings.roll = { "type": "key", "code": int(cf.get_value("options", "roll_key", KEY_SHIFT)) }
	difficulty = String(cf.get_value("options", "difficulty", "normal"))


## 지금 설정 전부 (저장 · 플레이테스트 기록의 바뀐 값 비교)
func snapshot() -> Dictionary:
	var b := {}
	for a in bindings:
		b[a] = (bindings[a] as Dictionary).duplicate()
	return { "shake": shake, "approach": approach, "difficulty": difficulty,
		"vol_master": vol_master, "vol_music": vol_music, "vol_sfx": vol_sfx, "fullscreen": fullscreen, "bindings": b,
		"controls_seen": controls_seen }


func save_settings() -> void:
	var d := snapshot()
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(d, "\t"))
