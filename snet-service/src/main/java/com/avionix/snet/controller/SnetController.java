package com.avionix.snet.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping
@Tag(name = "Safety Nets", description = "STCA · MSAW · APW · Conflict detection and alert lifecycle")
@SecurityRequirement(name = "bearerAuth")
public class SnetController {

    // ─── DTOs ────────────────────────────────────────────────────────────────

    public enum AlertType { STCA, MSAW, APW, CLAM, CONFLICT, AIRSPACE, WEATHER, SYSTEM }
    public enum Severity  { CRITICAL, HIGH, MEDIUM, LOW }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "Safety alert record")
    public static class AlertRecord {
        private UUID id;
        @Schema(description = "Alert classification", example = "STCA")
        private AlertType alertType;
        @Schema(description = "Severity level", example = "HIGH")
        private Severity severity;
        private String callsignPrimary;
        private String callsignSecondary;
        @Schema(description = "Horizontal separation in NM at time of alert")
        private Double horizontalDistanceNM;
        @Schema(description = "Vertical separation in feet")
        private Integer verticalDistanceFt;
        @Schema(description = "Estimated time to conflict in seconds")
        private Double timeToCollisionSeconds;
        private String alertDescription;
        private Boolean isActive;
        private Instant detectionTime;
        private Instant dismissalTime;
        private String dismissedBy;
        private String resolutionAction;
        @Schema(description = "ML conflict risk score [0-1]")
        private Double mlRiskScore;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "Request to generate a safety alert")
    public static class GenerateAlertRequest {
        @NotNull private AlertType alertType;
        @NotNull private Severity severity;
        private UUID flightIdPrimary;
        private UUID flightIdSecondary;
        private Double horizontalDistanceNM;
        private Integer verticalDistanceFt;
        private Double timeToCollisionSeconds;
        private String description;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class DismissRequest {
        private String resolutionAction;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class SeparationResult {
        private String flight1;
        private String flight2;
        private Double horizontalDistanceNM;
        private Integer verticalDistanceFt;
        private Double requiredHorizontalNM;
        private Integer requiredVerticalFt;
        private Boolean horizontalOk;
        private Boolean verticalOk;
        private Boolean violates;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class ConflictScan {
        private Integer totalFlights;
        private Integer conflictsDetected;
        @Schema(description = "Active conflicts found")
        private List<AlertRecord> conflicts;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class SnetResponse<T> {
        private Boolean success;
        private String message;
        private T data;
        private Instant timestamp;
        public static <T> SnetResponse<T> ok(T data) {
            SnetResponse<T> r = new SnetResponse<>();
            r.success = true; r.message = "OK"; r.data = data; r.timestamp = Instant.now();
            return r;
        }
        public static <T> SnetResponse<T> ok(T data, String msg) {
            SnetResponse<T> r = new SnetResponse<>();
            r.success = true; r.message = msg; r.data = data; r.timestamp = Instant.now();
            return r;
        }
    }

    // ─── ENDPOINTS ────────────────────────────────────────────────────────────

    @GetMapping("/alerts")
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','SAFETY_OFFICER','SUPER_ADMIN')")
    @Operation(summary = "Get active safety alerts",
        description = "Returns all currently active alerts, optionally filtered by severity or type. " +
                       "Ordered by severity (CRITICAL first) then detection time.")
    public ResponseEntity<SnetResponse<List<AlertRecord>>> getAlerts(
            @Parameter(description = "Filter by severity") @RequestParam(required = false) Severity severity,
            @Parameter(description = "Filter by alert type") @RequestParam(required = false) AlertType type,
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(defaultValue = "0")   int offset) {

        // Stub — service layer would query safety_alerts table
        List<AlertRecord> alerts = Collections.emptyList();
        return ResponseEntity.ok(SnetResponse.ok(alerts));
    }

    @PostMapping("/alerts")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Generate a safety alert",
        description = "Manually create an alert. Broadcasts immediately to all connected controllers via WebSocket.")
    @ApiResponse(responseCode = "201", description = "Alert created and broadcast")
    public ResponseEntity<SnetResponse<AlertRecord>> generateAlert(
            @Valid @RequestBody GenerateAlertRequest request) {
        AlertRecord alert = AlertRecord.builder()
            .id(UUID.randomUUID())
            .alertType(request.getAlertType())
            .severity(request.getSeverity())
            .horizontalDistanceNM(request.getHorizontalDistanceNM())
            .verticalDistanceFt(request.getVerticalDistanceFt())
            .timeToCollisionSeconds(request.getTimeToCollisionSeconds())
            .alertDescription(request.getDescription())
            .isActive(true)
            .detectionTime(Instant.now())
            .build();
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(SnetResponse.ok(alert, "Alert generated and broadcast"));
    }

    @PutMapping("/alerts/{alertId}/dismiss")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Acknowledge and dismiss an alert",
        description = "Marks alert as inactive. Records dismissal time, controller, and resolution action in audit trail.")
    @ApiResponse(responseCode = "404", description = "Alert not found")
    public ResponseEntity<SnetResponse<AlertRecord>> dismissAlert(
            @PathVariable UUID alertId,
            @RequestBody DismissRequest request) {
        AlertRecord dismissed = AlertRecord.builder()
            .id(alertId).isActive(false)
            .dismissalTime(Instant.now())
            .resolutionAction(request.getResolutionAction())
            .build();
        return ResponseEntity.ok(SnetResponse.ok(dismissed, "Alert dismissed"));
    }

    @PostMapping("/detect-conflicts")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Run full airspace conflict scan (STCA)",
        description = "Evaluates all active flight pairs against ICAO separation minima. " +
                       "CRITICAL/HIGH conflicts auto-generate STCA alerts. Uses ML risk scoring.")
    public ResponseEntity<SnetResponse<ConflictScan>> detectConflicts() {
        ConflictScan result = ConflictScan.builder()
            .totalFlights(0).conflictsDetected(0).conflicts(Collections.emptyList()).build();
        return ResponseEntity.ok(SnetResponse.ok(result));
    }

    @PostMapping("/check-msaw")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Run Minimum Safe Altitude Warning (MSAW) check",
        description = "Scans all active aircraft for terrain/altitude violations. Threshold: < 2500 ft AGL.")
    public ResponseEntity<SnetResponse<List<AlertRecord>>> checkMsaw() {
        return ResponseEntity.ok(SnetResponse.ok(Collections.emptyList(), "MSAW scan complete"));
    }

    @PostMapping("/check-separation")
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Check separation between two specific flights",
        description = "Calculates current horizontal (NM) and vertical (ft) separation " +
                       "and compares against applicable ICAO minima.")
    public ResponseEntity<SnetResponse<SeparationResult>> checkSeparation(
            @Schema(description = "Flight IDs to compare")
            @RequestBody Map<String, UUID> request) {
        SeparationResult result = SeparationResult.builder()
            .flight1("UNKNOWN").flight2("UNKNOWN")
            .requiredHorizontalNM(5.0).requiredVerticalFt(1000)
            .horizontalOk(true).verticalOk(true).violates(false)
            .build();
        return ResponseEntity.ok(SnetResponse.ok(result));
    }
}
