extends Node2D
## 메인: 방·플레이어 배치, 카메라, 전투 판정, 사망·클리어·즉시 재시작.
## 이 노드는 플레이어·적보다 늦게 물리 틱을 받는다 (process_physics_priority) → 모두 움직인 뒤 판정.

@onready var room: Room = $Room
@onready var player: Player = $Player
@onready var camera: Camera2D = $Player/Camera
@onready var state_label: Label = $HUD/State
@onready var fade: ColorRect = $HUD/Fade

var game_state := "play"          # play | dead | clear


func _ready() -> void:
	process_physics_priority = 100
	TimeManager.reset()
	player.global_position = room.spawn_position()
	player.died.connect(_on_player_died)
	var size := room.size_px()
	camera.limit_left = 0
	camera.limit_top = 0
	camera.limit_right = int(size.x)
	camera.limit_bottom = int(size.y)
	# 프로토타입: 프레임당 lerp 0.12 → 초당 스무딩 속도로 환산
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = Config.camera.lerp * Config.fps
	camera.reset_smoothing()
	state_label.text = ""
	# 재시작 직후 짧게 밝아지는 페이드 (실제 시간, 입력은 바로 받음)
	fade.color = Color(0, 0, 0, 1)
	var tw := create_tween()
	tw.set_ignore_time_scale(true)
	tw.tween_property(fade, "color:a", 0.0, Config.restart_fade)


func enemies() -> Array:
	return get_tree().get_nodes_in_group("enemies").filter(func(e): return not e.dead)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("restart"):
		# 방 처음부터 즉시 다시 (씬이 작아 로딩 없이 바로)
		Audio.stop_all()
		get_tree().reload_current_scene()
	elif event.is_action_pressed("mute"):
		Audio.toggle_mute()


func _physics_process(_delta: float) -> void:
	if TimeManager.frozen:
		return
	_resolve_combat()
	if game_state == "play" and enemies().is_empty():
		game_state = "clear"
		Audio.clear()
		state_label.text = "CLEAR\n방의 적을 모두 처치했다 · R 다시 하기"


func _resolve_combat() -> void:
	var p := player
	if p.dead:
		return
	var S: Dictionary = Config.slash
	# 1) 근접 패링: 공격(또는 예고 마지막 순간)에 칼을 맞대면 → 적 즉사
	if p.in_parry_window():
		var reach: float = 1.0 + Config.aim_assist.MELEE_PARRY_RANGE_BONUS
		for e in enemies():
			if e is EnemyMelee and e.parry_vulnerable():
				if p.slash_hits_rect(e.threat_box(), reach) or p.slash_hits_rect(e.body_rect(), reach):
					_parry_melee(e)
	# 2) 칼이 적 몸통에 직접 닿음 → 즉사
	if S.direct_kill and p.is_slashing() and p.slash_t < S.hit_time:
		for e in enemies():
			if p.slash_hits_rect(e.body_rect()):
				p.slash_used = true
				_kill_enemy(e, p.slash_angle)
	# 3) 근접 공격 명중 → 플레이어 즉사
	for e in enemies():
		var box: Rect2 = e.attack_box()
		if box.has_area() and box.intersects(p.body_rect()):
			_kill_player((p.center() - e.center()).angle())
			return


func _parry_melee(e: Enemy) -> void:
	player.slash_used = true
	Audio.parry()
	TimeManager.hitstop(Config.juice.HITSTOP_PARRY_FRAMES)
	_kill_enemy(e, player.slash_angle)


# 처치 (16프레임 킬 연출·조각·피는 6단계)
func _kill_enemy(e: Enemy, angle: float) -> void:
	if e.dead:
		return
	Audio.kill()
	e.die(angle)


func _kill_player(angle: float) -> void:
	player.die(angle)


func _on_player_died() -> void:
	game_state = "dead"
	TimeManager.hitstop(roundi(Config.fx.death_hitstop * Config.fps))
	Audio.death()
	state_label.text = "R  —  재시작"
