# SAKIYA — 7-minute speech (investor jury)

**Target length: ~7:00** · Language: English · Tone: clear, concrete, no satellite jargon.

**Before you go on stage:** Dashboard open, **Load demo** ready, Analysis tab accessible.

---

## Timing card

```text
0:00–0:45   Hook + stakes
0:45–1:45   Who / problem / cost
1:45–2:30   Solution in one sentence + value
2:30–5:15   Feature demo (core)
5:15–6:15   Why it matters for an investor
6:15–7:00   Credibility, model, next step, close
```

---

## Script to deliver (almost word-for-word)

### 0:00–0:45 — Hook

> Hello. We are **SAKIYA**.
>
> Imagine a farmer deciding to irrigate… without knowing whether the field actually needs water today. He opens the tap “out of habit.” Result: wasted water, pump energy burned for nothing — or, the other way around, plant stress spotted too late, when yield is already hit.
>
> This is not a technology problem. It is an **information** problem. And that is exactly what SAKIYA solves.

### 0:45–1:45 — Who has the problem, and why it matters

> **Who?** Farmers, cooperatives, and plot managers — olives, cereals, irrigated crops.
>
> **The precise problem:** to irrigate well, you must combine three things:
> 1. vegetation condition,
> 2. real weather (rain, evapotranspiration),
> 3. crop need (type, age, soil).
>
> Today that data exists… but it is **scattered**, technical, and rarely turned into a **simple decision**: *when to irrigate, how much, and when to stop*.
>
> For an investor, the stake is clear: agricultural water and pumping energy are structural costs. Cutting useless cycles means money, resilience, and measurable impact.

### 1:45–2:30 — The solution in one sentence

> **SAKIYA** turns satellite imagery, weather, and the crop profile into a **transparent irrigation plan** — estimated, dated, and justified.
>
> Not a black box. Not an autonomous pump. A **decision** tool: evidence on the map, traceable numbers, a 7-day plan the farmer can follow — or ignore.
>
> Our loop: **field → satellite → NDVI → compare → weather → irrigation advice**.

### 2:30–5:15 — Demo: main features (~2 min 45)

> Let me show you the product. A real field, already loaded in demo.

**While clicking, say exactly this:**

#### 1) Site & map *(~20 s)*

> The user **draws the field** on the map, saves it, and enters the crop profile: plant type, age, soil type. That is ground truth — essential for advice that actually fits the plot.

#### 2) Satellite scan & NDVI *(~30 s)*

> In one click, SAKIYA fetches a clear **Sentinel-2** scene, computes **NDVI** — a vegetation vigor index — and displays it on the map with stats: mean, min, max, cloud cover.
>
> Every observation has **provenance**: sensor, date, clouds. We know where the number comes from.

#### 3) Comparison over time *(~35 s)*

> We scan a second date, then **compare**. True color and NDVI side by side. We see the **NDVI delta**: has vegetation improved or dropped?
>
> If the drop crosses a threshold, we raise an **“inspect”** flag with evidence. This is not a medical diagnosis of the plant: it is an alert to go check the field *before* irrigating blind.

#### 4) Weather *(~20 s)*

> We add weather context around the date: rain, temperature, **ET₀** — reference evapotranspiration. Because irrigating without looking at recent rain is exactly the waste we want to avoid.

#### 5) Irrigation plan *(~40 s)*

> Next, the **Irrigation Advisor** module. The rule engine combines NDVI, weather, and crop profile — a simplified FAO-style approach: crop coefficient, water need, soil capacity.
>
> Output: a **consumption estimate** (mm/day and m³ for the field) and a **7-day schedule**: irrigate, reduce, or skip a day if rain covers the need.
>
> If the “inspect” flag is on, the plan says it clearly: *check first*.
>
> An honesty banner: *generated from structured facts — not a diagnosis, not an automatic pump command*. The numbers come from rules; AI, when present, only **explains** those facts.

#### 6) Report *(~15 s, if time)*

> Finally, a shareable **HTML report** for the cooperative or technician: before / after, delta, alerts — the proof behind the decision.

> *[If the live demo fails: screenshots / video of the same path. Do not debug on stage.]*

### 5:15–6:15 — Why invest / why it matters

> Why this project matters:
>
> **1. A large, recurring problem.** Habit-based irrigation wastes water and pump energy, season after season.
>
> **2. A realistic go-to-market.** No IoT sensors on every hectare to start. Satellite + weather + crop profile = light deployment, scalable to the cooperative.
>
> **3. Credible differentiation.** Many tools show images. We close the loop to an **actionable plan**, with traceability: where each number comes from, which assumptions, when *not* to irrigate.
>
> **4. A clear value metric for an investor.**
> - water volume avoided (m³),
> - pump energy proxy (kWh via avoided cycles),
> - plan adoption rate on N plots / season.
>
> Energy is not an electrical gadget: it is the **effect** of targeted irrigation.

### 6:15–7:00 — Credibility, model, next, close

> Let’s be clear about what the prototype does **not** claim: NDVI is not soil moisture; Open-Meteo weather is not a plot rain gauge; the plan is **indicative**. That honesty is intentional — it builds field trust and a measurable pilot.
>
> **Model:** per-hectare SaaS for cooperatives / managers, with optional entry via a public agri-water program for the pilot.
>
> **Next step:** validate on 1 to 3 plots (olive / wheat) with a coop — calibrate mm, track m³ and pump days avoided, keep rules for numbers and AI for language only.
>
> In short: SAKIYA gives farmers **the right information, at the right time, for the right irrigation decision** — with visible evidence for the field, and readable metrics for the investor.
>
> Thank you. We are ready for your questions — and for a deeper demo.

---

## One-liner (if you get cut short)

> SAKIYA helps farmers know **when and how much to irrigate** by combining satellite, weather, and crop data — for less wasted water, less pump energy, and a transparent 7-day plan.

---

## Demo checklist (fixed order)

1. Dashboard → **Load demo**
2. Sites / crop profile (plant, age, soil)
3. Analysis → map + NDVI + provenance
4. Compare two dates → Δ NDVI + “inspect”
5. Weather panel
6. **Plan irrigation** → mm, m³, 7-day schedule, honesty banner
7. HTML report (if > 30 s left)

---

## Investor Q&A (short answers)

| Question | Answer |
|----------|--------|
| Is this already a business? | End-to-end hackathon prototype; coop pilot = next revenue validation. |
| Moat? | Full loop + traceable rules + actionable plan — not just an image viewer. |
| Satellite competitors? | Many show imagery; few close to justified, honest irrigation advice. |
| Scalability? | No mandatory IoT at start; cost = cloud + scenes + crop tables. |
| Main risk? | Field adoption + local water-need calibration — hence a measured pilot. |
| NDVI = water stress? | Proxy for vegetation vigor; we never claim to measure soil moisture. |
| Where do mm/m³ come from? | Rule engine: ET₀ × Kc + soil + area; we show facts / assumptions. |
| Role of AI? | Narrating structured facts only; template if no API key. |

---

## Team split (optional)

| Person | Role | Beat |
|--------|------|------|
| **A** | Pitch | Hook → problem → close |
| **B** | Demo | Clicks + feature callouts |
| **C** | Tech | Q&A stack / provenance |
| **D** | Domain | Irrigation, energy, honesty |
