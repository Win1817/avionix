# AVIONIX — Glossary

> Aviation terminology, ATC-specific concepts, and AVIONIX system-specific terms.  
> Alphabetically ordered.

---

## A

**ADS-B** (Automatic Dependent Surveillance-Broadcast)  
A surveillance technology where an aircraft determines its position using GPS and periodically broadcasts it. AVIONIX ingests ADS-B data via `data-ingest-service` in JSON format (dump1090/VRS) and publishes it to Kafka.

**ADS-C** (Automatic Dependent Surveillance-Contract)  
A variant of ADS-B used primarily in oceanic airspace where radar coverage is unavailable. The aircraft reports position on a contract basis (periodic, on-demand, or on event).

**AIDC** (ATS Inter-facility Data Communications)  
An ICAO standard for digital coordination between adjacent ATC units. Used for automatic handoff of flight data across FIR boundaries.

**APW** (Airspace Penetration Warning)  
A safety alert generated when an aircraft is predicted to enter restricted, danger, or prohibited airspace. One of the alert types in `snet-service`.

**ASTERIX** (All Purpose Structured Eurocontrol Surveillance Information Exchange)  
A binary data format standard used for exchanging radar surveillance data between ATC systems. AVIONIX ingests ASTERIX CAT021 (ADS-B) and CAT048 (SSR) via the `data-ingest-service`.

**ATC** (Air Traffic Control)  
The service provided by ground-based controllers to direct aircraft safely and efficiently through controlled airspace and on the ground.

**ATCO** (Air Traffic Control Officer)  
A licensed controller responsible for the separation of aircraft. In AVIONIX, an ATCO holds the `ATC_CONTROLLER` role.

**ATS** (Air Traffic Services)  
A general term encompassing ATC, flight information service, and alerting service.

---

## B

**Bearing**  
The direction of travel of an aircraft measured in degrees from true north (0–360°). Also called track angle or heading (though strictly different in the presence of wind).

---

## C

**Callsign**  
A unique identifier for a flight, typically consisting of the airline ICAO designator followed by a flight number (e.g., PAL101 = Philippine Airlines flight 101). In AVIONIX, callsigns must match the pattern `[A-Z]{3}\d{1,4}[A-Z]{0,2}`.

**Ceiling**  
The altitude of the lowest cloud layer covering more than half the sky (BKN or OVC). Reported in feet AGL (Above Ground Level) in METAR reports.

**Clearance**  
An ATC authorization for an aircraft to proceed under specified conditions. In AVIONIX, clearances are issued via `coordination-service` and typed as ROUTE, ALTITUDE, SPEED, APPROACH, DEPARTURE, TAXI, or PUSHBACK.

**CLAM** (Cleared Level Adherence Monitor)  
A safety net that monitors whether an aircraft maintains its cleared altitude. Alerts when deviation is detected.

**Coordination**  
The process by which control of a flight is transferred from one ATC sector or unit to another. Managed in AVIONIX by `coordination-service`.

**CWP** (Controller Working Position)  
The primary interface used by an air traffic controller, consisting of a radar scope, flight strip display, and alert panel. In AVIONIX, the CWP is the main frontend page at `/cwp`.

---

## D

**Dead Reckoning**  
Estimating a future position based on a known current position, speed, and heading — without external reference. The basis of AVIONIX's kinematic trajectory model.

**DEW** (Dewpoint)  
The temperature to which air must be cooled for water vapor to condense into dew. Reported in METAR as `T°/DP°`.

---

## E

**ENROUTE**  
Phase of flight between departure and approach. The enroute separation minimum in AVIONIX is 5 NM horizontal or 1,000 ft vertical (ICAO standard).

---

## F

**FDPS** (Flight Data Processing System)  
The ATC system that processes, manages, and distributes flight plan data. In AVIONIX, `fdps-service` is the implementation.

**FIR** (Flight Information Region)  
A defined airspace within which flight information service and alerting service are provided. Example: RPHI = Manila FIR (Philippines).

**FIXM** (Flight Information Exchange Model)  
An ICAO data exchange standard for sharing flight data between ATC systems. AVIONIX supports FIXM 4.3 JSON format for flight plan ingestion.

**FL** (Flight Level)  
Altitude expressed in hundreds of feet, based on standard atmospheric pressure (1013.25 hPa / 29.92 inHg). FL350 = 35,000 ft pressure altitude.

**Frequency**  
The radio frequency a controller uses to communicate with aircraft. Not yet integrated in AVIONIX v2.

---

## G

**GRIB2** (GRIdded Binary 2)  
A WMO standard format for gridded meteorological data, including wind data used for trajectory computation. AVIONIX's `MLTrajectoryPredictor` references GRIB2 as the production wind source (simplified in current implementation).

**Ground Speed**  
The actual speed of an aircraft over the ground surface, combining true airspeed with wind effects. Reported in knots. Stored as `ground_speed` in `surveillance_reports`.

---

## H

**Handoff**  
The formal transfer of responsibility for a flight from one controller/sector to another. The handoff lifecycle in AVIONIX: PENDING → ACCEPTED → TRANSFERRED.

**Heading**  
The direction an aircraft's nose is pointing, measured in degrees from magnetic north. Not the same as track (ground track) in the presence of crosswind.

**HLLL** (Horizontal Level / Lateral Level)  
Common ATC shorthand combining horizontal and lateral separation assessment.

---

## I

**ICAO** (International Civil Aviation Organization)  
The United Nations agency setting international standards for civil aviation. AVIONIX follows ICAO standards for separation minima, alert types, and data formats.

**IFR** (Instrument Flight Rules)  
Rules governing aircraft operations in conditions of reduced visibility, relying on cockpit instruments rather than visual reference. In AVIONIX, `flight_rules='I'` denotes IFR.

---

## J

**JWT** (JSON Web Token)  
A compact, signed token used to transmit authentication claims. In AVIONIX, Keycloak issues RS256-signed JWTs that are validated by every service via the JWKS endpoint.

**JWKS** (JSON Web Key Set)  
A set of public keys used to verify JWT signatures. AVIONIX services fetch Keycloak's JWKS and cache it for 10 minutes.

---

## K

**Kafka**  
Apache Kafka — the distributed event streaming backbone of AVIONIX. All ADS-B positions and flight events are published to Kafka topics before being consumed by downstream services.

**Keycloak**  
Open-source Identity and Access Management (IAM) solution by Red Hat. AVIONIX uses Keycloak for SSO, JWT issuance, and RBAC enforcement.

**Knot (kt)**  
Nautical miles per hour. The standard unit of speed in aviation. 1 kt = 1.852 km/h.

---

## L

**LLWAS** (Low Level Wind Shear Alert System)  
A ground-based system detecting dangerous wind shear near airports. Not yet integrated in AVIONIX (planned as a METAR-derived alert).

---

## M

**METAR** (METeorological Aerodrome Report)  
A standardized format for reporting current meteorological conditions at an airport. Includes wind, visibility, ceiling, temperature, dewpoint, and altimeter setting.

**MLAT** (Multilateration)  
A surveillance technique that determines an aircraft's position by measuring the time difference of arrival of its transponder signal at multiple ground stations. Source type `MLAT` in AVIONIX.

**MSAW** (Minimum Safe Altitude Warning)  
A safety net alert generated when an aircraft descends below a minimum safe altitude for the terrain in the area. Implemented in `snet-service`.

---

## N

**NM** (Nautical Mile)  
A unit of distance equal to 1,852 meters (approximately 1.15 statute miles). The standard horizontal distance unit in ATC. AVIONIX uses NM for all separation calculations.

---

## O

**OLDI** (On-Line Data Interchange)  
A standard for exchanging ATC data between adjacent units (handoffs, estimates, coordination messages). Planned for future implementation in `coordination-service`.

---

## P

**PIREP** (Pilot Report)  
A weather report submitted by a pilot describing in-flight conditions such as turbulence, icing, or winds. Stored in AVIONIX and used by the ML weather hazard model.

**PostGIS**  
A PostgreSQL extension adding geospatial data types and functions. Loaded in AVIONIX for future spatial queries on sector boundaries and position data.

---

## Q

**QNH**  
The altimeter setting adjusted to mean sea level pressure at a specific location. Used to ensure all aircraft in an area measure altitude from the same reference.

---

## R

**RBAC** (Role-Based Access Control)  
An access control model where permissions are assigned to roles, and users are assigned to roles. AVIONIX implements RBAC via Keycloak with 9 defined roles.

**Radar Scope**  
The primary visual display showing aircraft positions, tracks, and labels. In AVIONIX, implemented as an HTML5 `<canvas>` element with a 60fps animation loop.

**RVSM** (Reduced Vertical Separation Minima)  
An airspace designation between FL290 and FL410 where vertical separation is reduced from 2,000 ft to 1,000 ft. AVIONIX supports RVSM separation minima in the `separation_minima` table.

---

## S

**Sector**  
A defined volume of airspace for which a single controller is responsible. In AVIONIX, sectors are managed in the `sectors` table and assigned to controllers via Keycloak claims.

**Separation**  
The maintenance of minimum horizontal or vertical distance between aircraft. AVIONIX enforces ICAO standard minima: 5 NM horizontal or 1,000 ft vertical (enroute).

**SFPL** (Simplified Flight Plan)  
A reduced-information flight plan filed for VFR or simple IFR operations. In AVIONIX, all flight plans filed via the FDPS API are treated as SFPLs.

**SIGMET** (SIGnificant METeorological Information)  
A weather advisory concerning en route weather significant to the safety of aircraft. In AVIONIX, SIGMETs are stored and used by the ML weather hazard model.

**SNET** (Safety Nets)  
A collective term for automated conflict detection and alerting systems (STCA, MSAW, APW). In AVIONIX, `snet-service` is the SNET implementation.

**Squawk**  
A 4-digit octal code (0000–7777) set on an aircraft transponder to identify it on radar. Emergency codes: 7500 (hijack), 7600 (comms failure), 7700 (general emergency).

**SSR** (Secondary Surveillance Radar)  
A radar system that interrogates aircraft transponders to obtain identification and altitude information. AVIONIX supports `SSR_MODE_C` and `SSR_MODE_S` position sources.

**STCA** (Short Term Conflict Alert)  
A safety net alert generated when two aircraft are predicted to violate separation minima within a short time horizon. The primary alert type in AVIONIX's `snet-service`.

---

## T

**TAF** (Terminal Aerodrome Forecast)  
A weather forecast for a specific airport, typically covering a 24–30 hour period. Stored in AVIONIX `tafs` table.

**TTC** (Time to Collision)  
The estimated time before two aircraft would collide if no action is taken. Used in AVIONIX severity classification: CRITICAL < 30s, HIGH < 60s.

**Track Angle**  
The actual direction of movement of an aircraft over the ground, measured in degrees from true north. Stored as `track_angle` in `surveillance_reports`.

**Trajectory (4D)**  
A 4-dimensional prediction of an aircraft's future position: latitude, longitude, altitude (3D) + time (the 4th dimension). Computed by AVIONIX's `MLTrajectoryPredictor` and stored in `trajectories_4d`.

---

## U

**UUID** (Universally Unique Identifier)  
A 128-bit identifier guaranteed to be unique. AVIONIX uses UUIDs (v4, random) for all primary keys to prevent sequential ID enumeration attacks.

---

## V

**VFR** (Visual Flight Rules)  
Rules governing aircraft operations in conditions of sufficient visibility to navigate visually. In AVIONIX, `flight_rules='V'`.

**VRS** (Virtual Radar Server)  
A popular ADS-B decoding and display software whose JSON output format is supported by AVIONIX's `ADSBParser`.

**Velocity Vector**  
A line on the radar scope extending from an aircraft symbol in the direction of travel, its length proportional to the aircraft's speed. Rendered on AVIONIX's canvas radar scope.

---

## W

**WebSocket**  
A full-duplex communication protocol over a single TCP connection. AVIONIX uses WebSockets in `snet-service`, `surveillance-service`, and `api-gateway` for real-time data push to controllers.

**Wind Shear**  
A sudden change in wind speed or direction. Relevant to MSAW and approach safety.

---

## Z

**Zulu Time (Z)**  
UTC (Coordinated Universal Time), the standard time reference in aviation. All timestamps in AVIONIX are stored and displayed in UTC/Zulu.

---

## AVIONIX-Specific Terms

| Term | Definition |
|------|-----------|
| `avionix-net` | Docker network connecting all AVIONIX services |
| `avionix.surveillance.positions` | Kafka topic carrying all position updates |
| `avionix.flights.filed` | Kafka topic for new flight plan events |
| `keycloak-auth.js` | Shared JWT validation middleware used by all services |
| `MLTrajectoryPredictor` | Class in `fdps-service` providing ML-enhanced 4D trajectory |
| `ConflictPredictor` | Logistic regression model in `snet-service` for conflict risk scoring |
| `WorkloadAnalyzer` | Composite scoring model in `analytics-service` for controller workload |
| `WeatherHazardModel` | Gradient boosting model in `weather-service` for hazard prediction |
| `RadarScope` | Canvas-based radar display component in the frontend CWP |
| `FlightStrips` | ATC-style flight data strip list in the frontend CWP sidebar |
| CWP | Controller Working Position — the primary frontend view (`/cwp`) |
| FIR default | RPHI (Manila FIR) — the default map center configured in `uiSlice` |
