extends Node
## 효과음 (오토로드).
## - sounds/*.wav 10종 + 파일이 없는 소리(휘두르기·사망·클리어)는 시작할 때 합성 (Synth.gd).
## - Godot 오디오는 Engine.time_scale 의 영향을 받지 않음 → 슬로우모션·히트스톱 중에도 실제 시간으로 재생.
## - 페이드도 실제 시간 (Tween.set_ignore_time_scale).

# 오토로드는 프로젝트의 class_name 목록보다 먼저 해석될 수 있어 Synth 를 이름 대신 경로로 불러옴
const SynthLib := preload("res://scripts/audio/Synth.gd")

const FILES := ["gun_fire", "parry_chang", "slowmo_in", "slowmo_loop", "time_return", "kill_sound", "door_open", "door_boss", "boss_intro", "boss_armor"]
# 있으면 쓰고 없으면 조용히 무음 (경고 없음)
const OPTIONAL := ["pistol_whip", "gun_cock", "grenade_pin", "explosion", "flashbang", "stagger", "execute"]
const POOL_SIZE := 16
const WORLD_BUS := "World"       # 효과음 대부분 — 섬광탄 동안 로우패스 (귀가 멍함)

var streams := {}                 # 이름 → AudioStream
var muted := false
var _pool: Array[AudioStreamPlayer] = []


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for n in FILES:
		var path: String = Config.audio.dir + n + ".wav"
		if ResourceLoader.exists(path):
			streams[n] = load(path)
		else:
			push_warning("효과음 파일 없음: " + path)
	for n in OPTIONAL:
		var path: String = Config.audio.dir + n + ".wav"
		if ResourceLoader.exists(path):
			streams[n] = load(path)
	# World 버스 (Master 로 보냄) + 로우패스 (평소엔 꺼짐)
	if AudioServer.get_bus_index(WORLD_BUS) < 0:
		AudioServer.add_bus()
		var bi := AudioServer.bus_count - 1
		AudioServer.set_bus_name(bi, WORLD_BUS)
		AudioServer.set_bus_send(bi, "Master")
		var lp := AudioEffectLowPassFilter.new()
		lp.cutoff_hz = Config.boss.MUFFLE_CUTOFF
		AudioServer.add_bus_effect(bi, lp)
		AudioServer.set_bus_effect_enabled(bi, 0, false)
	streams["swing"] = SynthLib.swing()
	streams["death"] = SynthLib.death()
	streams["clear"] = SynthLib.clear()
	for i in POOL_SIZE:
		var p := AudioStreamPlayer.new()
		p.process_mode = Node.PROCESS_MODE_ALWAYS
		p.bus = WORLD_BUS
		add_child(p)
		_pool.append(p)


## 재생. 반환값 = 재생 중인 플레이어 (fade_out / stop 에 사용). 못 찾으면 null
## clear = 로우패스(멍한 효과)를 거치지 않고 선명하게 (섬광탄 중 장전음)
func play(name: String, volume := 1.0, pitch := 1.0, clear := false) -> AudioStreamPlayer:
	if not streams.has(name) or not Settings.on("sound"):
		return null
	var p := _free_player()
	p.bus = "Master" if clear else WORLD_BUS
	p.stream = streams[name]
	p.volume_db = linear_to_db(maxf(volume, 0.0001))
	p.pitch_scale = pitch
	p.play()
	return p


## 실제 시간 sec 동안 볼륨을 줄인 뒤 정지
func fade_out(p: AudioStreamPlayer, sec: float) -> void:
	if p == null or not p.playing:
		return
	var tw := create_tween()
	tw.set_ignore_time_scale(true)
	tw.tween_property(p, "volume_db", -60.0, sec)
	tw.tween_callback(p.stop)


## 파일의 실제 재생 길이 (초). 없으면 -1
func length(name: String) -> float:
	return streams[name].get_length() if streams.has(name) else -1.0


func toggle_mute() -> void:
	muted = not muted
	AudioServer.set_bus_mute(AudioServer.get_bus_index("Master"), muted)


## 옵션 메뉴: 재생 중인 소리 일시정지 / 이어서
func pause_all(paused: bool) -> void:
	for p in _pool:
		p.stream_paused = paused


func stop_all() -> void:
	set_muffled(false)
	for p in _pool:
		p.stream_paused = false
		p.stop()


# ---- 게임에서 쓰는 소리 (볼륨·피치 규칙은 Config.audio)
## pitch_mul: 철견 사격 0.85 (일반 적보다 묵직하게)
func shot(pitch_mul := 1.0) -> void:
	var A: Dictionary = Config.audio
	play("gun_fire", A.SFX_GUN, randf_range(A.GUN_PITCH.x, A.GUN_PITCH.y) * pitch_mul)

## pitch_mul: 철견 피격 0.8
func kill(pitch_mul := 1.0) -> void:
	var A: Dictionary = Config.audio
	play("kill_sound", A.SFX_KILL, randf_range(A.KILL_PITCH.x, A.KILL_PITCH.y) * pitch_mul)

## 미니 패링(철견 연사 중간 탄): 피치 1.2 · 볼륨 70%
func parry(pitch := 1.0, vol_mul := 1.0) -> void:
	play("parry_chang", Config.audio.SFX_PARRY * vol_mul, pitch)

## 섬광탄: 귀가 멍한 효과 (World 버스 로우패스 켜기/끄기)
func set_muffled(on: bool) -> void:
	var bi := AudioServer.get_bus_index(WORLD_BUS)
	if bi >= 0:
		AudioServer.set_bus_effect_enabled(bi, 0, on)


func is_muffled() -> bool:
	var bi := AudioServer.get_bus_index(WORLD_BUS)
	return bi >= 0 and AudioServer.is_bus_effect_enabled(bi, 0)


## 철견 개편 효과음 (파일이 없으면 무음)
func sfx(name: String, vol_key: String, pitch := 1.0, clear := false) -> void:
	play(name, Config.audio.get(vol_key, 1.0), pitch, clear)


## 철견 등장 카드 · 페이즈 전환 포효 (boss_intro.wav)
func boss_intro(vol_mul := 1.0) -> void:
	play("boss_intro", Config.audio.SFX_BOSS_INTRO * vol_mul)

## 반사탄이 철견 장갑에 튕김 (boss_armor.wav) — 풀 패링 명중은 피치 0.8
func boss_armor(pitch := 1.0) -> void:
	play("boss_armor", Config.audio.SFX_BOSS_ARMOR, pitch)

func swing() -> void:
	play("swing", 1.0, randf_range(0.88, 1.12))   # 프로토타입: 매번 음높이 ±12%

func death() -> void:
	play("death")

func clear() -> void:
	play("clear")

## 출구 문 열림 (sounds/door_open.wav · door_boss.wav — 파일이 없으면 무음)
func door(boss := false) -> AudioStreamPlayer:
	if boss:
		return play("door_boss", Config.audio.SFX_DOOR_BOSS)
	return play("door_open", Config.audio.SFX_DOOR)


func _free_player() -> AudioStreamPlayer:
	for p in _pool:
		if not p.playing and not p.stream_paused:
			return p
	# 다 쓰고 있으면 가장 먼저 만든 것을 끊고 재사용
	var p: AudioStreamPlayer = _pool.pop_front()
	_pool.append(p)
	p.stop()
	return p
