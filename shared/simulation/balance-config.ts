// Milestone 8.2 balance values. Each group documents the feedback loop it tunes; BALANCE_RETEST.md
// records the before/after evidence. Keep new tuning constants here rather than inline in systems.
export const BALANCE = {
  /** Labour market: migrants tolerate some frictional unemployment, so a full job market does not freeze growth. */
  labour: {
    workforceShare: 0.45,
    /** Share of the workforce that may be unemployed (between jobs) before job-seekers stop arriving. */
    frictionalUnemployment: 0.06,
    /** Maximum daily arrivals as a share of population, scaled by satisfaction. */
    arrivalRate: 0.025,
    /** Unemployment (%) at which newcomers no longer expect to find work; arrivals taper to zero between frictional and this. */
    migrantTolerance: 20,
    /** Shops whose customers fall below this share of capacity shorten hours (to a minimum), cutting wages instead of closing. */
    fullHoursMarket: 0.9, minimumHours: 0.6,
    /** Purchasing-power loss per unit of workforce share lost to shortened hours. */
    underemploymentSpending: 30,
    /** Departures ramp smoothly from these thresholds instead of switching on at a cliff. */
    departureRate: 0.006, satisfactionPush: 42, satisfactionPushRange: 22, unemploymentPush: 35, unemploymentPushRange: 50,
    /** Workers at temporarily flood-closed businesses expect to return, so they do not trigger departures. */
    floodLayoffsCountAsEmployed: true,
    /** Monthly satisfaction readings averaged with today's when residents decide whether to move. */
    moodMonths: 2,
    /** Commuters consider this many nearest employment areas (previously 8, which starved distant employers). */
    commuteDestinations: 14,
  },
  /** Recovery: abandonment follows persistent local problems, not one synchronized shock, and abandoned land can return to use. */
  recovery: {
    /** Days of persistent decline before abandonment; each building adds a deterministic share of the spread. */
    abandonmentDays: 90, abandonmentSpread: 60,
    /** While the city is flooded, decline toward abandonment or closure counts one day in this many. */
    floodDeclineInterval: 4,
    /** Residents of an abandoned home join the displaced pool and look for housing instead of vanishing. */
    rehouseAbandonedResidents: true,
    /** Abandoned shells are cleared after this many days, leaving zoned land for fresh development. */
    clearAbandonedAfter: 240,
    /** Land-value drag from abandoned neighbours is capped; the old uncapped -7 each made dead districts permanent. */
    abandonedNeighbourPenalty: 6, abandonedNeighbourCap: 18,
    /** Redevelopment of abandoned shells no longer needs land value >= 25; attractiveness already includes land value. */
    redevelopmentScore: 46,
    /** Closed firms reopen when their market (customers or workers per job, including their own) reaches this. */
    reopenMarket: 0.55,
    /** Firms expand only if the market would still support them afterwards (customers or workers per job). */
    expansionMarket: 0.85,
  },
  /** Rain arrives in spells: a heavy or extreme peak tapers to lighter rain rather than repeating the peak for a week. */
  weather: {
    stormDecay: 0.55, lightRain: 8,
    /** Flood memory fades (half-life about a year) instead of a permanent lifetime counter penalizing land forever. */
    floodMemoryDecay: 1 / 500,
    /** Nearby vegetation and wetland absorb runoff; development that removes them raises local flood depth. */
    greenDischarge: 0.7, greenDischargeCap: 7,
    /** City flood severity: shares of developed parcels in the given stage. */
    severity: { significantShare: 0.04, severeShare: 0.12, severeMajorShare: 0.04 },
  },
  /** Taxes: collection falls as rates rise above the base (avoidance and informality), and investment responds. */
  taxes: {
    complianceLoss: 0.4, complianceExponent: 1.4,
    /** Demand response per unit of tax pressure; higher taxes deter more than lower taxes attract. */
    demandPenalty: 30, demandBonus: 14,
    /** Share of the above-base tax that firms bear as a cost after shifting part to customers. */
    businessIncidence: 1.6,
  },
  /** Municipal finance stages and bounded debt service. */
  fiscal: {
    /** Months of expenses: debt beyond this is severe fiscal stress. */
    stressMonths: 3, severeMonths: 9,
    /** Monthly interest on overdraft debt, capped as a share of revenue so recovery remains possible. */
    interestRate: 0.012, interestRevenueCap: 0.3,
    /** Satisfaction effect of delayed contractor and staff payments. */
    stressSatisfaction: 2, severeSatisfaction: 6,
    /** Service and maintenance funding available under each stage (share of chosen funding). */
    deficitFunding: 1, stressFunding: 0.85, severeFunding: 0.6,
    /** Policies run at reduced effect while the city cannot pay for them. */
    severePolicyEffect: 0.5,
  },
  /** Ageing assets cost more to keep in service; mature cities face rising maintenance. */
  ageing: { yearlyGrowth: 0.012, maximum: 0.45 },
  /** A slow, deterministic national economic cycle: business demand and fuel prices move over decades. */
  economy: { cycleYears: 11, cycleAmplitude: 0.07, shortYears: 4.3, shortAmplitude: 0.03, fuelAmplitude: 0.22, fuelTrendPerYear: 0.006, fuelTrendMaximum: 0.3 },
} as const;
