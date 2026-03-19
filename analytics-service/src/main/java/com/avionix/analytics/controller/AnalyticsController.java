package com.avionix.analytics.controller;

import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping
@Tag(name = "Analytics", description = "Real-time KPIs · Safety trends · Controller workload · Traffic flow")
@SecurityRequirement(name = "bearerAuth")
public class AnalyticsController {

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class ApiResponse<T> {
        private Boolean success; private String message; private T data; private Instant timestamp;
        public static <T> ApiResponse<T> ok(T d) {
            return ApiResponse.<T>builder().success(true).message("OK").data(d).timestamp(Instant.now()).build();
        }
    }

    @GetMapping("/kpis")
    @PreAuthorize("hasAnyRole('OPERATIONS_MANAGER','DATA_ANALYST','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Live KPI dashboard",
        description = "Returns real-time operational KPIs: active flights, alerts, separation violations.")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getKpis() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
            "flights",    Map.of("active", 0, "today", 0, "cancelled_today", 0),
            "alerts",     Map.of("active", 0, "critical_today", 0, "total_today", 0),
            "separation", Map.of("avg_horizontal_nm", 0.0, "violations_today", 0),
            "timestamp",  Instant.now()
        )));
    }

    @GetMapping("/sectors/metrics")
    @PreAuthorize("hasAnyRole('ATC_SUPERVISOR','OPERATIONS_MANAGER','DATA_ANALYST','SUPER_ADMIN')")
    @Operation(summary = "Per-sector metrics with ML workload score",
        description = "Returns active flight count, alert count, pending handoffs, and composite workload score per sector.")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getSectorMetrics() {
        return ResponseEntity.ok(ApiResponse.ok(Collections.emptyList()));
    }

    @GetMapping("/delays")
    @PreAuthorize("hasAnyRole('OPERATIONS_MANAGER','DATA_ANALYST','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Flight delay analysis")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDelays(
            @RequestParam(required = false) String airport,
            @RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
            "totalFlights", 0, "averageDelayMinutes", 0.0, "delayedFlights", 0, "delays", Collections.emptyList())));
    }

    @GetMapping("/safety/trends")
    @PreAuthorize("hasAnyRole('SAFETY_OFFICER','ATC_SUPERVISOR','DATA_ANALYST','SUPER_ADMIN')")
    @Operation(summary = "Safety alert trend analysis",
        description = "Daily alert counts by type and severity over the specified window.")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getSafetyTrends(
            @RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(ApiResponse.ok(Collections.emptyList()));
    }

    @GetMapping("/workload/controllers")
    @PreAuthorize("hasAnyRole('ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Controller workload analysis",
        description = "Per-controller composite workload score with recommendation " +
                       "(score = flights×0.5 + alerts×0.35 + handoffs×0.15).")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getControllerWorkload() {
        return ResponseEntity.ok(ApiResponse.ok(Collections.emptyList()));
    }

    @GetMapping("/traffic/flow")
    @PreAuthorize("hasAnyRole('OPERATIONS_MANAGER','DATA_ANALYST','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Traffic flow by time bucket and airport")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getTrafficFlow(
            @RequestParam(defaultValue = "6")          int hours,
            @RequestParam(defaultValue = "15 minutes") String granularity) {
        return ResponseEntity.ok(ApiResponse.ok(Collections.emptyList()));
    }
}
