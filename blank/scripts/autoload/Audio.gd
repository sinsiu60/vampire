extends Node
## 효과음 (오토로드).
## - sounds/*.wav 19종 + 파일이 없는 소리(휘두르기·사망·클리어)는 시작할 때 합성 (Synth.gd).
## - play_synced: 소리의 '가장 큰 소리 위치'(PEAKS)가 정확히 타격 순간(월드 시각)에 오도록 미리 재생.
## - play_loop: 이음새 없는 반복 재생 (보스방 빗소리) — 풀과 따로, 볼륨 페이드.
## - Godot 오디오는 Engine.time_scale 의 영향을 받지 않음 → 슬로우모션·히트스톱 중에도 실제 시간으로 재생.
## - 페이드도 실제 시간 (Tween.set_ignore_time_scale).

# 오토로드는 프로젝트의 class_name 목록보다 먼저 해석될 수 있어 Synth 를 이름 대신 경로로 불러옴
const SynthLib := preload("res://scripts/audio/Synth.gd")

const FILES := ["gun_fire", "parry_chang", "slowmo_in", "slowmo_loop", "time_return", "kill_sound", "door_open", "door_boss", "boss_intro", "boss_armor",
	"gun_cock", "quickdraw", "pistol_whip", "execute", "stagger", "explosion", "flashbang", "thunder", "rain_loop"]
# 있으면 쓰고 없으면 조용히 무음 (경고 없음)
const OPTIONAL := ["dash_whoosh", "slide", "jump", "grenade_pin"]
## 파일 안에서 가장 큰 소리 위치 (초) — play_synced 가 이만큼 일찍 재생해 타격 순간에 맞춤
const PEAKS := {
	"gun_cock": 0.07, "quickdraw": 0.22, "pistol_whip": 0.12, "execute": 0.0, "stagger": 0.0,
	"explosion": 0.0, "flashbang": 0.0, "thunder": 0.17,
	"gun_fire": 0.0, "parry_chang": 0.0, "boss_armor": 0.0, "kill_sound": 0.0,
}
## 소리 이름 → 기본 볼륨 키 (Config.audio) — sfx / play_synced 에서 볼륨을 안 주면 이것
const VOLUME_KEYS := {
	"gun_cock": "SFX_GUN_COCK", "quickdraw": "SFX_QUICKDRAW", "pistol_whip": "SFX_WHIP", "execute": "SFX_EXECUTE",
	"stagger": "SFX_STAGGER", "explosion": "SFX_EXPLOSION", "flashbang": "SFX_FLASHBANG", "thunder": "SFX_THUNDER",
	"rain_loop": "SFX_RAIN", "gun_fire": "SFX_GUN", "parry_chang": "SFX_PARRY", "boss_armor": "SFX_BOSS_ARMOR",
	"boss_intro": "SFX_BOSS_INTRO", "kill_sound": "SFX_KILL", "dash_whoosh": "SFX_DASH", "slide": "SFX_SLIDE", "jump": "SFX_JUMP",
}
const POOL_SIZE := 16
const WORLD_BUS := "World"       # 효과음 대부분 — 섬광탄 동안 로우패스 (귀가 멍함)

var streams := {}                 # 이름 → AudioStream
var muted := false
var _pool: Array[AudioStreamPlayer] = []
var _synced: Array = []           # 예약된 play_synced { name, impact, volume, pitch, clear, cancelled }
var _loops: Array[AudioStreamPlayer] = []
var _ambience: AudioStreamPlayer = null   # 방 배경음 (재시작 · stop_all 에도 계속 — 다른 방으로 가면 바뀜)
var _ambience_name := ""


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
		lp.cutoff_hz = Config.audio.MUFFLE_CUTOFF
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
## from = 재생 시작 위치 (초)
func play(name: String, volume := 1.0, pitch := 1.0, clear := false, from := 0.0) -> AudioStreamPlayer:
	if not streams.has(name) or not Settings.on("sound"):
		return null
	var p := _free_player()
	p.bus = "Master" if clear else WORLD_BUS
	p.stream = streams[name]
	p.volume_db = linear_to_db(maxf(volume, 0.0001))
	p.pitch_scale = pitch
	p.play(from)
	return p


## 이 소리의 기본 볼륨 (Config.audio 의 VOLUME_KEYS 항목, 없으면 1)
func volume_of(name: String) -> float:
	return float(Config.audio.get(VOLUME_KEYS.get(name, ""), 1.0))


## 타격 지점 맞춰 재생: 소리의 가장 큰 소리 위치(PEAKS)가 월드 시각 impact_time 에 오도록 그만큼 일찍 재생.
##  - 예: pistol_whip 은 내려치는 순간 0.12초 전, quickdraw 는 발사 0.22초 전에 시작
##  - 소리는 실제 시간으로 재생되므로, 남은 월드 시간을 지금 시간 속도로 나눠 '실제로 남은 시간'으로 비교
##    (슬로우 중이면 그만큼 늦게 시작, 히트스톱 중이면 기다림). 이미 늦었으면 앞부분을 건너뛰고 재생
##  - volume < 0 이면 기본 볼륨 (VOLUME_KEYS). 반환값 = 예약 (cancel_synced 로 취소)
func play_synced(name: String, impact_time: float, volume := -1.0, pitch := 1.0, clear := false) -> Dictionary:
	var job := { "name": name, "impact": impact_time, "volume": volume_of(name) if volume < 0.0 else volume,
		"pitch": pitch, "clear": clear, "cancelled": false, "player": null }
	if not streams.has(name):
		return job
	if not _try_start(job):
		_synced.append(job)
	return job


func cancel_synced(job: Dictionary) -> void:
	if job.is_empty():
		return
	job.cancelled = true
	var p: AudioStreamPlayer = job.get("player")
	if p != null and p.playing and p.stream == streams.get(job.name):
		p.stop()


## 피크까지 실제로 남은 시간이 피크 위치 이하가 되면 시작 (늦은 만큼 건너뜀). 시작했거나 버렸으면 true
func _try_start(job: Dictionary) -> bool:
	if job.cancelled:
		return true
	var rate := Engine.time_scale if not get_tree().paused else 0.0
	var lead: float = float(PEAKS.get(job.name, 0.0)) / maxf(job.pitch, 0.01)
	var left: float = job.impact - TimeManager.world_time
	if left > 0.0 and rate <= 0.0:
		return false                        # 히트스톱 · 일시정지: 월드가 다시 흐를 때까지
	var left_real: float = left / rate if left > 0.0 else left
	if left_real > lead:
		return false
	var from: float = (lead - left_real) * job.pitch
	if from >= length(job.name):
		return true
	job.player = play(job.name, job.volume, job.pitch, job.clear, maxf(from, 0.0))
	return true


func _physics_process(_delta: float) -> void:
	if _synced.is_empty():
		return
	_synced = _synced.filter(func(j): return not _try_start(j))


## 이음새 없는 반복 재생 (rain_loop 등). volume < 0 = 기본 볼륨. fade = 실제 시간 페이드인 (초)
func play_loop(name: String, volume := -1.0, fade := 0.0) -> AudioStreamPlayer:
	if not streams.has(name):
		return null
	var src: AudioStream = streams[name]
	var st: AudioStream = src
	if src is AudioStreamWAV:
		var w := (src as AudioStreamWAV).duplicate() as AudioStreamWAV
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_begin = 0
		w.loop_end = roundi(src.get_length() * w.mix_rate)
		st = w
	var p := AudioStreamPlayer.new()
	p.process_mode = Node.PROCESS_MODE_ALWAYS
	p.bus = WORLD_BUS
	p.stream = st
	add_child(p)
	_loops.append(p)
	var v := volume_of(name) if volume < 0.0 else volume
	p.set_meta("volume", v)
	p.volume_db = linear_to_db(0.0001 if fade > 0.0 else maxf(v, 0.0001))
	if Settings.on("sound"):
		p.play()
	if fade > 0.0:
		set_loop_volume(p, v, fade)
	return p


## 방 배경음: 이름이 같으면 이어서 (볼륨만 맞춤), 다르면 바꿈, "" 이면 페이드아웃해서 멈춤
## volume < 0 = 기본 볼륨 (VOLUME_KEYS). 재시작(stop_all)에도 끊기지 않음
func set_ambience(name: String, volume := -1.0, fade := 0.6) -> void:
	var v := volume_of(name) if volume < 0.0 else volume
	if name == _ambience_name and _ambience != null and is_instance_valid(_ambience):
		set_loop_volume(_ambience, v, 0.3)
		return
	if _ambience != null and is_instance_valid(_ambience):
		_loops.append(_ambience)
		stop_loop(_ambience, 0.3)
	_ambience = null
	_ambience_name = name
	if name == "":
		return
	_ambience = play_loop(name, v, fade)
	_loops.erase(_ambience)


func ambience_player() -> AudioStreamPlayer:
	return _ambience


## 반복 소리 볼륨 바꾸기 (실제 시간 sec 동안)
func set_loop_volume(p: AudioStreamPlayer, volume: float, sec := 0.0) -> void:
	if p == null or not is_instance_valid(p):
		return
	p.set_meta("volume", volume)
	var db := linear_to_db(maxf(volume, 0.0001))
	if sec <= 0.0:
		p.volume_db = db
		return
	var tw := create_tween()
	tw.set_ignore_time_scale(true)
	tw.tween_property(p, "volume_db", db, sec)


## 반복 소리 멈추고 지움 (sec 동안 페이드아웃)
func stop_loop(p: AudioStreamPlayer, sec := 0.0) -> void:
	if p == null or not is_instance_valid(p):
		return
	_loops.erase(p)
	if sec <= 0.0:
		p.queue_free()
		return
	var tw := create_tween()
	tw.set_ignore_time_scale(true)
	tw.tween_property(p, "volume_db", -60.0, sec)
	tw.tween_callback(p.queue_free)


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
	for p in _loops:
		p.stream_paused = paused
	if _ambience != null and is_instance_valid(_ambience):
		_ambience.stream_paused = paused


func stop_all() -> void:
	set_muffled(false)
	_synced.clear()
	for p in _pool:
		p.stream_paused = false
		p.stop()
	for p in _loops:
		p.queue_free()
	_loops.clear()


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
## vol_key = "" 이면 그 소리의 기본 볼륨 (VOLUME_KEYS)
func sfx(name: String, vol_key := "", pitch := 1.0, clear := false) -> AudioStreamPlayer:
	return play(name, volume_of(name) if vol_key == "" else float(Config.audio.get(vol_key, 1.0)), pitch, clear)


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
