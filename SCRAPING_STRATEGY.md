# Scraping Strategy - Best Plane Tickets Scraper

## Overview

This Actor finds the cheapest plane tickets by comparing direct routes with alternative routing options that use intermediate cities. It scrapes Trip.com (https://tw.trip.com/flights/) to find the best flight combinations.

**Strategy:** Compare direct flights (MDC → TC) with multi-leg alternatives (MDC → ADC → TC) to find hidden cheap combinations.

---

## User Input Parameters

### Required Inputs

| Parameter                          | Type          | Description                                     | Example                        |
| ---------------------------------- | ------------- | ----------------------------------------------- | ------------------------------ |
| `mainDepartureCity` (MDC)          | String        | Primary departure city/airport                  | `TPE` (Taipei)                 |
| `targetCity` (TC)                  | String        | Final destination city/airport                  | `NRT` (Tokyo)                  |
| `alternativeDepartureCities` (ADC) | Array[String] | Intermediate cities to check for cheaper routes | `['HKG', 'ICN']`               |
| `class`                            | Enum          | Cabin class                                     | `Economy`, `Business`, `First` |
| `numberOfPeople`                   | Integer       | Number of passengers                            | `2`                            |
| `timePeriods`                      | Array[Object] | Travel date ranges                              | See below                      |

**Time Period Object Structure:**

```json
{
    "outboundDateStart": "2025-12-10",
    "outboundDateEnd": "2025-12-12",
    "inboundDateStart": "2025-12-17",
    "inboundDateEnd": "2025-12-19"
}
```

_Note: Each time period defines a date range for departure from MDC and return to MDC. The scraper will search all date combinations within these ranges._

### Optional Inputs

| Parameter             | Type        | Default | Description                                                                                  |
| --------------------- | ----------- | ------- | -------------------------------------------------------------------------------------------- |
| `airlines`            | Array[Enum] | `null`  | Filter by specific airlines - applies to ALL flight legs (e.g., `['EVA', 'China Airlines']`) |
| `targetLowestPrice`   | Boolean     | `true`  | Whether to sort results by price (lowest first)                                              |
| `transferTimeHours`   | Integer     | `3`     | Minimum hours required between connecting flights                                            |
| `adcBufferHours`      | Integer     | `24`    | Hours buffer for ADC→TC leg (search ±N hours from MDC departure/return)                      |
| `maxRequestsPerCrawl` | Integer     | `1000`  | Limit total requests                                                                         |

---

## Scraping Approach

### Phase 1: Direct Routes (MDC → TC)

Search for direct round-trip flights from Main Departure City to Target City.

**For each time period:**

1. Generate all date combinations within the range:
    - Outbound dates: from `outboundDateStart` to `outboundDateEnd`
    - Inbound dates: from `inboundDateStart` to `inboundDateEnd`
2. For each date combination:
    - Navigate to: `https://tw.trip.com/flights/`
    - Input search parameters:
        - From: MDC
        - To: TC
        - Outbound date: specific date from range
        - Inbound date: specific date from range
        - Class: user-specified
        - Passengers: user-specified
    - Extract all available flight combinations

**Route Label:** `DIRECT_ROUTE`

### Phase 2: Alternative Routes via ADC (MDC → ADC → TC)

For each Alternative Departure City, search for two-leg combinations.

**For each ADC and each time period:**

#### Step 2A: Search MDC ↔ ADC round trips

1. For each date in outbound range (`outboundDateStart` to `outboundDateEnd`):
    - Search MDC → ADC one-way flights
2. For each date in inbound range (`inboundDateStart` to `inboundDateEnd`):
    - Search ADC → MDC one-way flights
3. Store results for pairing

**Route Label:** `MDC_ADC_LEG`

#### Step 2B: Search ADC ↔ TC round trips with buffer

**Important:** ADC→TC timing is constrained by when you arrive/leave ADC:

1. For **outbound** ADC → TC:
    - Based on each MDC → ADC arrival date
    - Search ADC → TC flights on: **same day, +1 day** from ADC arrival
2. For **inbound** TC → ADC:
    - Based on each ADC → MDC departure date
    - Search TC → ADC flights on: **same day, -1 day** from ADC departure

_Example: If MDC→ADC arrives Dec 10, search ADC→TC for Dec 10-11. If ADC→MDC departs Dec 17, search TC→ADC for Dec 16-17._

**Route Label:** `ADC_TC_LEG`

#### Step 2C: Pair Compatible Flights

Match flights within the same time period that satisfy transfer time requirements:

**Outbound Journey (MDC → ADC → TC):**

```
MDC → ADC arrival time + transferTimeHours <= ADC → TC departure time
```

**Inbound Journey (TC → ADC → MDC):**

```
TC → ADC arrival time + transferTimeHours <= ADC → MDC departure time
```

**Important:** All 4 legs must be within the same time period (no cross-period combinations).

**Route Label:** `ALTERNATIVE_ROUTE`

---

## Data Extraction Schema

### Direct Route Output

```typescript
{
    routeType: "DIRECT",
    departureCity: "MDC",
    targetCity: "TC",
    totalPrice: number,
    totalTimeHours: number,
    totalFlights: 2, // outbound + inbound

    outboundFlight: {
        departureAirport: string,
        departureTime: string, // ISO 8601
        arrivalAirport: string,
        arrivalTime: string,
        airlines: string[], // e.g., ["EVA Air"]
        flightNumbers: string[], // e.g., ["BR189"]
        durationMinutes: number
    },

    inboundFlight: {
        departureAirport: string,
        departureTime: string,
        arrivalAirport: string,
        arrivalTime: string,
        airlines: string[],
        flightNumbers: string[],
        durationMinutes: number
    },

    timePeriod: {
        outboundDate: string,  // Actual selected date
        inboundDate: string    // Actual selected date
    },

    searchedRange: {
        outboundDateStart: string,
        outboundDateEnd: string,
        inboundDateStart: string,
        inboundDateEnd: string
    }
}
```

### Alternative Route Output

```typescript
{
    routeType: "ALTERNATIVE",
    departureCity: "MDC",
    intermediateCity: "ADC",
    targetCity: "TC",
    totalPrice: number,
    totalTimeHours: number,
    totalFlights: 4, // MDC→ADC, ADC→TC, TC→ADC, ADC→MDC

    flight1_MDC_to_ADC: {
        departureAirport: string,
        departureTime: string,
        arrivalAirport: string,
        arrivalTime: string,
        airlines: string[],
        flightNumbers: string[],
        durationMinutes: number
    },

    flight2_ADC_to_TC: {
        departureAirport: string,
        departureTime: string,
        arrivalAirport: string,
        arrivalTime: string,
        airlines: string[],
        flightNumbers: string[],
        durationMinutes: number
    },

    transferTime1Hours: number, // Time between flight1 and flight2

    flight3_TC_to_ADC: {
        departureAirport: string,
        departureTime: string,
        arrivalAirport: string,
        arrivalTime: string,
        airlines: string[],
        flightNumbers: string[],
        durationMinutes: number
    },

    flight4_ADC_to_MDC: {
        departureAirport: string,
        departureTime: string,
        arrivalAirport: string,
        arrivalTime: string,
        airlines: string[],
        flightNumbers: string[],
        durationMinutes: number
    },

    transferTime2Hours: number, // Time between flight3 and flight4

    timePeriod: {
        mdcDepartureDate: string,   // Actual MDC departure date
        mdcReturnDate: string,      // Actual MDC return date
        adcToTcDate: string,        // Actual ADC→TC departure date
        tcToAdcDate: string         // Actual TC→ADC departure date
    },

    searchedRange: {
        outboundDateStart: string,
        outboundDateEnd: string,
        inboundDateStart: string,
        inboundDateEnd: string
    }
}
```

---

## Page Types & Selectors (Trip.com)

### 1. Search Form Page

**URL:** `https://tw.trip.com/flights/`
**Label:** `SEARCH_FORM`

**Actions:**

- Fill departure city
- Fill arrival city
- Select dates
- Select class
- Select number of passengers
- Submit search

**Selectors (to be determined):**

```typescript
// Will be updated after inspecting actual page
from: 'input[placeholder*="出發城市"]',
to: 'input[placeholder*="目的地"]',
date: '.date-picker',
class: '.cabin-class-select',
passengers: '.passenger-count',
search: 'button.search-btn'
```

### 2. Flight Results/Listing Page

**URL:** `https://tw.trip.com/flights/[route]/[dates]`
**Label:** `FLIGHT_RESULTS`

**Data to Extract:**

- Flight cards (all available combinations)
- Price for each option
- Flight details (times, airlines, numbers)
- Duration information

**Selectors (to be determined):**

```typescript
flightCard: '.flight-item',
price: '.price-box .price',
outbound: '.segment.outbound',
inbound: '.segment.inbound',
departureTime: '.departure-time',
arrivalTime: '.arrival-time',
airline: '.airline-name',
flightNumber: '.flight-number',
duration: '.duration'
```

### 3. Flight Detail Modal/Page

**Label:** `FLIGHT_DETAIL`

**Actions:**

- Extract detailed flight information if needed
- Verify pricing
- Check baggage allowance

---

## Routing Logic

### Router Structure

```typescript
import { createPlaywrightRouter } from 'crawlee';

export const router = createPlaywrightRouter();

// 1. Fill search form and submit
router.addHandler('SEARCH_FORM', async ({ page, request }) => {
    // Fill form with search criteria
    // Submit and wait for results
    // Enqueue results page with label 'FLIGHT_RESULTS'
});

// 2. Extract flight results
router.addHandler('FLIGHT_RESULTS', async ({ page, request }) => {
    // Extract all flight options
    // Parse flight details
    // Save to dataset
});

// 3. Handle detail pages if needed
router.addHandler('FLIGHT_DETAIL', async ({ page, request }) => {
    // Extract detailed information
});
```

---

## Algorithm: Flight Pairing Logic

### Pairing Algorithm for Alternative Routes

```typescript
function pairAlternativeFlights(
    mdcToAdcFlights: Flight[], // Filtered by date range
    adcToTcFlights: Flight[], // Searched with ±1 day buffer
    tcToAdcFlights: Flight[], // Searched with ±1 day buffer
    adcToMdcFlights: Flight[], // Filtered by date range
    transferTimeHours: number,
    allowedAirlines?: string[], // If specified, all legs must comply
): AlternativeRoute[] {
    const validPairs: AlternativeRoute[] = [];

    // Helper: Check if all flights use allowed airlines
    const checkAirlines = (flights: Flight[]) => {
        if (!allowedAirlines || allowedAirlines.length === 0) return true;
        return flights.every((f) => f.airlines.every((airline) => allowedAirlines.includes(airline)));
    };

    // Pair outbound legs (MDC → ADC → TC)
    for (const leg1 of mdcToAdcFlights) {
        for (const leg2 of adcToTcFlights) {
            // Check if ADC→TC is same day or +1 day from MDC→ADC arrival
            const daysDiff = getDaysDifference(leg1.arrivalTime, leg2.departureTime);
            if (daysDiff < 0 || daysDiff > 1) continue;

            const transferTime = (leg2.departureTime - leg1.arrivalTime) / 3600000; // ms to hours

            if (transferTime >= transferTimeHours) {
                // Valid outbound pairing, now find inbound

                for (const leg3 of tcToAdcFlights) {
                    for (const leg4 of adcToMdcFlights) {
                        // Check if TC→ADC is same day or -1 day from ADC→MDC departure
                        const daysDiff2 = getDaysDifference(leg3.arrivalTime, leg4.departureTime);
                        if (daysDiff2 < 0 || daysDiff2 > 1) continue;

                        const transferTime2 = (leg4.departureTime - leg3.arrivalTime) / 3600000;

                        if (transferTime2 >= transferTimeHours) {
                            // Check airline compliance for all 4 legs
                            if (!checkAirlines([leg1, leg2, leg3, leg4])) continue;

                            // Valid complete route
                            validPairs.push({
                                flight1: leg1,
                                flight2: leg2,
                                flight3: leg3,
                                flight4: leg4,
                                totalPrice: leg1.price + leg2.price + leg3.price + leg4.price,
                                transferTime1: transferTime,
                                transferTime2: transferTime2,
                            });
                        }
                    }
                }
            }
        }
    }

    return validPairs;
}

function getDaysDifference(date1: Date, date2: Date): number {
    const day1 = new Date(date1).setHours(0, 0, 0, 0);
    const day2 = new Date(date2).setHours(0, 0, 0, 0);
    return Math.floor((day2 - day1) / 86400000); // ms to days
}
```

---

## Performance Considerations

### Crawler Type

**Use PlaywrightCrawler** - Trip.com likely requires JavaScript rendering for:

- Dynamic flight search forms
- AJAX-loaded results
- Interactive date pickers

### Concurrency Settings

```typescript
{
    maxConcurrency: 2-3, // Low concurrency for browser automation
    maxRequestsPerCrawl: user-defined or 1000,
    requestHandlerTimeoutSecs: 60 // Forms may take time to load
}
```

### Request Calculation

For `n` time periods, `m` alternative cities, and average `d` days per range:

**Direct routes:**

- Searches per period: `d_outbound × d_inbound` (all date combinations)
- Total: `n × d_outbound × d_inbound`

**Alternative routes per ADC:**

- MDC↔ADC: `d_outbound + d_inbound` one-way searches
- ADC↔TC: `d_outbound × 2 + d_inbound × 2` (±1 day buffer for each MDC leg date)
- Total per ADC: `d_outbound × 3 + d_inbound × 3`

**Total for all ADCs:** `n × m × (d_outbound × 3 + d_inbound × 3)`

**Grand Total:** `n × (d_outbound × d_inbound + m × (d_outbound × 3 + d_inbound × 3))`

**Example:**

- 1 time period, 3-day outbound range, 3-day inbound range, 2 ADCs
- Direct: 1 × 3 × 3 = 9 searches
- Alternative: 1 × 2 × (3×3 + 3×3) = 36 searches
- **Total: 45 searches**

---

## Anti-Scraping Measures

### Rate Limiting

- **Delay between searches:** 3-5 seconds
- **Use Apify residential proxies** to avoid IP blocks
- **Rotate sessions** for each search

### Proxy Configuration

```typescript
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'], // Trip.com may block datacenter IPs
    countryCode: 'TW', // Taiwan IPs for tw.trip.com
});
```

### Error Handling

- Retry failed searches (max 3 attempts)
- Handle CAPTCHA if encountered (may require manual intervention)
- Log blocked requests for analysis
- Implement exponential backoff for rate limit errors

---

## Output Sorting & Filtering

### Default Output Order

If `targetLowestPrice: true`:

1. Sort all routes (direct + alternative) by `totalPrice` ascending
2. Include `priceRank` field in output

### Filtering

- Apply airline filter if specified: **ALL flight legs must use only the specified airlines**
    - For direct routes: both outbound and inbound flights
    - For alternative routes: all 4 legs must comply
    - Reject entire route if any leg uses non-approved airline
- Remove invalid pairs (insufficient transfer time)
- Deduplicate identical routes

---

## Data Quality Validation

### Required Fields Check

```typescript
function validateDirectRoute(route: DirectRoute): boolean {
    return !!(
        route.totalPrice &&
        route.outboundFlight.departureTime &&
        route.outboundFlight.arrivalTime &&
        route.inboundFlight.departureTime &&
        route.inboundFlight.arrivalTime
    );
}

function validateAlternativeRoute(route: AlternativeRoute): boolean {
    return !!(
        route.totalPrice &&
        route.flight1_MDC_to_ADC.departureTime &&
        route.flight2_ADC_to_TC.departureTime &&
        route.flight3_TC_to_ADC.departureTime &&
        route.flight4_ADC_to_MDC.departureTime &&
        route.transferTime1Hours >= inputTransferTimeHours &&
        route.transferTime2Hours >= inputTransferTimeHours
    );
}
```

---

## Testing Strategy

### Test Cases

1. **Simple Direct Route**
    - Input: TPE → NRT, single time period
    - Expected: List of direct flights with prices

2. **Single Alternative City**
    - Input: TPE → NRT via HKG, 3-day range each way
    - Expected: Valid paired flights with transfer times, ADC legs within ±1 day buffer

3. **Multiple Time Periods**
    - Input: 3 different date ranges
    - Expected: Results for all periods, no cross-period pairing4. **Multiple ADCs**
    - Input: 2-3 alternative cities
    - Expected: All combinations found and paired

4. **Edge Cases**
    - No valid pairs (transfer time too short)
    - No flights available for date
    - Airline filter eliminates all options

---

## Monitoring & Logs

### Key Metrics

- Total searches performed
- Direct routes found
- Alternative routes generated
- Average price difference (direct vs alternative)
- Success rate per search

### Logging Strategy

```typescript
log.info('Starting direct route search', {
    from: MDC,
    to: TC,
    date: timePeriod,
});

log.info('Found flights', {
    count: flights.length,
    cheapest: Math.min(...prices),
});

log.info('Alternative route paired', {
    via: ADC,
    totalPrice: route.totalPrice,
    savings: directPrice - route.totalPrice,
});
```

---

## Legal & Ethical Considerations

- ✅ Trip.com allows automated searches for personal use
- ✅ Implement reasonable delays between requests
- ✅ Use residential proxies to avoid server overload
- ✅ Don't create fake bookings
- ❌ Don't scrape personal data
- ❌ Don't bypass CAPTCHA at scale
- ⚠️ Review Trip.com's Terms of Service before deployment

---

## Implementation Checklist

- [ ] Create input schema with all parameters
- [ ] Set up PlaywrightCrawler with proxy configuration
- [ ] Implement search form automation
- [ ] Extract flight data from results pages
- [ ] Build flight pairing algorithm
- [ ] Validate transfer times
- [ ] Sort by price
- [ ] Add airline filtering
- [ ] Create output schema
- [ ] Add comprehensive error handling
- [ ] Test with real searches
- [ ] Optimize performance

---

**Last Updated:** November 27, 2025
**Status:** Planning Phase
