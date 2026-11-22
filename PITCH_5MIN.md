# SAKIYA — 5-minute pitch

Aligned to jury brief: five structuring questions + final presentation outline.

**Total: ~5:00** · Demo ready on **Dashboard** before you start.

---

## Frame sentence (say early)

> **Our solution helps farmers and cooperatives solve wasted irrigation water and pumping energy thanks to satellite NDVI + weather + crop profile that produce a transparent irrigation plan. We will verify its value with avoided water/energy (mm and kWh) and the share of plans actually followed on pilot fields.**

---

## Five questions — SAKIYA answers

| # | Question | Pitch answer |
|---|----------|--------------|
| 1 | **Who has the problem?** | Farmers, cooperatives, and plot managers (olives, cereals, etc.) who irrigate without a clear view of vegetation condition. |
| 2 | **What precise problem?** | They don’t know **when** and **how much** to irrigate: imagery, weather, and crop need sit in separate silos → over-irrigation (water + pump energy) or stress spotted too late. |
| 3 | **How does it act on energy?** | Fewer useless pump cycles: the plan reduces/skips days when rain and ET₀ cover demand; the “inspect” flag avoids irrigating blind on an anomaly. **Energy lever = targeted irrigation, not a new electrical gadget.** |
| 4 | **What indicator verifies the result?** | (a) Δ NDVI + % of days the plan suggests skip/reduce; (b) estimated volume avoided (m³) → proxy pump kWh; (c) plan adoption rate on N plots / season. |
| 5 | **Who uses, maintains, and funds it?** | **Uses:** farmer / coop tech. **Maintains:** SAKIYA team (API, scenes, FAO-style rules). **Funds:** coop / public agri-water program / SaaS per hectare (subsidized pilot possible). |

---

## Script (final presentation structure)

### 0:00–1:10 — User and problem

> Hello — we are **SAKIYA**.
>
> **Who?** The farmer or cooperative managing a real field — here, one plot tracked from space.
>
> **Precise problem:** to irrigate well you must combine canopy condition, weather, and crop type. Today those sources are scattered and hard to act on. Result: too much water, too much **pumping energy**, or stress seen too late.
>
> *[Say the full frame sentence.]*

---

### 1:10–3:20 — How it works and demonstration (~2 min)

> **How it works:** draw the site → clear Sentinel-2 scenes → **NDVI** with provenance → date compare + “inspect” if the drop is large → weather (rain, temp, ET₀) → crop profile (type, age, soil) → **consumption estimate + 7-day irrigation plan**. Rules own the numbers; AI only narrates structured facts.

**Demo (app already open):**

1. Dashboard → **Load demo**
2. Analysis → map + NDVI + metadata
3. Compare two dates → Δ NDVI + flag
4. Weather panel
5. **Plan irrigation** → mm/day, m³, schedule, honesty banner
6. HTML report (if time)

> Energy line during demo: “If rain covers the need, the plan says *reduce / skip* — that means fewer pump starts.”

**If live demo fails:** same path on screenshots/video. Do not live-debug.

---

### 3:20–4:20 — Result and hypotheses

> **Hackathon result:** an end-to-end loop on **one field** — site, scan, compare, weather, plan, report — with evidence (sensor, date, cloud) and stated assumptions (Kc, ET₀, soil).
>
> **Honest hypotheses:** NDVI ≠ soil moisture; Open-Meteo ≠ a plot rain gauge; image enhancement is visual only; the plan is **indicative**, not an automatic command; energy is an **effect** of water avoided, not a meter we wired this weekend.
>
> **Verification indicator (next):** on 1–3 pilot plots, measure m³ / pump days avoided vs usual practice, and whether “inspect” flags correlate with useful field visits.

---

### 4:20–5:00 — Cost, maintenance, next step

> **Cost (hackathon → pilot order of magnitude):** light cloud stack (API + Mongo + scenes) + expert time on crop rules; no mandatory IoT sensors to start.
>
> **Maintenance:** keep Kc / crop tables current, monitor satellite jobs, support the coop.
>
> **Who funds the pilot:** cooperative or agri/water program; then per-hectare subscription.
>
> **Next step:** validate the plan on olive / wheat with a coop — calibrate mm, track pump kWh proxy, keep rules for numbers and AI for language only.
>
> Thank you — questions welcome.

---

## Timing card

```text
0:00  User + problem + frame sentence
1:10  Demo (site → NDVI → compare → weather → plan)
3:20  Result + hypotheses + indicator
4:20  Cost / maintenance / funding / next
5:00  Stop → Q&A
```

---

## One-slide outline (if only one slide)

1. User / problem (water + pump energy)
2. SAKIYA loop + live demo
3. Indicator: m³ / kWh avoided + adoption
4. Coop pilot · SaaS/ha · honest rules

---

## Optional team beats

| Person | Role | Beat |
|--------|------|------|
| **A** | Pitch | Hook, problem, frame sentence, close |
| **B** | Demo | Clicks + short callouts |
| **C** | Tech | Stack / provenance on Q&A |
| **D** | Domain | Irrigation rules / energy / honesty |

---

## Q&A cheat sheet (~30s)

| Question | Answer |
|----------|--------|
| Is NDVI water stress? | Proxy for vegetation vigor; we never claim soil moisture. |
| Why Open-Meteo? | Fast archive/forecast at centroid for context — not a field sensor. |
| Where do mm/m³ come from? | Rule engine: ET₀ × Kc + soil + area; show facts / assumptions. |
| What’s the LLM doing? | Narrating structured facts only; template if no API key. |
| How does this save energy? | Fewer irrigation events when rain/ET₀ cover need → fewer pump starts (proxy kWh from m³ avoided). |
| Production-ready? | Hackathon prototype: one-field happy path, provenance, honesty banners. |
