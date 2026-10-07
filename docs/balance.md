# Simulation balance (Milestone 8.2)

Milestone 8.2 fixed root causes found in the balance audit. It did this without adding saved fields, so existing version 9 saves load unchanged. The before/after evidence is in [BALANCE_RETEST.md](BALANCE_RETEST.md).

## Where the values live

All tuning values for this pass are in `shared/simulation/balance-config.ts`, grouped by the feedback loop each one tunes. Policy costs and bases are in `shared/simulation/governance-config.ts`.

| Group | What it controls | Key values |
|---|---|---|
| `labour` | Migration and the labour market | Arrivals taper to zero between 6% (`frictionalUnemployment`) and 20% (`migrantTolerance`) unemployment. Departures ramp up from satisfaction 42 and unemployment 35%. Shops short of customers cut hours, down to 60%. |
| `recovery` | Abandonment, reopening and redevelopment | Abandonment after 90–150 days of decline. Decline counts 1 day in 4 while the city is flooded. Residents of abandoned homes are rehoused. Shells are cleared after 240 days. Firms reopen at a market ratio of 0.55 and expand only above 0.85. |
| `weather` | Rain spells and flood memory | Storm peaks taper by ×0.55 per day. Flood memory has a half-life of about a year. Vegetation and wetland drain up to 7 mm/day. Severity is graded nuisance, significant or severe. |
| `taxes` | Tax response | Up to 40% of collection is lost at the maximum rate. Demand responds asymmetrically: −30 above the base, +14 below it. Satisfaction falls by up to 10 points at the maximum residential rate and 6 at maximum business rates. Cuts win back 30% of that. |
| `fiscal` | Finance stages and debt | Stress starts at 3 months of debt and severe stress at 9. Interest is 1.2% per month, capped at 30% of revenue. Service and maintenance funding falls to 85% under stress and 60% under severe stress. Policies run at half effect under severe stress. |
| `ageing` | Rising asset upkeep | +1.2% per year of age, up to +45%. |
| `economy` | The national cycle | An 11-year business cycle (±7%) plus a 4.3-year cycle (±3%). Fuel prices move against the cycle and rise slowly over the long term. All of it is derived from the seed and the day. |

Other rules changed in code rather than through constants:
- Substations share the load of the tiles they jointly cover (`distributeSubstationLoad`).
- Underfunded upkeep wears assets down to a condition proportional to the funding, instead of to zero (`maintainedCondition`).
- Policies are priced per unit of their basis (`policyUnits`).

## Balance harness

`tools/balance/` drives the real simulation headlessly. It uses only public player actions.
- `bot.ts` defines the archetype players: starting, balanced, low-tax, high-service, industrial, commercial, dense, sprawl, car and transit.
- `run.ts` records monthly metrics.
- `exp.ts` takes a year-8 city and applies one change to it.
- `shock.ts` applies a shock and compares the result against an unshocked control run.

To build and run:

```bash
bash tools/balance/build.sh                                   # bundles dist/*.mjs (not committed)
cd tools/balance && node dist/run.mjs balanced 20 731          # strategy, years, seed → out/
node dist/exp.mjs tax-high 8 8 731                             # variant, base years, run years, seed
node dist/shock.mjs 731 8 6 > out/shock-731.json               # seed, warm-up years, years after
node report.mjs before=<dir> after=<dir> --years 5,20,50       # Markdown tables
```

Each run is deterministic for a given seed and code version. A 50-year run takes about 5–20 minutes in Node.
