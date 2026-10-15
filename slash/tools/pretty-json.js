// data/*.js 를 보기 좋은 JSON 으로 쓰는 도구 (node 로 실행)
// 짧은 객체/배열은 한 줄로, 긴 것은 여러 줄로
function pretty(v, ind) {
  ind = ind || '';
  const one = JSON.stringify(v);
  if (one === undefined) return 'null';
  if (typeof v !== 'object' || v === null || one.length + ind.length <= 110) return one;
  const nx = ind + '  ';
  if (Array.isArray(v)) return '[\n' + v.map((x) => nx + pretty(x, nx)).join(',\n') + '\n' + ind + ']';
  return '{\n' + Object.keys(v).map((k) => nx + JSON.stringify(k) + ': ' + pretty(v[k], nx)).join(',\n') + '\n' + ind + '}';
}
module.exports = { pretty };
