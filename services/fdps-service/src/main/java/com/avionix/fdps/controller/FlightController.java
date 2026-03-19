package com.avionix.fdps.controller;

import com.avionix.fdps.dto.FlightDtos.*;
import com.avionix.fdps.model.Flight.FlightStatus;
import com.avionix.fdps.service.FlightService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/flights")
@RequiredArgsConstructor
@Tag(name = "Flights", description = "Flight Data Processing — flight plans, status, sector assignment")
@SecurityRequirement(name = "bearerAuth")
public class FlightController {

    private final FlightService flightService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "File a new flight plan",
        description = "Creates a new SFPL (Simplified Flight Plan) and publishes a filed event to Kafka")
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Flight plan filed successfully"),
        @ApiResponse(responseCode = "400", description = "Validation error — invalid callsign or airport code"),
        @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
        @ApiResponse(responseCode = "403", description = "Insufficient role")
    })
    public ResponseEntity<com.avionix.fdps.dto.FlightDtos.ApiResponse<FlightResponse>> filePlan(
            @Valid @RequestBody FlightPlanRequest request) {
        FlightResponse response = flightService.filePlan(request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(com.avionix.fdps.dto.FlightDtos.ApiResponse.ok(response, "Flight plan filed"));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','OPERATIONS_MANAGER','SUPER_ADMIN')")
    @Operation(summary = "List active flights",
        description = "Returns paginated list of flights filtered by status and optionally sector")
    public ResponseEntity<com.avionix.fdps.dto.FlightDtos.ApiResponse<Page<FlightResponse>>> listFlights(
            @Parameter(description = "Filter by status", example = "ACTIVE")
            @RequestParam(defaultValue = "ACTIVE") FlightStatus status,
            @Parameter(description = "Filter by sector ID")
            @RequestParam(required = false) String sector,
            @RequestParam(defaultValue = "0")   int page,
            @RequestParam(defaultValue = "100") int size) {
        Page<FlightResponse> flights = flightService.listFlights(
            status, sector, PageRequest.of(page, size, Sort.by("departureTime").descending()));
        return ResponseEntity.ok(com.avionix.fdps.dto.FlightDtos.ApiResponse.ok(flights));
    }

    @GetMapping("/{flightId}")
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','PILOT','SUPER_ADMIN')")
    @Operation(summary = "Get flight details by ID")
    @ApiResponse(responseCode = "404", description = "Flight not found")
    public ResponseEntity<com.avionix.fdps.dto.FlightDtos.ApiResponse<FlightResponse>> getFlight(
            @PathVariable UUID flightId) {
        return ResponseEntity.ok(
            com.avionix.fdps.dto.FlightDtos.ApiResponse.ok(flightService.getFlight(flightId)));
    }

    @PutMapping("/{flightId}")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Update flight plan", description = "Partially update flight — altitude, speed, status, destination")
    public ResponseEntity<com.avionix.fdps.dto.FlightDtos.ApiResponse<FlightResponse>> updateFlight(
            @PathVariable UUID flightId,
            @RequestBody FlightUpdateRequest request) {
        return ResponseEntity.ok(
            com.avionix.fdps.dto.FlightDtos.ApiResponse.ok(
                flightService.updateFlight(flightId, request), "Flight updated"));
    }

    @PostMapping("/{flightId}/assign-sector")
    @PreAuthorize("hasAnyRole('ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Assign flight to sector and controller")
    public ResponseEntity<com.avionix.fdps.dto.FlightDtos.ApiResponse<FlightResponse>> assignSector(
            @PathVariable UUID flightId,
            @Valid @RequestBody SectorAssignRequest request) {
        return ResponseEntity.ok(
            com.avionix.fdps.dto.FlightDtos.ApiResponse.ok(
                flightService.assignSector(flightId, request), "Sector assigned"));
    }

    @PostMapping("/check-conflicts")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Check geometric conflict between two flights",
        description = "Calculates horizontal and vertical separation and compares against ICAO minima")
    public ResponseEntity<com.avionix.fdps.dto.FlightDtos.ApiResponse<ConflictResult>> checkConflict(
            @Valid @RequestBody ConflictCheckRequest request) {
        return ResponseEntity.ok(
            com.avionix.fdps.dto.FlightDtos.ApiResponse.ok(flightService.checkConflict(request)));
    }

    @PostMapping("/{flightId}/trajectory")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Calculate 4D trajectory prediction",
        description = "Generates a kinematic trajectory with uncertainty radius. ML-enhanced in production.")
    public ResponseEntity<com.avionix.fdps.dto.FlightDtos.ApiResponse<List<Map<String, Object>>>> calculateTrajectory(
            @PathVariable UUID flightId,
            @Parameter(description = "Prediction horizon in minutes", example = "20")
            @RequestParam(defaultValue = "20") int horizonMinutes) {
        List<Map<String, Object>> trajectory = flightService.calculateTrajectory(flightId, horizonMinutes);
        return ResponseEntity.ok(
            com.avionix.fdps.dto.FlightDtos.ApiResponse.ok(trajectory, "Trajectory calculated"));
    }
}
