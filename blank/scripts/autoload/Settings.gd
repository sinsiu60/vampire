extends Node
## 옵션 (오토로드). ESC 메뉴에서 바꾸고 user://settings.cfg 에 저장 — 못 쓰는 환경이면 기본값으로.
##  - shake: 화면 흔들림 강도 배율 0 ~ 1.5 (5% 단위)
##  - approach: 발사 타이밍 원 표시 (끄면 숙련자용 하드 모드)
## 타격감 토글(F2, 저장 안 함)도 여기: juice[key] = true/false

const PATH := "user://settings.cfg"

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
]

var shake := 1.0
var approach := true
var roll_key := KEY_SHIFT        ## 구르기 키 (물리 키 코드) — 옵션 메뉴에서 바꿈
var juice := {}


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for j in JUICE:
		juice[j.key] = true
	load_settings()
	apply_roll_key()


## 구르기 키를 입력 "roll" 에 반영 (project.godot 의 기본값 Shift 를 덮어씀)
func apply_roll_key() -> void:
	if not InputMap.has_action("roll"):
		InputMap.add_action("roll")
	InputMap.action_erase_events("roll")
	var ev := InputEventKey.new()
	ev.physical_keycode = roll_key as Key
	InputMap.action_add_event("roll", ev)


func set_roll_key(code: int) -> void:
	roll_key = code
	apply_roll_key()


## 키 이름 (옵션 메뉴 표시)
func roll_key_name() -> String:
	return OS.get_keycode_string(roll_key as Key)


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
	var cf := ConfigFile.new()
	if cf.load(PATH) != OK:
		return
	var v: float = cf.get_value("options", "shake", 1.0)
	if v >= 0.0 and v <= 1.5:
		shake = v
	approach = bool(cf.get_value("options", "approach", true))
	roll_key = int(cf.get_value("options", "roll_key", KEY_SHIFT))


func save_settings() -> void:
	var cf := ConfigFile.new()
	cf.set_value("options", "shake", shake)
	cf.set_value("options", "approach", approach)
	cf.set_value("options", "roll_key", roll_key)
	cf.save(PATH)
