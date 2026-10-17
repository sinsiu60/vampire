// 철견 페이즈 3 정전: 화면 전체를 어둡게 덮고, 순간 빛(총구 섬광 등) 둘레만 구멍. 좌표는 월드.
shader_type canvas_item;

uniform float darkness = 0.9;
uniform vec4 lights[8];          // x, y, 반지름, 세기 0~1

varying vec2 world;

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
}

void fragment() {
	float lit = 0.0;
	for (int i = 0; i < 8; i++) {
		vec4 L = lights[i];
		float d = distance(world, L.xy);
		lit = max(lit, L.w * clamp(1.0 - d / max(L.z, 1.0), 0.0, 1.0));
	}
	COLOR = vec4(0.0, 0.004, 0.02, darkness * (1.0 - lit));
}
