// 철견 페이즈 3 정전: 화면 전체를 어둡게 덮고 (가장자리는 비네트로 더), 순간 빛 둘레만 구멍. 좌표는 월드.
// lights[i] = (x, y, 반지름, 세기) — 세기가 1 보다 크면 따뜻한 빛 (총구 섬광: 세기 = 값 - 1, 둘레를 warm 색으로 살짝 덧칠)
shader_type canvas_item;

uniform float darkness = 0.62;
uniform float vignette = 0.0;
uniform vec4 warm : source_color = vec4(1.0, 0.72, 0.42, 0.22);
uniform vec4 lights[8];

varying vec2 world;

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
}

void fragment() {
	float lit = 0.0;
	float hot = 0.0;
	for (int i = 0; i < 8; i++) {
		vec4 L = lights[i];
		bool is_warm = L.w > 1.0;
		float w = is_warm ? L.w - 1.0 : L.w;
		float d = distance(world, L.xy);
		float k = w * clamp(1.0 - d / max(L.z, 1.0), 0.0, 1.0);
		lit = max(lit, k);
		if (is_warm) {
			hot = max(hot, k);
		}
	}
	vec2 v = (SCREEN_UV - 0.5) * vec2(1.0, 0.78);
	float edge = smoothstep(0.25, 0.62, length(v));
	float a = clamp(darkness * (1.0 - lit) + vignette * edge * (1.0 - lit * 0.7), 0.0, 1.0);
	vec3 dark = vec3(0.0, 0.004, 0.02);
	vec3 col = mix(dark, warm.rgb, hot);
	COLOR = vec4(col, max(a, warm.a * hot));
}
