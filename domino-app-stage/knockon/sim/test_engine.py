"""Engine tests on a toy version of the Cauvery chain.  Run:  python -m pytest -q sim  (or python sim/test_engine.py)"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from engine import BACKUP, DOWN, UP, Dep, Failure, Graph, Node, recommend, simulate  # noqa: E402


def chain_graph(reservoir_storage_h=1.0, hospital_water_h=8.0, diesel_h=12.0, dual_feed=False):
    n = {
        "feeder": Node("feeder", "feeder", "TK Halli feeder", provides="power"),
        "tk": Node("tk", "pump", "TK Halli", provides="water", restart_h={"power": 1.0, "repair": 1.0}),
        "haro": Node("haro", "pump", "Harohalli", provides="water", restart_h={"power": 1.0, "water": 0.0}),
        "tata": Node("tata", "pump", "Tataguni", provides="water", restart_h={"power": 1.0, "water": 0.0}),
        "res": Node("res", "reservoir", "City GLR", provides="water",
                    buffers={"water": reservoir_storage_h}, restart_h={"water": 3.0}),
        "sub1": Node("sub1", "substation", "Sub 1", provides="power"),
        "sub2": Node("sub2", "substation", "Sub 2", provides="power"),
        "hosp": Node("hosp", "hospital", "Hospital",
                     buffers={"water": hospital_water_h, "power": diesel_h}),
    }
    d = {
        "tk": [Dep("power", ["feeder"])],
        "haro": [Dep("water", ["tk"])],
        "tata": [Dep("water", ["haro"])],
        "res": [Dep("water", ["tata"])],
        "hosp": [Dep("water", ["res"]), Dep("power", ["sub1", "sub2"] if dual_feed else ["sub1"])],
    }
    return Graph(n, d)


def states(result, nid):
    return [(e["t"], e["state"]) for e in result["timeline"] if e["id"] == nid]


def test_20_minute_trip_matches_bwssb_4_hours():
    """BWSSB: a ~20 min outage -> ~1 h pump restart -> ~3 h refill => roughly 4 h of disruption."""
    r = simulate(chain_graph(), [Failure("feeder", 0.0, 20 / 60)], horizon_h=12)
    res = states(r, "res")
    assert res[0] == (1.0, BACKUP) or res[0][1] == BACKUP
    down = [t for t, s in res if s == DOWN][0]
    back = [t for t, s in res if s == UP][0]
    assert abs(down - 1.0) < 1e-3
    assert abs(back - (20 / 60 + 1.0 + 3.0)) < 1e-3        # 4.33 h after the trip
    # hospital rides it out on its tank
    assert states(r, "hosp") == [(1.0, BACKUP), (round(back, 4), UP)]
    assert r["hospitals_down"] == 0


def test_tk_halli_flood_36h_hits_hospital():
    r = simulate(chain_graph(), [Failure("tk", 0.0, 36.0, "flooded")], horizon_h=72)
    h = r["hospitals"][0]
    assert h["warning_at_h"] == 1.0                          # reservoir empties after 1 h
    assert h["down_at_h"] == 9.0                             # + 8 h hospital tank
    # TK back at 36 + 1 h restart = 37 -> chain instant -> reservoir refill 3 h = 40
    assert abs(h["hours_down"] - 31.0) < 1e-6
    assert r["impact_hospital_hours"] == 31.0


def test_dual_feed_survives_single_substation():
    r = simulate(chain_graph(dual_feed=True), [Failure("sub1", 0.0, None)], horizon_h=24)
    assert states(r, "hosp") == []                           # never even on backup


def test_single_feed_rides_on_diesel_then_fails():
    r = simulate(chain_graph(diesel_h=12.0), [Failure("sub1", 0.0, None)], horizon_h=24)
    assert states(r, "hosp") == [(0.0, BACKUP), (12.0, DOWN)]


def test_short_outage_within_diesel_no_impact():
    r = simulate(chain_graph(diesel_h=12.0), [Failure("sub1", 0.0, 6.0)], horizon_h=24)
    assert states(r, "hosp") == [(0.0, BACKUP), (6.0, UP)]
    assert r["impact_hospital_hours"] == 0


def test_recommender_picks_hospital_water_storage_for_flood():
    g = chain_graph()
    rec = recommend(g, [Failure("tk", 0.0, 36.0, "flooded")], horizon_h=72, storage_h=12.0)
    best = rec["options"][0]
    assert best["node_id"] == "hosp" and best["type"] == "water_storage"
    assert best["impact_after"] == 19.0                      # down at 21 h instead of 9 h


def test_recommender_generator_at_pump_for_power_trip():
    """Long feeder outage: a generator at TK Halli keeps the whole chain running."""
    g = chain_graph()
    rec = recommend(g, [Failure("feeder", 0.0, 20.0)], horizon_h=48, generator_h=24.0)
    best = rec["options"][0]
    assert best["node_id"] == "tk" and best["type"] == "generator"
    assert best["impact_after"] == 0


def test_repeat_loss_does_not_fire_stale_countdown():
    g = chain_graph(hospital_water_h=8.0)
    # reservoir drains twice; hospital's first countdown must not end the second one early
    fails = [Failure("tata", 0.0, 2.0), Failure("tata", 6.0, 2.0)]
    r = simulate(g, fails, horizon_h=24)
    assert r["hospitals_down"] == 0


def test_supply_back_at_same_instant_wins():
    """Reservoir comes back exactly when the hospital tank runs out: no failure."""
    g = chain_graph(hospital_water_h=8.0)
    # Tataguni out for 4 h -> reservoir dry at 1 h, refill done at 4 + 0 + 3 = 7 h... use 5 h so return = 8 h
    r = simulate(g, [Failure("tata", 0.0, 5.0)], horizon_h=24)
    assert r["hospitals_down"] == 0
    assert r["impact_hospital_hours"] == 0


if __name__ == "__main__":
    import inspect
    tests = [f for name, f in inspect.getmembers(sys.modules[__name__], inspect.isfunction)
             if name.startswith("test_")]
    for t in tests:
        t()
        print("ok ", t.__name__)
    print(f"{len(tests)} passed")
