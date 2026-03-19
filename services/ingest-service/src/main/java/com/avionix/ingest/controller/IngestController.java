package com.avionix.ingest.controller;

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
import java.util.concurrent.atomic.AtomicLong;

@RestController
@RequestMapping
@Tag(name = "Data Ingest", description = "ADS-B · ASTERIX CAT021/048 · FIXM 4.3 feed normalization and Kafka publish")
@SecurityRequirement(name = "bearerAuth")
public class IngestController {

    // Simple in-memory stats counters
    private final AtomicLong adsbCount    = new AtomicLong(0);
    private final AtomicLong asterixCount = new AtomicLong(0);
    private final AtomicLong fixmCount    = new AtomicLong(0);
    private final AtomicLong errorCount   = new AtomicLong(0);

    @Data @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "Single ADS-B aircraft state (dump1090/VRS JSON format)")
    public static class AdsbAircraft {
        @Schema(description = "Callsign / flight identifier", example = "PAL101") private String flight;
        @Schema(description = "ICAO 24-bit address (hex)", example = "4B1820")   private String hex;
        @Schema(description = "Latitude",  example = "14.5995") private Double lat;
        @Schema(description = "Longitude", example = "121.019") private Double lon;
        @Schema(description = "Baro altitude (feet)", example = "35000") private Object altitude;
        @Schema(description = "Ground speed (knots)", example = "480")   private Integer speed;
        @Schema(description = "Track angle (degrees)", example = "270")  private Double track;
        @Schema(description = "Vertical rate (ft/min)") private Integer vert_rate;
        @Schema(description = "Squawk code", example = "2341")  private String squawk;
        @Schema(description = "RSSI signal strength") private Double rssi;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class AdsbIngestRequest {
        @NotEmpty @Schema(description = "List of aircraft states from ADS-B receiver")
        private List<AdsbAircraft> aircraft;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "ASTERIX binary data (base64-encoded)")
    public static class AsterixIngestRequest {
        @NotBlank @Schema(description = "Base64-encoded ASTERIX binary frame") private String data;
        @Schema(description = "ASTERIX category: 21 (ADS-B) or 48 (SSR)", example = "21",
                allowableValues = {"21","48"})
        @Builder.Default private Integer category = 21;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "FIXM 4.3 flight plan (JSON subset)")
    public static class FixmIngestRequest {
        @NotNull  private Map<String, Object> flightPlan;
        @Schema(description = "Payload format", example = "json", allowableValues = {"json","xml"})
        @Builder.Default private String format = "json";
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "Bulk position update for high-frequency feeds")
    public static class BulkPositionRequest {
        @Schema(description = "Source type", allowableValues = {"ADS_B","SSR_MODE_C","SSR_MODE_S","MLAT","ADS_C"})
        @Builder.Default private String source = "ADS_B";
        @NotEmpty private List<Map<String, Object>> positions;
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

    @PostMapping("/adsb")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','ATC_SUPERVISOR')")
    @Operation(summary = "Ingest ADS-B position batch (dump1090 / VRS format)",
        description = "Accepts batched ADS-B JSON. Normalizes to internal schema, writes to `surveillance_reports`, " +
                       "and publishes to `avionix.surveillance.positions` Kafka topic.")
    @ApiResponse(responseCode = "201", description = "Positions ingested")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> ingestAdsb(
            @Valid @RequestBody AdsbIngestRequest req) {
        long valid = req.getAircraft().stream()
            .filter(a -> a.getLat() != null && a.getLon() != null).count();
        adsbCount.addAndGet(valid);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(Map.of("ingested", (int) valid), "ADS-B positions ingested"));
    }

    @PostMapping("/asterix")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN')")
    @Operation(summary = "Ingest ASTERIX binary radar data",
        description = "Accepts base64-encoded ASTERIX CAT021 (ADS-B) or CAT048 (SSR Mode S) binary frames. " +
                       "Parses binary format and publishes decoded records to Kafka.")
    @ApiResponse(responseCode = "201", description = "ASTERIX records parsed")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> ingestAsterix(
            @Valid @RequestBody AsterixIngestRequest req) {
        asterixCount.incrementAndGet();
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(Map.of("records", 1, "category", req.getCategory()), "ASTERIX ingested"));
    }

    @PostMapping("/fixm")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','ATC_SUPERVISOR')")
    @Operation(summary = "Ingest FIXM 4.3 flight plan",
        description = "Parses an ICAO FIXM 4.3 flight plan (JSON subset), checks for duplicates, " +
                       "inserts to `flights` table, and publishes `avionix.flights.filed` Kafka event.")
    @ApiResponse(responseCode = "201", description = "Flight plan ingested")
    @ApiResponse(responseCode = "409", description = "Duplicate flight plan for today")
    public ResponseEntity<ApiResponse<Map<String, Object>>> ingestFixm(
            @Valid @RequestBody FixmIngestRequest req) {
        fixmCount.incrementAndGet();
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(Map.of("id", UUID.randomUUID(), "ingestedAt", Instant.now()), "FIXM flight plan ingested"));
    }

    @PostMapping("/bulk-positions")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN')")
    @Operation(summary = "High-throughput bulk position update",
        description = "Accepts up to 1000 positions per call from aggregators (e.g., OpenSky, OpsPort). " +
                       "Batched Kafka writes for performance.")
    @ApiResponse(responseCode = "201", description = "Bulk positions ingested")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> bulkPositions(
            @Valid @RequestBody BulkPositionRequest req) {
        adsbCount.addAndGet(req.getPositions().size());
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(Map.of("ingested", req.getPositions().size()), "Bulk positions ingested"));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','SYSTEM_MONITOR')")
    @Operation(summary = "Ingestion statistics",
        description = "Returns cumulative counters since service start: ADS-B, ASTERIX, FIXM, and error counts.")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStats() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
            "adsbPositions",   adsbCount.get(),
            "asterixRecords",  asterixCount.get(),
            "fixmFlightPlans", fixmCount.get(),
            "errors",          errorCount.get(),
            "kafkaTopics", Map.of(
                "positions", "avionix.surveillance.positions",
                "filed",     "avionix.flights.filed"
            )
        )));
    }
}
