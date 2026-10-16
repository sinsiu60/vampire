shader_type canvas_item;
// 은은한 스캔라인 (창 해상도에서): 확대된 게임 픽셀 한 줄마다 아래쪽 1/3 을 살짝 어둡게.
// 프로토타입과 같은 패턴: 높이 max(2, scale) 마다 아래 max(1, floor(scale/3)) 줄을 alpha 만큼 검게.

uniform float scale = 4.0;
uniform float alpha = 0.2;
uniform vec2 size = vec2(1920.0, 1080.0);

void fragment() {
	float period = max(2.0, scale);
	float th = max(1.0, floor(scale / 3.0));
	float row = mod(floor(UV.y * size.y), period);
	COLOR = vec4(0.0, 0.0, 0.0, row >= period - th ? alpha : 0.0);
}
