extends Node2D
class_name Grenade
## 철견의 수류탄 / 섬광탄 (Config.boss). 월드 시간으로 움직임 (히트스톱 · 슬로우와 같이).
##  grenade  포물선으로 날아가 바닥에 멈춤, 던진 뒤 GRENADE_FUSE 초에 폭발 (반경 GRENADE_RADIUS, 즉사).
##           빨간 불빛이 깜빡임 (빨강 = 쳐낼 수 있음). 착지하면 폭발 범위가 빨간 원으로 보임.
##           플레이어가 베면 되치기 (bat) — 곧게 날아가 철견 근처 · 지형 · 퓨즈 끝에서 폭발
##  flash    섬광탄: FLASH_POP 초 뒤 터지며 화면이 하얗게 (Main.start_whiteout)

signal exploded(g: Grenade)

var kind := "grenade"
var vel := Vector2.ZERO
var age := 0.0
var landed := false
var batted := false
var done := false
var room: Room


## 던지기: from → to 를 flight 초에 지나는 포물선 (중력 GRENADE_GRAVITY)
func launch(from: Vector2, to: Vector2, flight: float) -> void:
	var g: float = Config.boss.GRENADE_GRAVITY
	global_position = from
	vel = Vector2((to.x - from.x) / flight, (to.y - from.y - 0.5 * g * flight * flight) / flight)


## 되치기: dir 방향으로 곧게
func bat(dir: Vector2) -> void:
	batted = true
	landed = false
	vel = dir.normalized() * float(Config.boss.GRENADE_BAT_SPEED)


func fuse_left() -> float:
	var B: Dictionary = Config.boss
	return (B.GRENADE_FUSE if kind == "grenade" else B.FLASH_POP) - age


func _physics_process(delta: float) -> void:
	if done or TimeManager.frozen:
		queue_redraw()
		return
	var B: Dictionary = Config.boss
	age += delta
	if not landed:
		if not batted:
			vel.y += B.GRENADE_GRAVITY * delta
		var next := global_position + vel * delta
		if room != null and room.solid_at(next, not batted and vel.y > 0.0):
			if batted:
				_explode()
				return
			landed = true
			vel = Vector2.ZERO
			# 바닥 윗면에 올려놓음
			var t: float = Config.room.tile
			next.y = floorf(next.y / t) * t - 1.0
		global_position = next
	if batted:
		var b := get_tree().get_first_node_in_group("boss")
		if b != null and not b.dead and global_position.distance_to(b.center()) <= B.GRENADE_HIT_DIST:
			_explode()
			return
	if fuse_left() <= 0.0:
		_explode()
		return
	queue_redraw()


func _explode() -> void:
	if done:
		return
	done = true
	exploded.emit(self)
	queue_free()


func _draw() -> void:
	var B: Dictionary = Config.boss
	var C: Dictionary = Config.colors
	# 착지한 수류탄: 폭발 범위 (빨간 원)
	if kind == "grenade" and landed and not batted:
		var u := clampf(1.0 - fuse_left() / B.GRENADE_FUSE, 0.0, 1.0)
		draw_circle(Vector2.ZERO, B.GRENADE_RADIUS, Color(C.attack, 0.07 + 0.08 * u))
		draw_arc(Vector2.ZERO, B.GRENADE_RADIUS, 0.0, TAU, 64, Color(C.attack, 0.55 + 0.4 * u), 1.0)
	# 몸통
	var body := Color("#3b4152") if kind == "grenade" else Color("#c9cdd6")
	draw_rect(Rect2(-2, -2, 4, 4), body)
	draw_rect(Rect2(-1, -3, 2, 1), Color("#6a718c"))
	# 깜빡이는 불빛: 수류탄 = 빨강 (퓨즈가 줄수록 빨리), 섬광탄 = 흰색
	var left: float = maxf(fuse_left(), 0.0)
	var period := clampf(left * 0.25, 0.05, 0.22)
	if fmod(age, period * 2.0) < period:
		var lc: Color = C.attack if kind == "grenade" else Color.WHITE
		draw_rect(Rect2(-1, -1, 2, 2), lc)
		draw_rect(Rect2(-2, -2, 4, 4).grow(1.0), Color(lc, 0.35))
