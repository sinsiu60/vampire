extends ColorRect
class_name ScreenFX
## 화면 효과 셰이더를 거는 전체 화면 사각형 (CanvasLayer "ScreenFX", 월드 위 · HUD 아래).
## - 채도 감소 · 비네트: 패링 시퀀스 진행도(ParrySeq.fx_amount)를 매 프레임 반영
## - 흰 섬광: flash() → 실제 시간 flash_time 동안 (최소 한 번은 그려짐 — 히트스톱 중에도)
## 효과가 모두 0 이면 숨겨서 화면 복사 비용도 없앰.

@export var seq: ParrySeq

var _flash_left := 0.0
var _flash_shown := false
var _last_us := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE   # 옵션 메뉴·F4 프레임 진행이면 멈춤 (히트스톱은 time_scale 이라 상관없음)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	material = ShaderMaterial.new()
	material.shader = preload("res://shaders/screen_fx.gdshader")
	material.set_shader_parameter("view", Vector2(Config.view.w, Config.view.h))
	_last_us = Time.get_ticks_usec()
	_update()


func flash() -> void:
	_flash_left = Config.fx.flash_time
	_flash_shown = false
	_update()


## 지금 그려질 효과 값 (테스트·디버그용)
func values() -> Dictionary:
	var m := material as ShaderMaterial
	return { "visible": visible, "desat": m.get_shader_parameter("desat"),
		"vignette": m.get_shader_parameter("vignette"), "flash": m.get_shader_parameter("flash") }


func _process(_delta: float) -> void:
	# Engine.time_scale 이 _process delta 에도 걸리므로 실제 경과 시간은 직접 잰다
	var now := Time.get_ticks_usec()
	var real_dt := (now - _last_us) / 1e6
	_last_us = now
	if _flash_left > 0.0 and _flash_shown:
		_flash_left -= real_dt
		if _flash_left < 0.002:      # 프레임 간격이 살짝 짧아도 두 번 그려지지 않게
			_flash_left = 0.0
	_update()
	if _flash_left > 0.0:
		_flash_shown = true


func _update() -> void:
	var P: Dictionary = Config.parry_seq
	var a := seq.fx_amount() if seq != null else 0.0
	var f: float = Config.fx.flash_alpha if _flash_left > 0.0 else 0.0
	var m := material as ShaderMaterial
	m.set_shader_parameter("desat", P.DESATURATE * a)
	m.set_shader_parameter("vignette", P.VIGNETTE * a)
	m.set_shader_parameter("flash", f)
	visible = a > 0.001 or f > 0.0
