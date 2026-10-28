#!/usr/bin/env python3
"""공백(BLANK) 플레이테스트 기록 모아 보기 — 여러 사람의 user://playtest 폴더 (csv · summary) 를 한꺼번에.

  python3 tools/analyze_playtest.py <폴더 또는 csv 파일> [...] > report.md

친구들이 보낸 playtest 폴더를 한 폴더에 모아 (하위 폴더도 읽음) 넣으면, 구간별로
  들어간 횟수 · 사망 · 시도당 사망 · 걸린 시간 · 그만둔 곳 · 많이 죽인 공격 · 패링 성공률 을 표로 내고,
눈에 띄는 곳 (사망이 몰린 구간 · 오래 걸린 구간 · 많이 그만둔 곳 · 패링 경향) 을 맨 위에 짚어 줌.
표준 라이브러리만 씀.
"""
import csv
import os
import statistics
import sys
from collections import Counter, defaultdict

# 1장 구간 이름 — 기록의 segment_id 열 (구간 씬 id, rooms/ch1/level_01.tscn 순서). 옛 기록 ("room" 열 — "1-1.N" 체크포인트 구간) 도 읽음
SEGMENT_ORDER = ["market_1", "market_2", "market_3", "market_4", "alley_a", "market_5", "gate_1", "rest_a",
                 "climb", "roof_a", "roof_b", "descent", "alley_b", "rest_b", "gate_2", "boss"]
ZONE_NAMES = {
    "market_1": "시장 입구 1 (근접)", "market_2": "시장 입구 2 (총잡이)", "market_3": "시장 입구 3 (연사병 · 돌격병)",
    "market_4": "시장 입구 4 (척탄병)", "alley_a": "골목 조합 A", "market_5": "종합 (방 5)", "gate_1": "관문 1",
    "rest_a": "쉬어가는 길 A", "climb": "비상계단", "roof_a": "옥상 A", "roof_b": "옥상 B", "descent": "내려가기",
    "alley_b": "골목 조합 B", "rest_b": "쉬어가는 길 B", "gate_2": "관문 2", "boss": "철견 (보스방)",
    # 옛 기록 (체크포인트 구간)
    "1-1.1": "시장 입구 1 (근접)", "1-1.2": "시장 입구 2 (총잡이)", "1-1.3": "시장 입구 3 (연사병 · 돌격병)",
    "1-1.4": "시장 입구 4 (척탄병)", "1-1.5": "골목 조합 A", "1-1.6": "종합 (방 5)", "1-1.7": "관문 1",
    "1-1.8": "쉬어가는 길 A", "1-1.9": "비상계단", "1-1.10": "옥상 A", "1-1.11": "옥상 B", "1-1.12": "내려가기",
    "1-1.13": "골목 조합 B · 쉬어가는 길 B", "1-1.14": "관문 2", "1-2": "철견 (보스방)",
}


def zone_order(k):
    if k in SEGMENT_ORDER:
        return SEGMENT_ORDER.index(k)
    try:
        ch, rest = k.split("-")
        parts = rest.split(".")
        return 1000 + int(ch) * 10000 + int(parts[0]) * 100 + (int(parts[1]) if len(parts) > 1 else 0)
    except ValueError:
        return 999999


def parse_detail(s):
    out = {}
    for part in s.split("; "):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def find_csvs(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            for root, _, names in os.walk(p):
                files += [os.path.join(root, n) for n in names if n.endswith(".csv")]
        elif p.endswith(".csv"):
            files.append(p)
    return sorted(files)


def load(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                r["t"] = float(r.get("time", 0) or 0)
                r["play"] = float(r.get("play_time", 0) or 0)
            except ValueError:
                continue
            r["d"] = parse_detail(r.get("detail", "") or "")
            rows.append(r)
    return rows


def name(z):
    return ZONE_NAMES.get(z, z)


def main(argv):
    files = find_csvs(argv[1:] or ["."])
    if not files:
        print("csv 파일이 없습니다. 사용법: python3 tools/analyze_playtest.py <폴더>")
        return 1
    zones = defaultdict(lambda: {"enter": 0, "players": set(), "deaths": 0, "times": [], "killers": Counter(),
                                 "ok": 0, "fail": 0, "quit": 0})
    sessions = 0
    cleared = 0
    play_total = []
    boss_phase = Counter()
    boss_pattern = Counter()
    errs = []
    by_type = defaultdict(lambda: [0, 0])
    rolls = [0, 0]
    feedback = defaultdict(Counter)
    comments = []
    difficulty = Counter()
    death_spots = Counter()           # (구간, x 64px 칸) → 사망 수 — 새 기록 (death 의 x · y)
    for fpath in files:
        rows = load(fpath)
        if not rows:
            continue
        sessions += 1
        sid = os.path.basename(fpath)
        last_zone = None
        did_clear = False
        last_fail = None
        for r in rows:
            ev, z, d = r.get("event", ""), r.get("segment_id") or r.get("room", "-"), r["d"]
            if ev == "session_start":
                difficulty[d.get("difficulty", "?")] += 1
            elif ev == "room_enter" and z not in ("-", "practice"):
                zones[z]["enter"] += 1
                zones[z]["players"].add(sid)
                last_zone = z
            elif ev == "room_clear":
                try:
                    zones[z]["times"].append(float(d.get("room_time", 0)))
                except ValueError:
                    pass
            elif ev == "death":
                zones[z]["deaths"] += 1
                if "x" in d:
                    try:
                        death_spots[(z, int(float(d["x"])) // 64 * 64)] += 1
                    except ValueError:
                        pass
                zones[z]["killers"]["%s · %s (%s)" % (d.get("enemy", "?"), d.get("attack", "?"), d.get("type", "?"))] += 1
                if "phase" in d:
                    boss_phase[d["phase"]] += 1
                    boss_pattern[d.get("pattern", "?")] += 1
            elif ev == "parry_success":
                zones[z]["ok"] += 1
                by_type[d.get("type", "?")][0] += 1
                if "err_ms" in d:
                    errs.append(int(float(d["err_ms"])))
            elif ev == "parry_fail":
                zones[z]["fail"] += 1
                by_type[d.get("type", "?")][1] += 1
                last_fail = int(float(d["err_ms"])) if "err_ms" in d else None
                if last_fail is not None:
                    errs.append(last_fail)
            elif ev == "parry_fail_update" and "err_ms" in d:
                errs.append(int(float(d["err_ms"])))
            elif ev == "roll":
                rolls[0] += 1
                rolls[1] += 1 if d.get("dodged") == "yes" else 0
            elif ev == "chapter_clear":
                did_clear = True
            elif ev == "feedback" and d.get("skipped") != "yes":
                for k in ("fun", "annoy", "parry"):
                    if d.get(k):
                        feedback[k][d[k]] += 1
                if d.get("comment"):
                    comments.append(d["comment"])
        play_total.append(rows[-1]["play"])
        if did_clear:
            cleared += 1
        elif last_zone:
            zones[last_zone]["quit"] += 1

    keys = sorted(zones, key=zone_order)
    out = []
    out.append("# 공백 플레이테스트 모아 보기\n")
    out.append("- 세션 %d개 · 1장 클리어 %d · 난이도 %s" % (sessions, cleared, dict(difficulty)))
    if play_total:
        out.append("- 플레이 시간 (마지막 기록 기준) 중앙값 %.0f초 · 최대 %.0f초" % (statistics.median(play_total), max(play_total)))
    out.append("")

    # ---- 짚을 곳
    flags = []
    rate = {k: zones[k]["deaths"] / max(1, len(zones[k]["players"])) for k in keys}
    if rate:
        med = statistics.median(rate.values()) or 0.0
        for k in sorted(rate, key=lambda k: -rate[k])[:3]:
            if rate[k] > 0 and rate[k] >= max(2.0, med * 2):
                top = zones[k]["killers"].most_common(1)
                flags.append("사망이 몰림: **%s** — 한 사람당 %.1f번 (중앙값 %.1f). 가장 많이: %s" % (
                    name(k), rate[k], med, top[0][0] if top else "-"))
    med_t = {k: statistics.median(zones[k]["times"]) for k in keys if zones[k]["times"]}
    if med_t:
        mm = statistics.median(med_t.values())
        for k, v in med_t.items():
            if v > max(60.0, mm * 2):
                flags.append("오래 걸림: **%s** — 중앙값 %.0f초 (구간 전체 중앙값 %.0f초)" % (name(k), v, mm))
    for k in keys:
        if zones[k]["quit"] >= max(2, sessions // 3):
            flags.append("여기서 많이 그만둠: **%s** — %d명" % (name(k), zones[k]["quit"]))
    if errs:
        mean = statistics.mean(errs)
        if abs(mean) > 15:
            flags.append("패링 입력이 평균 %+dms — %s (판정 창 앞뒤 여유를 그쪽으로 넓히는 걸 검토)" % (
                round(mean), "일찍 누르는 경향" if mean < 0 else "늦게 누르는 경향"))
    for ty, (a, b) in by_type.items():
        if a + b >= 10 and a / (a + b) < 0.35:
            flags.append("%s 공격 패링 성공률이 낮음: %d%% (%d/%d)" % (ty, round(100 * a / (a + b)), a, a + b))
    out.append("## 짚을 곳\n")
    out += ["- " + f for f in flags] or ["- 눈에 띄는 곳 없음 (세션이 적으면 기준이 잘 안 맞을 수 있음)"]
    out.append("")

    # ---- 구간 표
    out.append("## 구간별\n")
    out.append("| 구간 | 이름 | 사람 | 들어감 | 사망 | 사람당 사망 | 걸린 시간 (중앙값) | 그만둠 | 패링 성공 | 가장 많이 죽인 공격 |")
    out.append("|---|---|---|---|---|---|---|---|---|---|")
    for k in keys:
        z = zones[k]
        t = "%.0f초" % statistics.median(z["times"]) if z["times"] else "-"
        p = "%d%% (%d/%d)" % (round(100 * z["ok"] / (z["ok"] + z["fail"])), z["ok"], z["ok"] + z["fail"]) if z["ok"] + z["fail"] else "-"
        top = z["killers"].most_common(1)
        out.append("| %s | %s | %d | %d | %d | %.1f | %s | %d | %s | %s |" % (
            k, name(k), len(z["players"]), z["enter"], z["deaths"], rate.get(k, 0.0), t, z["quit"], p, top[0][0] if top else "-"))
    out.append("")

    if death_spots:
        out.append("## 사망이 몰린 자리 (월드 x, 64px 칸)\n")
        for (z, x), n in death_spots.most_common(8):
            out.append("- %s · x %d ~ %d: %d번" % (name(z), x, x + 63, n))
        out.append("")

    out.append("## 철견\n")
    out.append("- 페이즈별 사망: %s" % (dict(sorted(boss_phase.items())) or "-"))
    out.append("- 패턴별 사망 Top 5: %s" % (", ".join("%s %d" % kv for kv in boss_pattern.most_common(5)) or "-"))
    out.append("")
    out.append("## 패링 · 구르기\n")
    if errs:
        out.append("- 입력 오차 평균 %+dms · 절대 평균 %dms · 일찍 %d / 늦게 %d (기록 %d)" % (
            round(statistics.mean(errs)), round(statistics.mean(abs(e) for e in errs)),
            sum(1 for e in errs if e < 0), sum(1 for e in errs if e > 0), len(errs)))
    for ty, (a, b) in sorted(by_type.items()):
        out.append("- %s: %s" % (ty, "%d%% (%d/%d)" % (round(100 * a / (a + b)), a, a + b) if a + b else "-"))
    out.append("- 구르기 %d번 · 그중 공격을 피한 구르기 %d번" % tuple(rolls))
    out.append("")
    out.append("## 설문\n")
    for k, label in (("fun", "가장 재밌었던 순간"), ("annoy", "가장 짜증났던 곳"), ("parry", "패링 타이밍")):
        out.append("- %s: %s" % (label, ", ".join("%s %d" % kv for kv in feedback[k].most_common()) or "-"))
    for c in comments:
        out.append("  - “%s”" % c)
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
