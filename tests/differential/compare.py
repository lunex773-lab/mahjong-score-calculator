"""本アプリの採点結果を Python「mahjong」ライブラリ（独立実装）で再計算し照合する。

使い方: node <bundle>/generate.js <seed> <件数> | python compare.py [--emit 出力JSON]
--emit を付けると、ライブラリ側の計算値を期待値とした固定テストデータを書き出す。
"""
import json
import sys

from mahjong.constants import EAST, SOUTH, WEST, NORTH
from mahjong.hand_calculating.hand import HandCalculator
from mahjong.hand_calculating.hand_config import HandConfig, OptionalRules
from mahjong.meld import Meld

WINDS = [EAST, SOUTH, WEST, NORTH]


class Allocator:
    """34種の牌を136形式の個体IDへ割り当てる。赤五は各五の0番目の個体。"""

    def __init__(self):
        self.used = set()

    def take(self, tile):
        kind, red = tile["kind"], tile["red"]
        is_five = kind < 27 and kind % 9 == 4
        candidates = [kind * 4] if red else [kind * 4 + i for i in range(4) if not (is_five and i == 0)]
        for c in candidates:
            if c not in self.used:
                self.used.add(c)
                return c
        raise ValueError(f"no copy left for {tile}")


MELD_TYPES = {"chi": Meld.CHI, "pon": Meld.PON, "minkan": Meld.KAN, "kakan": Meld.SHOUMINKAN, "ankan": Meld.KAN}


def evaluate(inp):
    alloc = Allocator()
    concealed = [alloc.take(t) for t in inp["concealed"]]
    win = alloc.take(inp["winningTile"])
    melds = []
    meld_tiles = []
    for m in inp["melds"]:
        ids = [alloc.take(t) for t in m["tiles"]]
        meld_tiles += ids
        melds.append(Meld(meld_type=MELD_TYPES[m["type"]], tiles=ids, opened=m["type"] != "ankan"))
    dora = [alloc.take(t) for t in inp["dora"]["dora"] + inp["dora"]["kanDora"]]
    flags = inp["flags"]
    riichi = flags["riichi"] or flags["doubleRiichi"]
    if riichi:
        dora += [alloc.take(t) for t in inp["dora"]["ura"] + inp["dora"]["kanUra"]]
    seat_wind = WINDS[(inp["winner"] - inp["dealer"]) % 4]
    config = HandConfig(
        is_tsumo=inp["method"] == "tsumo",
        is_riichi=riichi,
        is_daburu_riichi=flags["doubleRiichi"],
        is_ippatsu=flags["ippatsu"],
        is_rinshan=flags["rinshan"],
        is_haitei=flags["haitei"],
        is_houtei=flags["houtei"],
        player_wind=seat_wind,
        round_wind=WINDS[inp["roundWind"] - 27],
        options=OptionalRules(has_open_tanyao=True, has_aka_dora=True, has_double_yakuman=False, kazoe_limit=1),
    )
    tiles = concealed + [win] + meld_tiles
    return HandCalculator().estimate_hand_value(tiles, win, melds=melds, dora_indicators=dora, config=config)


def total_of(res, inp):
    cost = res.cost
    if inp["method"] == "ron":
        return cost["main"]
    if inp["winner"] == inp["dealer"]:
        return cost["main"] * 3
    return cost["main"] + cost["additional"] * 2


def main():
    n = mismatches = 0
    emit_path = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "--emit" else None
    emitted = []
    for line in sys.stdin:
        row = json.loads(line)
        inp, ours = row["input"], row["ours"]
        res = evaluate(inp)
        n += 1
        theirs_valid = res.error is None
        problem = None
        if theirs_valid != ours["valid"]:
            problem = f"valid ours={ours['valid']} theirs={theirs_valid} ({res.error})"
        elif theirs_valid:
            t_total = total_of(res, inp)
            if t_total != ours["total"]:
                problem = f"total ours={ours['total']} theirs={t_total}"
            elif not ours["yakuman"] and (res.han != ours["han"] or (res.han < 5 and res.fu != ours["fu"])):
                problem = f"han/fu ours={ours['han']}/{ours['fu']} theirs={res.han}/{res.fu}"
        if emit_path:
            emitted.append({
                "input": inp,
                "expected": {
                    "valid": theirs_valid,
                    "total": total_of(res, inp) if theirs_valid else 0,
                    "han": res.han if theirs_valid else 0,
                    "fu": res.fu if theirs_valid else 0,
                },
            })
        if problem:
            mismatches += 1
            if mismatches <= 15:
                print("MISMATCH:", problem)
                print("  ours  :", ours)
                print("  theirs:", res.yaku, res.han, res.fu, res.cost if theirs_valid else res.error)
                print("  input :", json.dumps(inp, ensure_ascii=False))
    if emit_path:
        with open(emit_path, "w", encoding="utf-8") as f:
            json.dump(emitted, f, ensure_ascii=False, separators=(",", ":"))
    print(f"checked={n} mismatches={mismatches}")
    sys.exit(1 if mismatches else 0)


if __name__ == "__main__":
    main()
