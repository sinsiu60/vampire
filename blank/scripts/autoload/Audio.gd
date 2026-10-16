extends Node
## 효과음 (오토로드).
## - sounds/*.wav 6종 + 파일이 없는 소리(휘두르기·사망·클리어)는 시작할 때 합성 (Synth.gd).
## - Godot 오디오는 Engine.time_scale 의 영향을 받지 않음 → 슬로우모션·히트스톱 중에도 실제 시간으로 재생.
## - 페이드도 실제 시간 (Tween.set_ignore_time_scale).

const FILES := ["gun_fire", "parry_chang", "slowmo_in", "slowmo_loop", "time_return", "kill_sound"]
const POOL_SIZE := 16

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
	streams["swing"] = Synth.swing()
	streams["death"] = Synth.death()
	streams["clear"] = Synth.clear()
	streams["door"] = Synth.door()
	for i in POOL_SIZE:
		var p := AudioStreamPlayer.new()
		p.process_mode = Node.PROCESS_MODE_ALWAYS
		add_child(p)
		_pool.append(p)


## 재생. 반환값 = 재생 중인 플레이어 (fade_out / stop 에 사용). 못 찾으면 null
func play(name: String, volume := 1.0, pitch := 1.0) -> AudioStreamPlayer:
	if not streams.has(name) or not Settings.on("sound"):
		return null
	var p := _free_player()
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
	for p in _pool:
		p.stream_paused = false
		p.stop()


# ---- 게임에서 쓰는 소리 (볼륨·피치 규칙은 Config.audio)
func shot() -> void:
	var A: Dictionary = Config.audio
	play("gun_fire", A.SFX_GUN, randf_range(A.GUN_PITCH.x, A.GUN_PITCH.y))

func kill() -> void:
	var A: Dictionary = Config.audio
	play("kill_sound", A.SFX_KILL, randf_range(A.KILL_PITCH.x, A.KILL_PITCH.y))

func parry() -> void:
	play("parry_chang", Config.audio.SFX_PARRY)

func swing() -> void:
	play("swing", 1.0, randf_range(0.88, 1.12))   # 프로토타입: 매번 음높이 ±12%

func death() -> void:
	play("death")

func clear() -> void:
	play("clear")

func door() -> void:
	play("door", Config.audio.SFX_DOOR)


func _free_player() -> AudioStreamPlayer:
	for p in _pool:
		if not p.playing and not p.stream_paused:
			return p
	# 다 쓰고 있으면 가장 먼저 만든 것을 끊고 재사용
	var p: AudioStreamPlayer = _pool.pop_front()
	_pool.append(p)
	p.stop()
	return p
