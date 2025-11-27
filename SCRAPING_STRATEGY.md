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

### Phase 2: Alternative Routes via ADC (MDC → ADC → TC)

For each Alternative Departure City, search for two-leg combinations.

**For each ADC and each time period:**

#### Step 2A: Search MDC ↔ ADC round trips

1. For each date combination in the range:
    - Outbound: `outboundDateStart` to `outboundDateEnd`
    - Inbound: `inboundDateStart` to `inboundDateEnd`
    - Search MDC ↔ ADC round-trip flights
2. Store results for pairing

#### Step 2B: Search ADC ↔ TC round trips with buffer

**Important:** ADC→TC timing is constrained by when you arrive/leave ADC:

1. For **outbound** ADC → TC:
    - Based on each MDC → ADC arrival date
    - Search ADC → TC flights on: **same day, +1 day** from ADC arrival
2. For **inbound** TC → ADC:
    - Based on each ADC → MDC departure date
    - Search TC → ADC flights on: **same day, -1 day** from ADC departure

_Example: If MDC→ADC arrives Dec 10, search ADC→TC for Dec 10-11. If ADC→MDC departs Dec 17, search TC→ADC for Dec 16-17._

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

    flights: [
        {
            leg: "outbound",
            departureAirport: string,
            departureTime: string, // ISO 8601
            arrivalAirport: string,
            arrivalTime: string,
            flightSegments: [
                {
                    airline: string,      // e.g., "EVA Air"
                    flightNumber: string  // e.g., "BR189"
                }
                // Multiple segments for connecting flights
            ],
            durationMinutes: number
        },
        {
            leg: "inbound",
            departureAirport: string,
            departureTime: string,
            arrivalAirport: string,
            arrivalTime: string,
            flightSegments: [
                {
                    airline: string,
                    flightNumber: string
                }
            ],
            durationMinutes: number
        }
    ],

    timePeriod: {
        outboundDate: string,  // Actual selected date
        inboundDate: string    // Actual selected date
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

    flights: [
        {
            leg: "MDC_to_ADC",
            departureAirport: string,
            departureTime: string,
            arrivalAirport: string,
            arrivalTime: string,
            flightSegments: [
                {
                    airline: string,
                    flightNumber: string
                }
            ],
            durationMinutes: number
        },
        {
            leg: "ADC_to_TC",
            departureAirport: string,
            departureTime: string,
            arrivalAirport: string,
            arrivalTime: string,
            flightSegments: [
                {
                    airline: string,
                    flightNumber: string
                }
            ],
            durationMinutes: number,
            transferTimeHours: number // Time between flight 1 and 2
        },
        {
            leg: "TC_to_ADC",
            departureAirport: string,
            departureTime: string,
            arrivalAirport: string,
            arrivalTime: string,
            flightSegments: [
                {
                    airline: string,
                    flightNumber: string
                }
            ],
            durationMinutes: number
        },
        {
            leg: "ADC_to_MDC",
            departureAirport: string,
            departureTime: string,
            arrivalAirport: string,
            arrivalTime: string,
            flightSegments: [
                {
                    airline: string,
                    flightNumber: string
                }
            ],
            durationMinutes: number,
            transferTimeHours: number // Time between flight 3 and 4
        }
    ],

    timePeriod: {
        outboundDate: string,  // Actual selected date
        inboundDate: string    // Actual selected date
    }
}
```

---

## Page Types & Selectors (Trip.com)

### 1. Search Form Page

**URL:** `https://tw.trip.com/flights/`

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

**Actions:**

- Extract detailed flight information if needed
- Verify pricing

---

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

### Filtering

- Apply airline filter if specified: **ALL flight legs must use only the specified airlines**
    - For direct routes: both outbound and inbound flights
    - For alternative routes: all 4 legs must comply
    - Reject entire route if any leg uses non-approved airline
- Remove invalid pairs (insufficient transfer time)
- Deduplicate identical routes

**Last Updated:** November 27, 2025
**Status:** Planning Phase
