extends Node
## 디버그 키 (오토로드, 일시정지 중에도 동작).
##  F1 반사 보정 디버그 (스냅 범위 부채꼴 · 선택될 대상)
##  F2 타격감 토글 패널 (1 ~ 0 각 요소, - 전부, Z X C V 소리 미리 듣기)
##  F3 슬로우 10%: 물리 틱 자체를 60 → 6 회/초로 줄이고 time_scale 도 같은 비율로 → 틱당 1/60초 그대로,
##     모든 프레임 단위 연출(히트스톱·킬 스톱·빛줄기·패링 시퀀스)이 같은 비율로 느려짐. 소리는 실제 속도
##  F4 프레임 진행: 게임을 멈추고 F4 를 누를 때마다 정확히 한 틱. Enter 로 해제
##  F5 패링 타이밍 디버그 (조준선 옆 판정 창 바 + 입력 오차 ms)
##  F6 다음 방으로 바로 · F7 지금 방 즉시 클리어 — 디버그 빌드(에디터 실행 · 디버그 내보내기)에서만

signal changed

var aim_debug := false
var juice_panel := false
var slow := false
var step := false
var timing := false
var frame := 0                   ## 처리된 게임 틱 수 (F3/F4 표시용)

var _step_queue := 0
var menu_open := false           ## 옵션 메뉴가 열려 있으면 일시정지 유지 (Menu 가 세팅)


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_physics_priority = -2000


## 디버그 모드 = 디버그 빌드 (에디터에서 실행하거나 디버그로 내보낸 실행 파일). 방 번호 표시 · F6 / F7
func debug_mode() -> bool:
	return OS.is_debug_build()


## TimeManager 가 time_scale 에 곱하는 값
func time_mul() -> float:
	return float(Config.debug.SLOW_SCALE) if slow else 1.0


func _set_slow(on: bool) -> void:
	slow = on
	Engine.physics_ticks_per_second = roundi(Config.fps * time_mul())
	TimeManager.refresh()


func _input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	match event.physical_keycode:
		KEY_F1: aim_debug = not aim_debug
		KEY_F2: juice_panel = not juice_panel
		KEY_F3:
			_set_slow(not slow)
		KEY_F4:
			if not step:
				step = true
				_step_queue = 0
			else:
				_step_queue += 1
		KEY_ENTER, KEY_KP_ENTER:
			if step:
				step = false
				_step_queue = 0
		KEY_F5: timing = not timing
		KEY_F6, KEY_F7:
			var main := get_tree().get_first_node_in_group("game")
			if not debug_mode() or main == null or menu_open:
				return
			if event.physical_keycode == KEY_F6:
				main.debug_next_room()
			else:
				main.debug_clear_room()
		_:
			if juice_panel and not menu_open:
				_juice_key(event.physical_keycode)
			return
	changed.emit()


func _juice_key(code: int) -> void:
	var digits := [KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8, KEY_9, KEY_0]
	var i := digits.find(code)
	if i >= 0 and i < Settings.JUICE.size():
		Settings.toggle_juice(i)
	elif code == KEY_MINUS:
		Settings.toggle_all_juice()
	elif code == KEY_Z: Audio.swing()
	elif code == KEY_X: Audio.kill()
	elif code == KEY_C: Audio.parry()
	elif code == KEY_V: Audio.shot()
	changed.emit()


func _physics_process(_delta: float) -> void:
	var tree := get_tree()
	if step:
		var p: Player = tree.get_first_node_in_group("player")
		# 멈춘 동안 누른 클릭/점프는 다음에 진행하는 틱에서 처리
		if p != null and not menu_open:
			if Input.is_action_just_pressed("slash"):
				p.queue_slash()
			if Input.is_action_just_pressed("jump"):
				p.queue_jump()
		if _step_queue > 0 and not menu_open:
			_step_queue -= 1
			tree.paused = false        # 이번 틱만 진행 (이 노드가 가장 먼저 틱을 받음)
		else:
			tree.paused = true
	else:
		tree.paused = menu_open
	if not tree.paused:
		frame += 1
