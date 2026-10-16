class_name Synth
## 파일이 없는 효과음을 시작할 때 PCM 으로 합성해 AudioStreamWAV 로 만든다.
## 웹 프로토타입의 Web Audio 합성(잡음 + 필터 스윕 + 지수 감쇠 엔벨로프)을 그대로 옮김.

const RATE := 44100
const MASTER := 0.7              # 프로토타입 합성음 마스터 볼륨 (Config.audio 에는 없음 → 여기)


## 휘두르기: 짧은 바람 소리 '쉭' — 대역 통과 잡음이 650 → 2900 → 850Hz 로 휩쓸림
static func swing() -> AudioStreamWAV:
	var dur := 0.16
	var buf := PackedFloat32Array()
	buf.resize(int(dur * RATE))
	_noise_layer(buf, "band", [650.0, 2900.0, 850.0], 1.3, dur, 0.9, dur * 0.25)
	_noise_layer(buf, "high", [7000.0, 3800.0], 0.7, dur * 0.7, 0.27, dur * 0.15)
	return _to_wav(buf)


## 플레이어 사망: 낮게 떨어지는 잡음 + 톱니파
static func death() -> AudioStreamWAV:
	var dur := 0.4
	var buf := PackedFloat32Array()
	buf.resize(int(dur * RATE))
	_noise_layer(buf, "low", [1200.0, 60.0], 1.0, dur, 0.7, 0.001)
	_osc_layer(buf, "saw", 200.0, 40.0, dur, 0.18, 0.001, 0.0)
	return _to_wav(buf)


## 방 클리어: 도·미·솔·도 삼각파 아르페지오
static func clear() -> AudioStreamWAV:
	var notes := [523.0, 659.0, 784.0, 1046.0]
	var buf := PackedFloat32Array()
	buf.resize(int((0.25 + 0.08 * 3) * RATE))
	for i in notes.size():
		_osc_layer(buf, "tri", notes[i], notes[i], 0.25, 0.15, 0.005, i * 0.08)
	return _to_wav(buf)


# ---------------------------------------------------------------- 내부
# 엔벨로프: 0 → (attack) vol → (지수 감쇠) 0.0001 @ dur
static func _env(t: float, vol: float, attack: float, dur: float) -> float:
	if t < attack:
		return lerpf(0.0001, vol, t / attack)
	var u := clampf((t - attack) / maxf(dur - attack, 1e-4), 0.0, 1.0)
	return vol * pow(0.0001 / vol, u)


# 필터 주파수 스윕: 점들 사이를 지수로 (Web Audio exponentialRampToValueAtTime 과 같게)
static func _sweep(points: Array, t: float, dur: float) -> float:
	var n := points.size() - 1
	if n <= 0:
		return points[0]
	var x := clampf(t / dur, 0.0, 1.0) * n
	var i := mini(int(x), n - 1)
	return points[i] * pow(points[i + 1] / points[i], x - i)


static func _noise_layer(buf: PackedFloat32Array, kind: String, sweep: Array, q: float,
		dur: float, vol: float, attack: float) -> void:
	var n := mini(int(dur * RATE), buf.size())
	var x1 := 0.0; var x2 := 0.0; var y1 := 0.0; var y2 := 0.0
	var b0 := 0.0; var b1 := 0.0; var b2 := 0.0; var a1 := 0.0; var a2 := 0.0
	for i in n:
		var t := float(i) / RATE
		if i % 32 == 0:
			# RBJ biquad 계수 (32 샘플마다 주파수 갱신)
			var w0 := TAU * minf(_sweep(sweep, t, dur), RATE * 0.45) / RATE
			var alpha := sin(w0) / (2.0 * q)
			var c := cos(w0)
			var a0 := 1.0 + alpha
			match kind:
				"band":
					b0 = alpha; b1 = 0.0; b2 = -alpha
				"high":
					b0 = (1.0 + c) / 2.0; b1 = -(1.0 + c); b2 = (1.0 + c) / 2.0
				_:
					b0 = (1.0 - c) / 2.0; b1 = 1.0 - c; b2 = (1.0 - c) / 2.0
			b0 /= a0; b1 /= a0; b2 /= a0
			a1 = -2.0 * c / a0
			a2 = (1.0 - alpha) / a0
		var x := randf() * 2.0 - 1.0
		var y := b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
		x2 = x1; x1 = x; y2 = y1; y1 = y
		buf[i] += y * _env(t, vol, attack, dur)


static func _osc_layer(buf: PackedFloat32Array, kind: String, f0: float, f1: float,
		dur: float, vol: float, attack: float, delay: float) -> void:
	var start := int(delay * RATE)
	var n := mini(int(dur * RATE), buf.size() - start)
	var phase := 0.0
	for i in n:
		var t := float(i) / RATE
		var f := f0 * pow(f1 / f0, t / dur)
		phase = fmod(phase + f / RATE, 1.0)
		var s: float
		match kind:
			"saw": s = phase * 2.0 - 1.0
			"tri": s = 1.0 - 4.0 * absf(phase - 0.5)
			"square": s = 1.0 if phase < 0.5 else -1.0
			_: s = sin(phase * TAU)
		buf[start + i] += s * _env(t, vol, attack, dur)


static func _to_wav(buf: PackedFloat32Array) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(buf.size() * 2)
	for i in buf.size():
		bytes.encode_s16(i * 2, int(clampf(buf[i] * MASTER, -1.0, 1.0) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = bytes
	return w
