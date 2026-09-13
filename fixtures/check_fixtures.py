"""Independently check three finite FIFO examples; not a full game implementation.

Run: python fixtures/check_fixtures.py
The assertions below concern only the supplied positions and one-ply replies.
There is no complete-game solution, AI benchmark, or repetition solver here.
"""
from __future__ import annotations
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

def has_line(queue: tuple[tuple[int, int], ...], length: int) -> bool:
    occupied = set(queue)
    for row, col in occupied:
        for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
            if all((row + t*dr, col + t*dc) in occupied for t in range(length)):
                return True
    return False


def advance(queues, side, move, config):
    n = config["boardSize"]
    k = config["retention"]["maxStones"]
    r, c = move
    if not (0 <= r < n and 0 <= c < n):
        raise ValueError("Out-of-bounds move")
    if move in queues[0] or move in queues[1]:
        raise ValueError("Position is occupied before removal")
    changed = list(queues[side]) + [move]
    removed = changed.pop(0) if len(changed) > k else None
    out = list(queues)
    out[side] = tuple(changed)
    winner = side if has_line(out[side], config["winLength"]) else None
    return tuple(out), 1-side, winner, removed


def replay(moves, config):
    queues, side = ((), ()), 0
    for move in moves:
        queues, side, winner, _ = advance(queues, side, tuple(move), config)
        assert winner is None, "Fixture prefix contains an earlier terminal win"
    return queues, side


def main():
    data = json.loads((HERE/"rule-cases.json").read_text(encoding="utf-8"))
    cfg = data["config"]
    checks = []
    for case in data["cases"]:
        queues, side = replay(case["prefixMoves"], cfg)
        assert side == 0
        assert len(queues[0]) == len(queues[1]) == 6
        if case["id"] == "false-five-after-expiry":
            _, next_side, winner, removed = advance(queues, side, tuple(case["nextMove"]), cfg)
            assert winner is None and removed == (2,0) and next_side == 1
            checks.append({"id":case["id"],"passed":True,"verified":"Legal 12-ply prefix; apparent five disappears to four after deletion."})
        elif case["id"] == "expiry-lock":
            n = cfg["boardSize"]
            legal = [(r,c) for r in range(n) for c in range(n)
                     if (r,c) not in queues[0] and (r,c) not in queues[1]]
            assert len(legal) == 24
            for move in legal:
                child, next_side, winner, removed = advance(queues, side, move, cfg)
                assert winner is None and removed == (2,2)
                _, _, reply_winner, reply_removed = advance(child, next_side, (2,2), cfg)
                assert reply_winner == 1 and reply_removed == (5,5)
            # The disappearing blocker itself is not a legal X move.
            try:
                advance(queues, side, (2,2), cfg)
            except ValueError:
                pass
            else:
                raise AssertionError("Oldest occupied square was accepted")
            checks.append({"id":case["id"],"passed":True,"verifiedXReplies":24,
                           "verified":"Every legal X move is non-winning and lets O win at (2,2)."})
        else:
            assert case["id"] == "expiry-lock-counterexample"
            for move in case["continuation"]:
                queues, side, winner, removed = advance(queues, side, tuple(move), cfg)
                assert winner is None
            assert removed == (2,0) and side == 0
            checks.append({"id":case["id"],"passed":True,"verified":"O's own oldest attack stone expires; filling the gap is not a win."})
    result = {"scope":"Independent verification of three fixtures only; not full-game/AI verification.",
              "passedCases":len(checks),"checks":checks}
    (HERE/"fixture-validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
