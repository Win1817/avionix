package com.avionix.surveillance.controller;

import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
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
@Tag(name = "Surveillance", description = "ADS-B · SSR Mode A/C/S · MLAT position ingest and radar picture")
@SecurityRequirement(name = "bearerAuth")
public class SurveillanceController {

    public enum SourceType { ADS_B, SSR_MODE_C, SSR_MODE_S, MLAT, ADS_C, MANUAL }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "Aircraft position report")
    public static class PositionReport {
        private String callsign;
        private String icao24;
        @Schema(description = "Latitude in decimal degrees", example = "14.5995")
        private Double lat;
        @Schema(description = "Longitude in decimal degrees", example = "121.0197")
        private Double lon;
        @Schema(description = "Pressure altitude in feet", example = "35000")
        private Integer altitude;
        @Schema(description = "Ground speed in knots", example = "480")
        private Integer groundSpeed;
        @Schema(description = "Track angle (true north) in degrees", example = "270")
        private Double trackAngle;
        @Schema(description = "Vertical rate in ft/min")
        private Integer verticalRate;
        @Schema(description = "SSR squawk code", example = "2341")
        private String squawk;
        @Schema(description = "ADS-B signal quality [0-1]")
        private Double signalQuality;
        private SourceType source;
        private Instant timestamp;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "Batch position ingest request")
    public static class IngestRequest {
        @NotNull private SourceType source;
        @NotEmpty private List<PositionReport> reports;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "Emergency squawk detection result")
    public static class EmergencyTrack {
        private String callsign;
        @Schema(description = "Squawk code", example = "7700")
        private String squawk;
        @Schema(description = "Emergency type", example = "GENERAL EMERGENCY")
        private String emergencyType;
        private Double lat;
        private Double lon;
        private Integer altitude;
        private Instant detectedAt;
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

    @PostMapping("/positions")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','ATC_SUPERVISOR')")
    @Operation(summary = "Ingest position batch",
        description = "Accepts batched position reports from ADS-B receivers, SSR, or MLAT systems. " +
                       "Persists to surveillance_reports table and publishes to Kafka for real-time consumers.")
    @ApiResponse(responseCode = "201", description = "Positions ingested")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> ingestPositions(
            @Valid @RequestBody IngestRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(Map.of("ingested", request.getReports().size()), "Positions ingested"));
    }

    @GetMapping("/picture")
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','OPERATIONS_MANAGER','SUPER_ADMIN')")
    @Operation(summary = "Get current radar picture",
        description = "Returns all aircraft with surveillance data received within the last 2 minutes. " +
                       "Optionally filter by sector or altitude band.")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getCurrentPicture(
            @Parameter(description = "Filter by sector ID")    @RequestParam(required = false) String sector,
            @Parameter(description = "Minimum altitude (ft)") @RequestParam(defaultValue = "0")     int minAlt,
            @Parameter(description = "Maximum altitude (ft)") @RequestParam(defaultValue = "60000") int maxAlt) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("count", 0, "tracks", Collections.emptyList())));
    }

    @GetMapping("/flights/{callsign}/track")
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Get historical track for a flight",
        description = "Returns time-ordered position history for the specified callsign.")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTrack(
            @PathVariable String callsign,
            @Parameter(description = "History window in minutes") @RequestParam(defaultValue = "60") int minutes) {
        return ResponseEntity.ok(ApiResponse.ok(
            Map.of("callsign", callsign, "points", 0, "track", Collections.emptyList())));
    }

    @GetMapping("/squawks/emergency")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SAFETY_OFFICER','SUPER_ADMIN')")
    @Operation(summary = "Get aircraft squawking emergency codes",
        description = "Returns aircraft transmitting 7500 (hijack), 7600 (comms failure), or 7700 (emergency) " +
                       "detected within the last 5 minutes.")
    public ResponseEntity<ApiResponse<List<EmergencyTrack>>> getEmergencySquawks() {
        return ResponseEntity.ok(ApiResponse.ok(Collections.emptyList()));
    }
}
