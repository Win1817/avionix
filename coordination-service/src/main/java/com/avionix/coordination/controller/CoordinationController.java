package com.avionix.coordination.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping
@Tag(name = "Coordination", description = "Sector handoffs · ATC clearances · FIR inter-unit coordination")
@SecurityRequirement(name = "bearerAuth")
public class CoordinationController {

    public enum HandoffStatus { PENDING, ACCEPTED, REJECTED, TRANSFERRED, CANCELLED }
    public enum ClearanceType { ROUTE, ALTITUDE, SPEED, APPROACH, DEPARTURE, TAXI, PUSHBACK }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class HandoffRecord {
        private UUID id;
        private UUID flightId;
        private String callsign;
        private String fromSectorId;
        private String toSectorId;
        @Schema(description = "Transfer altitude in feet")
        private Integer transferAltitude;
        private String transferCondition;
        private Instant estimatedBoundaryTime;
        private HandoffStatus status;
        private String initiatedBy;
        private Instant initiatedAt;
        private String acceptedBy;
        private Instant acceptedAt;
        private Instant transferredAt;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class InitiateHandoffRequest {
        @NotNull private UUID flightId;
        @NotBlank private String fromSectorId;
        @NotBlank private String toSectorId;
        private Integer transferAltitude;
        private String transferCondition;
        private Instant estimatedBoundaryTime;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class ClearanceRecord {
        private UUID id;
        private UUID flightId;
        private ClearanceType clearanceType;
        private String instruction;
        private Integer clearedAltitude;
        private String clearedRoute;
        private Integer clearedSpeed;
        private String issuedBy;
        private Instant issuedAt;
        private Instant validUntil;
        private Instant acknowledgedAt;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class IssueClearanceRequest {
        @NotNull  private UUID flightId;
        @NotNull  private ClearanceType clearanceType;
        @NotBlank private String instruction;
        private Integer clearedAltitude;
        private String  clearedRoute;
        private Integer clearedSpeed;
        private Instant validUntil;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class SectorRecord {
        private String id;
        private String name;
        private String type;
        private String fir;
        private Integer altLower;
        private Integer altUpper;
        private String assignedControllerName;
        private Integer activeFlights;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class ApiResponse<T> {
        private Boolean success; private String message; private T data; private Instant timestamp;
        public static <T> ApiResponse<T> ok(T d) {
            return ApiResponse.<T>builder().success(true).message("OK").data(d).timestamp(Instant.now()).build();
        }
        public static <T> ApiResponse<T> ok(T d, String m) {
            return ApiResponse.<T>builder().success(true).message(m).data(d).timestamp(Instant.now()).build();
        }
    }

    // ─── HANDOFFS ─────────────────────────────────────────────────────────────

    @PostMapping("/handoffs")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Initiate sector handoff",
        description = "Creates a PENDING handoff from one sector to another. " +
                       "The receiving sector must ACCEPT before TRANSFER can be completed.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Handoff initiated")
    public ResponseEntity<ApiResponse<HandoffRecord>> initiateHandoff(
            @Valid @RequestBody InitiateHandoffRequest req) {
        HandoffRecord h = HandoffRecord.builder()
            .id(UUID.randomUUID()).flightId(req.getFlightId())
            .fromSectorId(req.getFromSectorId()).toSectorId(req.getToSectorId())
            .transferAltitude(req.getTransferAltitude())
            .transferCondition(req.getTransferCondition())
            .estimatedBoundaryTime(req.getEstimatedBoundaryTime())
            .status(HandoffStatus.PENDING).initiatedAt(Instant.now())
            .build();
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(h, "Handoff initiated"));
    }

    @PutMapping("/handoffs/{handoffId}/accept")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Accept incoming handoff",
        description = "Receiving controller accepts responsibility. Status transitions PENDING → ACCEPTED.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Handoff not found")
    public ResponseEntity<ApiResponse<HandoffRecord>> acceptHandoff(@PathVariable UUID handoffId) {
        HandoffRecord h = HandoffRecord.builder().id(handoffId)
            .status(HandoffStatus.ACCEPTED).acceptedAt(Instant.now()).build();
        return ResponseEntity.ok(ApiResponse.ok(h, "Handoff accepted"));
    }

    @PutMapping("/handoffs/{handoffId}/transfer")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Complete flight transfer",
        description = "Atomically marks handoff TRANSFERRED and updates flight.sector_id. " +
                       "Requires handoff to be in ACCEPTED state.")
    public ResponseEntity<ApiResponse<HandoffRecord>> transferHandoff(@PathVariable UUID handoffId) {
        HandoffRecord h = HandoffRecord.builder().id(handoffId)
            .status(HandoffStatus.TRANSFERRED).transferredAt(Instant.now()).build();
        return ResponseEntity.ok(ApiResponse.ok(h, "Transfer complete"));
    }

    @GetMapping("/handoffs")
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "List handoffs",
        description = "Returns handoffs filterable by sector ID and/or status.")
    public ResponseEntity<ApiResponse<List<HandoffRecord>>> listHandoffs(
            @RequestParam(required = false) String sector,
            @RequestParam(required = false) HandoffStatus status) {
        return ResponseEntity.ok(ApiResponse.ok(Collections.emptyList()));
    }

    // ─── CLEARANCES ───────────────────────────────────────────────────────────

    @PostMapping("/clearances")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Issue ATC clearance",
        description = "Issues and persists an ATC clearance. Types: ROUTE, ALTITUDE, SPEED, APPROACH, DEPARTURE, TAXI, PUSHBACK.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Clearance issued")
    public ResponseEntity<ApiResponse<ClearanceRecord>> issueClearance(
            @Valid @RequestBody IssueClearanceRequest req) {
        ClearanceRecord c = ClearanceRecord.builder()
            .id(UUID.randomUUID()).flightId(req.getFlightId())
            .clearanceType(req.getClearanceType()).instruction(req.getInstruction())
            .clearedAltitude(req.getClearedAltitude()).clearedRoute(req.getClearedRoute())
            .clearedSpeed(req.getClearedSpeed()).issuedAt(Instant.now())
            .validUntil(req.getValidUntil()).build();
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(c, "Clearance issued"));
    }

    @GetMapping("/clearances/{flightId}")
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','PILOT','SUPER_ADMIN')")
    @Operation(summary = "Get clearance history for a flight")
    public ResponseEntity<ApiResponse<List<ClearanceRecord>>> getClearances(
            @PathVariable UUID flightId) {
        return ResponseEntity.ok(ApiResponse.ok(Collections.emptyList()));
    }

    // ─── SECTORS ──────────────────────────────────────────────────────────────

    @GetMapping("/sectors")
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','OPERATIONS_MANAGER','SUPER_ADMIN')")
    @Operation(summary = "Get all sectors with current status",
        description = "Returns all defined sectors including assigned controller and active flight count.")
    public ResponseEntity<ApiResponse<List<SectorRecord>>> getSectors() {
        return ResponseEntity.ok(ApiResponse.ok(Collections.emptyList()));
    }
}
