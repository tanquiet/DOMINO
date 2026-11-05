"""
DOMINO cascade engine.

A discrete-event simulation of failures spreading through a dependency graph.

Concepts
--------
Node        a facility (substation, pumping station, reservoir, hospital, telecom tower ...)
provides    the resource a node supplies to others while it is working ("power", "water", ...)
Dep         a requirement group: the node needs `resource` from ANY ONE of `providers`
            (several providers = redundancy, e.g. a hospital fed by two substations)
buffers     hours a node keeps working after losing a resource (diesel, tank storage, battery)
restart_h   hours a node needs to come back after its inputs return, per cause
            ("power": pump restart, "water": reservoir refill, "repair": after a forced failure)

States      UP       working normally
            BACKUP   working on a buffer, with a countdown
            DOWN     not working; its dependents lose this resource

Pure standard library, so it runs anywhere and is fast enough to re-run hundreds of times
for the weak-link ranking and the backup recommender.
"""
from __future__ import annotations

import heapq
import itertools
from dataclasses import dataclass, field

UP, BACKUP, DOWN = "UP", "BACKUP", "DOWN"


@dataclass
class Node:
    id: str
    kind: str
    name: str = ""
    lat: float = 0.0
    lon: float = 0.0
    provides: str | None = None
    buffers: dict = field(default_factory=dict)     # resource -> hours
    restart_h: dict = field(default_factory=dict)   # cause -> hours
    weight: float = 1.0                             # importance in the impact score
    meta: dict = field(default_factory=dict)


@dataclass
class Dep:
    resource: str
    providers: list


@dataclass
class Graph:
    nodes: dict                                     # id -> Node
    deps: dict                                      # id -> [Dep]
    dependents: dict = field(default_factory=dict)  # provider id -> [dependent ids]

    def __post_init__(self):
        if not self.dependents:
            self.reindex()

    def reindex(self):
        self.dependents = {}
        for nid, groups in self.deps.items():
            for g in groups:
                for p in g.providers:
                    self.dependents.setdefault(p, [])
                    if nid not in self.dependents[p]:
                        self.dependents[p].append(nid)

    def edges(self):
        for nid, groups in self.deps.items():
            for g in groups:
                for p in g.providers:
                    yield {"from": p, "to": nid, "resource": g.resource}


@dataclass
class Failure:
    node_id: str
    at_h: float = 0.0
    repair_h: float | None = None   # None = not repaired within the horizon
    reason: str = "failed"


class Simulation:
    """One run. Create, call run(), read the result dict."""

    def __init__(self, graph: Graph, failures: list[Failure], horizon_h: float = 72.0,
                 buffer_overrides: dict | None = None):
        self.g = graph
        self.failures = failures
        self.horizon = float(horizon_h)
        # buffer_overrides: node_id -> {resource: hours}   (used for interventions)
        self.buffer_overrides = buffer_overrides or {}

        self.state = {nid: UP for nid in graph.nodes}
        self.forced = set()                       # nodes held down by a failure
        self.repaired_pending = set()             # repaired, waiting for restart
        self.down_causes = {nid: set() for nid in graph.nodes}
        self.on_backup = {nid: {} for nid in graph.nodes}   # resource -> expire time
        self.gen = {nid: 0 for nid in graph.nodes}          # invalidates stale events
        self.events = []
        self.seq = itertools.count()
        self.now = 0.0
        self.timeline = []                        # state changes

    # ----------------------------------------------------------------- helpers
    def buffer(self, nid, resource):
        ov = self.buffer_overrides.get(nid, {})
        if resource in ov:
            return float(ov[resource])
        return float(self.g.nodes[nid].buffers.get(resource, 0.0))

    def working(self, nid):
        return self.state[nid] != DOWN

    def missing(self, nid):
        """Resources this node currently lacks (every provider in the group is down)."""
        out = []
        for grp in self.g.deps.get(nid, []):
            if not any(self.working(p) for p in grp.providers if p in self.state):
                out.append(grp.resource)
        return out

    def push(self, t, kind, nid, *extra):
        # at the same instant, supply coming back wins over a backup running out
        order = (1 if kind == "expire" else 0) * 10**9 + next(self.seq)
        heapq.heappush(self.events, (t, order, kind, nid, extra))

    def set_state(self, nid, new, reason):
        old = self.state[nid]
        if old == new:
            return False
        self.state[nid] = new
        self.timeline.append({"t": round(self.now, 4), "id": nid, "state": new, "reason": reason})
        was_working, is_working = old != DOWN, new != DOWN
        if was_working != is_working:
            for dep in self.g.dependents.get(nid, []):
                self.evaluate(dep)
        return True

    # ----------------------------------------------------------------- core rule
    def evaluate(self, nid):
        """Re-check a node after one of its providers changed."""
        if nid in self.forced:
            return
        lacking = self.missing(nid)
        st = self.state[nid]

        if lacking:
            if st == DOWN:
                self.down_causes[nid].update(lacking)
                return
            # start (or keep) a countdown for each missing resource
            for res in lacking:
                if res in self.on_backup[nid]:
                    continue
                b = self.buffer(nid, res)
                if b <= 0:
                    self.go_down(nid, {res}, f"lost {res}")
                    return
                expires = self.now + b
                self.on_backup[nid][res] = expires
                self.push(expires, "expire", nid, res, self.gen[nid])
            # countdowns for resources that came back are cancelled
            for res in list(self.on_backup[nid]):
                if res not in lacking:
                    del self.on_backup[nid][res]
            names = ", ".join(sorted(self.on_backup[nid]))
            self.set_state(nid, BACKUP, f"on backup ({names})")
            return

        # nothing missing
        if st == BACKUP:
            self.on_backup[nid].clear()
            self.gen[nid] += 1
            self.set_state(nid, UP, "supply restored")
        elif st == DOWN and nid not in self.repaired_pending:
            causes = self.down_causes[nid] or {"repair"}
            node = self.g.nodes[nid]
            wait = max(float(node.restart_h.get(c, 0.0)) for c in causes)
            self.gen[nid] += 1
            if wait <= 0:
                self.recover(nid)
            else:
                self.repaired_pending.add(nid)
                self.push(self.now + wait, "recover", nid, self.gen[nid])

    def go_down(self, nid, causes, reason):
        self.on_backup[nid].clear()
        self.gen[nid] += 1
        self.down_causes[nid] = set(causes)
        self.repaired_pending.discard(nid)
        self.set_state(nid, DOWN, reason)

    def recover(self, nid):
        self.repaired_pending.discard(nid)
        if self.missing(nid):           # inputs failed again while restarting
            self.evaluate(nid)
            return
        self.down_causes[nid] = set()
        self.set_state(nid, UP, "back in service")

    # ----------------------------------------------------------------- main loop
    def run(self):
        for f in self.failures:
            if f.node_id in self.g.nodes:
                self.push(f.at_h, "fail", f.node_id, f.repair_h, f.reason)

        while self.events:
            t, _, kind, nid, extra = heapq.heappop(self.events)
            if t > self.horizon:
                break
            self.now = t
            if kind == "fail":
                repair_h, reason = extra
                self.forced.add(nid)
                self.go_down(nid, {"repair"}, reason)
                if repair_h is not None:
                    self.push(t + repair_h, "repair", nid)
            elif kind == "repair":
                self.forced.discard(nid)
                self.down_causes[nid] = {"repair"}
                self.evaluate(nid)
            elif kind == "expire":
                res, gen = extra
                if gen != self.gen[nid] or self.state[nid] != BACKUP:
                    continue
                if self.on_backup[nid].get(res) == t and res in self.missing(nid):
                    self.go_down(nid, {res}, f"{res} backup ran out")
            elif kind == "recover":
                (gen,) = extra
                if gen != self.gen[nid] or self.state[nid] != DOWN:
                    continue
                self.recover(nid)

        self.now = self.horizon
        return self.result()

    # ----------------------------------------------------------------- outputs
    def result(self):
        per_node = {}
        for ev in self.timeline:
            per_node.setdefault(ev["id"], []).append(ev)

        def down_hours(nid):
            total, since = 0.0, None
            for ev in per_node.get(nid, []):
                if ev["state"] == DOWN and since is None:
                    since = ev["t"]
                elif ev["state"] != DOWN and since is not None:
                    total += ev["t"] - since
                    since = None
            if since is not None:
                total += self.horizon - since
            return total

        hospitals = []
        impact = 0.0
        for nid, node in self.g.nodes.items():
            if node.kind != "hospital":
                continue
            evs = per_node.get(nid, [])
            if not evs:
                continue
            first_backup = next((e["t"] for e in evs if e["state"] == BACKUP), None)
            first_down = next((e for e in evs if e["state"] == DOWN), None)
            hrs = down_hours(nid)
            impact += hrs * node.weight
            hospitals.append({
                "id": nid, "name": node.name,
                "warning_at_h": first_backup,
                "down_at_h": first_down["t"] if first_down else None,
                "down_reason": first_down["reason"] if first_down else None,
                "hours_down": round(hrs, 2),
            })
        hospitals.sort(key=lambda h: (h["down_at_h"] is None, h["down_at_h"] or 1e9,
                                      h["warning_at_h"] or 1e9))

        affected_kinds = {}
        for nid in per_node:
            k = self.g.nodes[nid].kind
            affected_kinds[k] = affected_kinds.get(k, 0) + 1

        return {
            "horizon_h": self.horizon,
            "timeline": self.timeline,
            "impact_hospital_hours": round(impact, 2),
            "hospitals": hospitals,
            "hospitals_down": sum(1 for h in hospitals if h["down_at_h"] is not None),
            "first_hospital_down_h": next((h["down_at_h"] for h in hospitals
                                           if h["down_at_h"] is not None), None),
            "affected_by_kind": affected_kinds,
            "series": self.series(per_node),
        }

    def series(self, per_node, step_h=0.5):
        """Counts of DOWN / BACKUP nodes per kind over time, for the chart."""
        kinds = sorted({n.kind for n in self.g.nodes.values()})
        steps = int(self.horizon / step_h) + 1
        out = {"t": [round(i * step_h, 2) for i in range(steps)]}
        for k in kinds:
            out[f"{k}_down"] = [0] * steps
            out[f"{k}_backup"] = [0] * steps
        for nid, evs in per_node.items():
            k = self.g.nodes[nid].kind
            for i, ev in enumerate(evs):
                end = evs[i + 1]["t"] if i + 1 < len(evs) else self.horizon + step_h
                if ev["state"] == UP:
                    continue
                key = f"{k}_down" if ev["state"] == DOWN else f"{k}_backup"
                a = int(-(-ev["t"] // step_h))          # ceil
                b = int(-(-end // step_h))
                for s in range(a, min(b, steps)):
                    out[key][s] += 1
        return out


def simulate(graph, failures, horizon_h=72.0, buffer_overrides=None):
    return Simulation(graph, failures, horizon_h, buffer_overrides).run()


# ---------------------------------------------------------------------- analysis
def criticality(graph, candidate_kinds=("substation_tx", "substation", "feeder", "pump", "reservoir"),
                repair_h=12.0, horizon_h=48.0, top=None):
    """Fail each candidate on its own and score the damage to hospitals."""
    rows = []
    for nid, node in graph.nodes.items():
        if node.kind not in candidate_kinds:
            continue
        r = simulate(graph, [Failure(nid, 0.0, repair_h, "single failure")], horizon_h)
        rows.append({
            "id": nid, "name": node.name, "kind": node.kind,
            "impact_hospital_hours": r["impact_hospital_hours"],
            "hospitals_down": r["hospitals_down"],
            "nodes_affected": len({e["id"] for e in r["timeline"]}) - 1,
        })
    rows.sort(key=lambda x: (-x["impact_hospital_hours"], -x["hospitals_down"], -x["nodes_affected"]))
    return rows[:top] if top else rows


INTERVENTION_LABELS = {
    "generator": "Add a backup generator",
    "water_storage": "Add water storage at the hospital",
    "interconnect": "Link to a reservoir on another supply line",
}


def apply_interventions(graph, interventions):
    """Return (graph variant, buffer overrides) with the interventions applied.
    intervention: {"node_id", "type", "extra_hours"} or {"node_id", "type": "interconnect", "provider"}"""
    overrides = {}
    new_deps = None
    for iv in interventions or []:
        nid, itype = iv["node_id"], iv["type"]
        node = graph.nodes.get(nid)
        if node is None:
            continue
        if itype in ("generator", "water_storage"):
            res = "power" if itype == "generator" else "water"
            cur = overrides.get(nid, {}).get(res, node.buffers.get(res, 0.0))
            overrides.setdefault(nid, {})[res] = cur + float(iv.get("extra_hours", 0))
        elif itype == "interconnect" and iv.get("provider") in graph.nodes:
            if new_deps is None:
                new_deps = {k: [Dep(d.resource, list(d.providers)) for d in v] for k, v in graph.deps.items()}
            for d in new_deps.get(nid, []):
                if d.resource == "water" and iv["provider"] not in d.providers:
                    d.providers.append(iv["provider"])
    g = graph if new_deps is None else Graph(graph.nodes, new_deps)
    return g, overrides


def simulate_with(graph, failures, horizon_h=72.0, interventions=None):
    g, ov = apply_interventions(graph, interventions)
    return simulate(g, failures, horizon_h, ov)


def _candidate_interventions(graph, touched, forced, chosen, generator_h, storage_h, went_down=None):
    interconnected = {iv["node_id"] for iv in chosen if iv["type"] == "interconnect"}
    used_providers = {iv.get("provider") for iv in chosen if iv["type"] == "interconnect"}
    reservoirs = [n for n in graph.nodes.values() if n.kind == "reservoir"]
    # only facilities that actually failed can be helped; sorted so ties break the same way every run
    pool = (went_down if went_down is not None else touched) - forced
    for nid in sorted(pool):
        node = graph.nodes[nid]
        resources = {d.resource for d in graph.deps.get(nid, [])}
        if "power" in resources and node.kind in ("pump", "reservoir", "hospital", "telecom"):
            yield {"node_id": nid, "type": "generator", "extra_hours": generator_h}
        if "water" in resources and node.kind == "hospital":
            yield {"node_id": nid, "type": "water_storage", "extra_hours": storage_h}
        if node.kind == "reservoir" and nid not in interconnected and nid not in used_providers:
            line = node.meta.get("supply_line")
            others = [r for r in reservoirs if r.meta.get("supply_line") != line
                      and r.id not in touched and r.id not in interconnected]
            if others:
                best = min(others, key=lambda r: (r.lat - node.lat) ** 2 + (r.lon - node.lon) ** 2)
                yield {"node_id": nid, "type": "interconnect", "provider": best.id,
                       "provider_name": best.name}


def recommend(graph, failures, horizon_h=72.0, generator_h=24.0, storage_h=12.0, top=3, budget=3):
    """Greedy: pick the single fix that cuts hospital impact most, apply it, repeat `budget` times.
    Also returns the best single fixes on their own (`options`)."""
    base = simulate(graph, failures, horizon_h)
    base_impact = base["impact_hospital_hours"]
    forced = {f.node_id for f in failures}

    def describe(iv, r, before):
        node = graph.nodes[iv["node_id"]]
        out = dict(iv)
        out.update({"name": node.name, "kind": node.kind, "label": INTERVENTION_LABELS[iv["type"]],
                    "impact_before": round(before, 2), "impact_after": r["impact_hospital_hours"],
                    "reduction_pct": round(100 * (before - r["impact_hospital_hours"]) / before, 1)
                    if before else 0.0,
                    "hospitals_down_after": r["hospitals_down"]})
        return out

    chosen, steps, options = [], [], []
    current, current_impact = base, base_impact
    for step in range(max(budget, 1)):
        touched = {e["id"] for e in current["timeline"]}
        went_down = {e["id"] for e in current["timeline"] if e["state"] == DOWN}
        best = None
        for iv in _candidate_interventions(graph, touched, forced, chosen, generator_h, storage_h, went_down):
            r = simulate_with(graph, failures, horizon_h, chosen + [iv])
            gain = current_impact - r["impact_hospital_hours"]
            if gain > 1e-6:
                if step == 0:
                    options.append(describe(iv, r, base_impact))
                if best is None or gain > best[0] + 1e-9:
                    best = (gain, iv, r)
        if best is None:
            break
        _, iv, r = best
        chosen.append(iv)
        steps.append(describe(iv, r, current_impact))
        current, current_impact = r, r["impact_hospital_hours"]

    options.sort(key=lambda o: o["impact_after"])
    return {
        "baseline": {"impact_hospital_hours": base_impact, "hospitals_down": base["hospitals_down"],
                     "first_hospital_down_h": base["first_hospital_down_h"]},
        "options": options[:top],
        "plan": steps,
        "plan_result": {"impact_hospital_hours": current_impact,
                        "hospitals_down": current["hospitals_down"],
                        "reduction_pct": round(100 * (base_impact - current_impact) / base_impact, 1)
                        if base_impact else 0.0},
        "interventions": chosen,
    }
