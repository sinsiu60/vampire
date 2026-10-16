extends Node2D
class_name Room
## 방 하나 = 씬 하나 (rooms/ch1/room_01.tscn …). 에디터에서 그대로 고칠 수 있게:
##  Terrain     TileMapLayer — 타일: (0,0) 지형 윗면, (1,0) 지형 속, (2,0) 일방향 발판 (tiles/terrain.tres)
##  PlayerSpawn Marker2D — 시작 위치 (발)
##  Entrance / Exit  Door — 입구 / 출구 문 (출구는 적을 모두 처치하면 열림). 없으면 옛 방식(CLEAR 글자)
##  Enemies     Node2D — 아래에 EnemyMelee / EnemyGunner 인스턴스를 놓으면 됨
## 방 크기는 Terrain 에 칠한 칸 범위로 정해짐 (카메라 한계·자국 이미지·배경 폭).

@export var room_title := ""     ## 방 설명 (디버그 표시용, 예: "기본 베기 연습")

@onready var terrain: TileMapLayer = $Terrain


func spawn_position() -> Vector2:
	return $PlayerSpawn.global_position


## 방 크기 (px) — 칠한 타일의 오른쪽·아래 끝 (왼쪽·위는 0 부터)
func size_px() -> Vector2:
	var r := terrain.get_used_rect()
	var t: float = Config.room.tile
	return Vector2(maxi(r.end.x, ceili(Config.view.w / t)), maxi(r.end.y, ceili(Config.view.h / t))) * t


func exit_door() -> Door:
	return get_node_or_null("Exit") as Door


func entrance_door() -> Door:
	return get_node_or_null("Entrance") as Door


# ---------------------------------------------------------------- 연출용 간단한 지형 판정 (조각·핏방울·빛줄기 흙먼지)
const PLATFORM_TILE := Vector2i(2, 0)
const PLATFORM_H := 6.0          # 일방향 발판 충돌 높이 (tiles/terrain.tres 의 폴리곤과 같음)


## 칸 하나: 0 = 빈칸, 1 = 지형, 2 = 일방향 발판
func cell_kind(c: Vector2i) -> int:
	if terrain.get_cell_source_id(c) == -1:
		return 0
	return 2 if terrain.get_cell_atlas_coords(c) == PLATFORM_TILE else 1


func _cell_rect(c: Vector2i, kind: int) -> Rect2:
	var t: float = Config.room.tile
	return Rect2(Vector2(c) * t, Vector2(t, PLATFORM_H if kind == 2 else t))


## 점이 지형(발판 포함 여부 선택) 안에 있는가
func solid_at(p: Vector2, include_one_way := true) -> bool:
	var t: float = Config.room.tile
	var c := Vector2i(floori(p.x / t), floori(p.y / t))
	var k := cell_kind(c)
	if k == 0 or (k == 2 and not include_one_way):
		return false
	return _cell_rect(c, k).has_point(p)


func _overlaps(b: Rect2, one_way: bool) -> Array:
	var t: float = Config.room.tile
	var out := []
	for cy in range(floori(b.position.y / t), floori((b.end.y - 0.001) / t) + 1):
		for cx in range(floori(b.position.x / t), floori((b.end.x - 0.001) / t) + 1):
			var c := Vector2i(cx, cy)
			var k := cell_kind(c)
			if k == 0 or (k == 2) != one_way:
				continue
			var r := _cell_rect(c, k)
			if r.intersects(b):
				out.append(r)
	return out


## 상자 b 를 v×dt 만큼 지형과 부딪히며 이동 (프로토타입 moveBody: 4px 단위로 쪼개서 x → y)
## 반환 { rect, vel, hit_wall, on_ground }
func move_box(b: Rect2, v: Vector2, dt: float) -> Dictionary:
	var hit_wall := 0
	var on_ground := false
	var mx := v.x * dt
	var nx := maxi(1, ceili(absf(mx) / 4.0))
	for i in nx:
		b.position.x += mx / nx
		for s in _overlaps(b, false):
			if mx > 0.0:
				b.position.x = s.position.x - b.size.x
				hit_wall = 1
			else:
				b.position.x = s.end.x
				hit_wall = -1
			v.x = 0.0
			mx = 0.0
	var my := v.y * dt
	var ny := maxi(1, ceili(absf(my) / 4.0))
	for i in ny:
		var prev_bottom := b.end.y
		b.position.y += my / ny
		for s in _overlaps(b, false):
			if my > 0.0:
				b.position.y = s.position.y - b.size.y
				on_ground = true
			elif my < 0.0:
				b.position.y = s.end.y
			v.y = 0.0
			my = 0.0
		for s in _overlaps(b, true):
			# 일방향 발판: 위에서 내려올 때만 착지
			if my > 0.0 and prev_bottom <= s.position.y + 0.5:
				b.position.y = s.position.y - b.size.y
				v.y = 0.0
				on_ground = true
				my = 0.0
	return { "rect": b, "vel": v, "hit_wall": hit_wall, "on_ground": on_ground }


## 선분 위에서 지형 윗면(빈칸 → 지형/발판으로 위에서 들어가는 곳)과 만나는 지점들 { t (시작점에서 거리), pos }
func surface_hits(origin: Vector2, dir: Vector2, length: float) -> Array:
	var out := []
	if absf(dir.y) <= 0.05:
		return out
	var t: float = Config.room.tile
	var prev := Vector2i(floori(origin.x / t), floori(origin.y / t))
	var d := 1.0
	while d <= length:
		var p := origin + dir * d
		var c := Vector2i(floori(p.x / t), floori(p.y / t))
		if c != prev:
			if c.y == prev.y + 1 and cell_kind(c) != 0 and cell_kind(c - Vector2i(0, 1)) == 0:
				var top := c.y * t
				var dd := (top - origin.y) / dir.y
				out.append({ "t": dd, "pos": Vector2(origin.x + dir.x * dd, top) })
			prev = c
		d += 1.0
	return out
