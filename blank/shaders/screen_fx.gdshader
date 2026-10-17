shader_type canvas_item;
// 화면 전체 후처리 (월드 위, HUD 아래): 채도 감소 → 비네트 → 흰 섬광.
// 프로토타입 Canvas2D 와 같은 식:
//  - 채도: 'saturation' 합성(회색, 투명도 desat) = 원래 색과 휘도(0.3/0.59/0.11) 회색을 desat 만큼 섞음
//  - 비네트: 중심에서 H×0.35 ~ W×0.62 사이 선형으로 검정 (최대 vignette)
//  - 섬광: flash_color(기본 흰색, 섬광탄 중 패링은 노랑)를 flash 만큼 덮음

uniform sampler2D screen_tex : hint_screen_texture, filter_nearest;
uniform float desat = 0.0;
uniform float vignette = 0.0;
uniform float flash = 0.0;
uniform vec3 flash_color = vec3(1.0);
uniform vec2 view = vec2(480.0, 270.0);

void fragment() {
	vec3 c = texture(screen_tex, SCREEN_UV).rgb;
	float l = dot(c, vec3(0.3, 0.59, 0.11));
	c = mix(c, vec3(l), desat);
	vec2 p = SCREEN_UV * view;
	float d = distance(p, view * 0.5);
	float r0 = view.y * 0.35;
	float r1 = view.x * 0.62;
	c *= 1.0 - vignette * clamp((d - r0) / (r1 - r0), 0.0, 1.0);
	c = mix(c, flash_color, flash);
	COLOR = vec4(c, 1.0);
}
