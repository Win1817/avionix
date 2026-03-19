package com.avionix.fdps.service;

import com.avionix.fdps.dto.FlightDtos.*;
import com.avionix.fdps.model.Flight;
import com.avionix.fdps.model.Flight.FlightStatus;
import com.avionix.fdps.repository.FlightRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class FlightService {

    private final FlightRepository flightRepo;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    private static final double EARTH_RADIUS_NM = 3440.065;
    private static final double MIN_HORIZONTAL_NM = 5.0;
    private static final int    MIN_VERTICAL_FT   = 1000;

    // ─── CRUD ────────────────────────────────────────────────────────────────

    @Transactional
    public FlightResponse filePlan(FlightPlanRequest req) {
        Flight flight = Flight.builder()
            .callsign(req.getCallsign())
            .aircraftType(req.getAircraftType())
            .aircraftRegistration(req.getAircraftRegistration())
            .departureAirport(req.getDepartureAirport())
            .destinationAirport(req.getDestinationAirport())
            .departureTime(req.getDepartureTime())
            .cruiseAltitude(req.getCruiseAltitude())
            .cruiseSpeed(req.getCruiseSpeed())
            .flightRules(req.getFlightRules())
            .operatorIcao(req.getOperatorIcao())
            .status(FlightStatus.FILED)
            .build();

        flight = flightRepo.save(flight);
        log.info("Flight plan filed: {} (id={})", flight.getCallsign(), flight.getId());

        // Publish to Kafka
        kafkaTemplate.send("avionix.flights.filed", flight.getCallsign(),
            Map.of("id", flight.getId(), "callsign", flight.getCallsign(),
                   "status", flight.getStatus(), "ts", flight.getCreatedAt()));

        return toResponse(flight);
    }

    @Transactional(readOnly = true)
    public Page<FlightResponse> listFlights(FlightStatus status, String sectorId, Pageable pageable) {
        Page<Flight> page = (sectorId != null)
            ? flightRepo.findByStatusAndSectorId(status, sectorId, pageable)
            : flightRepo.findByStatus(status, pageable);
        return page.map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public FlightResponse getFlight(UUID id) {
        return flightRepo.findById(id)
            .map(this::toResponse)
            .orElseThrow(() -> new NoSuchElementException("Flight not found: " + id));
    }

    @Transactional
    public FlightResponse updateFlight(UUID id, FlightUpdateRequest req) {
        Flight flight = flightRepo.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Flight not found: " + id));

        if (req.getCruiseAltitude() != null) flight.setCruiseAltitude(req.getCruiseAltitude());
        if (req.getCruiseSpeed()    != null) flight.setCruiseSpeed(req.getCruiseSpeed());
        if (req.getDestinationAirport() != null) flight.setDestinationAirport(req.getDestinationAirport());
        if (req.getStatus()         != null) flight.setStatus(req.getStatus());

        flight = flightRepo.save(flight);
        log.info("Flight updated: {} status={}", flight.getCallsign(), flight.getStatus());
        return toResponse(flight);
    }

    @Transactional
    public FlightResponse assignSector(UUID id, SectorAssignRequest req) {
        Flight flight = flightRepo.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Flight not found: " + id));
        flight.setSectorId(req.getSectorId());
        if (req.getControllerId() != null) flight.setAssignedControllerId(req.getControllerId());
        return toResponse(flightRepo.save(flight));
    }

    // ─── CONFLICT DETECTION ──────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public ConflictResult checkConflict(ConflictCheckRequest req) {
        Flight f1 = flightRepo.findById(req.getFlightId1())
            .orElseThrow(() -> new NoSuchElementException("Flight 1 not found"));
        Flight f2 = flightRepo.findById(req.getFlightId2())
            .orElseThrow(() -> new NoSuchElementException("Flight 2 not found"));

        // Positions would come from surveillance; use cruise alt as proxy
        double hSep = 0.0; // Would compute from surveillance_reports in prod
        int vSep = Math.abs(
            Optional.ofNullable(f1.getCruiseAltitude()).orElse(0) -
            Optional.ofNullable(f2.getCruiseAltitude()).orElse(0));

        boolean conflict = hSep < MIN_HORIZONTAL_NM && vSep < MIN_VERTICAL_FT;

        return ConflictResult.builder()
            .flight1(f1.getCallsign())
            .flight2(f2.getCallsign())
            .horizontalSeparationNM(hSep)
            .verticalSeparationFt(vSep)
            .requiredHorizontalNM(MIN_HORIZONTAL_NM)
            .requiredVerticalFt(MIN_VERTICAL_FT)
            .hasConflict(conflict)
            .build();
    }

    // ─── TRAJECTORY ───────────────────────────────────────────────────────────

    public List<Map<String, Object>> calculateTrajectory(UUID id, int horizonMinutes) {
        Flight flight = flightRepo.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Flight not found: " + id));

        List<Map<String, Object>> points = new ArrayList<>();
        for (int i = 0; i <= horizonMinutes; i++) {
            double progress = (double) i / horizonMinutes;
            points.add(Map.of(
                "time",      java.time.Instant.now().plusSeconds(i * 60L),
                "lat",       14.5 + progress * 3.0,   // simplified
                "lon",       121.0 + progress * 5.0,
                "altitude",  flight.getCruiseAltitude() != null ? flight.getCruiseAltitude() : 35000,
                "speed",     flight.getCruiseSpeed()    != null ? flight.getCruiseSpeed()    : 450,
                "uncertaintyRadiusNm", 0.5 + progress * 4.5
            ));
        }
        log.debug("Trajectory calculated for {} — {} points", flight.getCallsign(), points.size());
        return points;
    }

    // ─── HELPERS ─────────────────────────────────────────────────────────────

    private FlightResponse toResponse(Flight f) {
        return FlightResponse.builder()
            .id(f.getId()).callsign(f.getCallsign()).aircraftType(f.getAircraftType())
            .departureAirport(f.getDepartureAirport()).destinationAirport(f.getDestinationAirport())
            .departureTime(f.getDepartureTime()).cruiseAltitude(f.getCruiseAltitude())
            .cruiseSpeed(f.getCruiseSpeed()).status(f.getStatus()).flightRules(f.getFlightRules())
            .operatorIcao(f.getOperatorIcao()).sectorId(f.getSectorId())
            .createdAt(f.getCreatedAt()).updatedAt(f.getUpdatedAt())
            .build();
    }

    public static double distanceNM(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat/2)*Math.sin(dLat/2)
            + Math.cos(Math.toRadians(lat1))*Math.cos(Math.toRadians(lat2))
            * Math.sin(dLon/2)*Math.sin(dLon/2);
        return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
}
