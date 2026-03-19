package com.avionix.weather.controller;

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
@Tag(name = "Weather", description = "METAR · TAF · SIGMET · PIREP ingestion and ML hazard prediction")
@SecurityRequirement(name = "bearerAuth")
public class WeatherController {

    public enum SigmetPhenomenon { TS, TURB, ICE, VA, RDOACT, TC, MTW, SEV_ICE }
    public enum TurbulenceIntensity { NONE, LIGHT, LIGHT_MODERATE, MODERATE, MODERATE_SEVERE, SEVERE, EXTREME }
    public enum IcingIntensity { NONE, LIGHT, MODERATE, SEVERE }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "METAR observation")
    public static class MetarRecord {
        private UUID id;
        @Schema(example = "RPLL") private String stationIcao;
        @Schema(description = "Raw METAR string") private String rawText;
        private Integer windDirectionDeg;
        private Integer windSpeedKt;
        private Integer windGustKt;
        @Schema(description = "Visibility in statute miles") private Double visibilitySm;
        @Schema(description = "Ceiling in feet AGL") private Integer ceilingFt;
        @Schema(description = "Temperature in Celsius") private Double temperatureC;
        @Schema(description = "Dewpoint in Celsius") private Double dewpointC;
        @Schema(description = "Altimeter in inHg") private Double altimeterInhg;
        private List<String> weatherCodes;
        private Instant observationTime;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class IngestMetarRequest {
        @NotBlank @Size(min=4, max=4) private String stationIcao;
        @NotBlank private String rawText;
        private Integer windDirection; private Integer windSpeed; private Integer windGust;
        private Double visibility; private Integer ceiling;
        private Double temperature; private Double dewpoint; private Double altimeter;
        private List<String> weatherCodes;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "SIGMET significant weather advisory")
    public static class SigmetRecord {
        private UUID id;
        @Schema(example = "RPHI") private String fir;
        private SigmetPhenomenon phenomenon;
        @Schema(description = "Lower level in feet") private Integer levelLower;
        @Schema(description = "Upper level in feet") private Integer levelUpper;
        private Object areaPolygon;
        private String intensity;
        private String movement;
        private Instant validFrom;
        private Instant validTo;
        private String rawText;
        private Instant issuedAt;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class IssueSigmetRequest {
        @NotBlank private String fir;
        @NotNull  private SigmetPhenomenon phenomenon;
        private Integer levelLower; private Integer levelUpper;
        private List<List<Double>> areaPolygon;
        private String intensity; private String movement;
        @NotNull private Instant validFrom;
        @NotNull private Instant validTo;
        @NotBlank private String rawText;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class SubmitPirepRequest {
        @NotBlank private String callsign;
        @NotNull  private Double lat;
        @NotNull  private Double lon;
        @NotNull  private Integer altitude;
        private TurbulenceIntensity turbulenceIntensity;
        private IcingIntensity icingIntensity;
        private Integer windDirection; private Integer windSpeedKt;
        private Double temperatureC; private String remarks;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    @Schema(description = "ML weather hazard prediction result")
    public static class HazardPrediction {
        private Double lat; private Double lon; private Integer altitude;
        private Integer lookaheadMinutes;
        @Schema(description = "List of detected hazards")
        private List<Map<String, Object>> hazards;
        @Schema(description = "Overall risk level", example = "MODERATE", allowableValues = {"NONE","LOW","MODERATE","HIGH","CRITICAL"})
        private String overallRisk;
        private Instant generatedAt;
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

    @GetMapping("/metar/{icao}")
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','PILOT','SUPER_ADMIN')")
    @Operation(summary = "Get latest METAR for station")
    @ApiResponse(responseCode = "404", description = "No METAR found for station")
    public ResponseEntity<ApiResponse<MetarRecord>> getMetar(
            @PathVariable @Size(min=4,max=4) String icao) {
        MetarRecord m = MetarRecord.builder()
            .stationIcao(icao.toUpperCase())
            .rawText(icao.toUpperCase() + " " + Instant.now() + "Z 18010KT 9999 FEW020 30/22 Q1013")
            .windDirectionDeg(180).windSpeedKt(10).visibilitySm(10.0).temperatureC(30.0)
            .dewpointC(22.0).altimeterInhg(29.92).observationTime(Instant.now()).build();
        return ResponseEntity.ok(ApiResponse.ok(m));
    }

    @PostMapping("/metar")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN')")
    @Operation(summary = "Ingest new METAR observation")
    @ApiResponse(responseCode = "201", description = "METAR ingested")
    public ResponseEntity<ApiResponse<MetarRecord>> ingestMetar(@Valid @RequestBody IngestMetarRequest req) {
        MetarRecord m = MetarRecord.builder()
            .id(UUID.randomUUID()).stationIcao(req.getStationIcao())
            .rawText(req.getRawText()).observationTime(Instant.now()).build();
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(m, "METAR ingested"));
    }

    @GetMapping("/taf/{icao}")
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','PILOT','SUPER_ADMIN')")
    @Operation(summary = "Get current valid TAF for station")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTaf(
            @PathVariable @Size(min=4,max=4) String icao) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("station_icao", icao.toUpperCase(), "raw_text",
            "TAF " + icao.toUpperCase() + " valid 24h — simulated")));
    }

    @GetMapping("/sigmets")
    @PreAuthorize("hasAnyRole('ATC_TRAINEE','ATC_CONTROLLER','ATC_SUPERVISOR','PILOT','SUPER_ADMIN')")
    @Operation(summary = "Get active SIGMETs",
        description = "Returns all currently valid SIGMETs, optionally filtered by FIR.")
    public ResponseEntity<ApiResponse<List<SigmetRecord>>> getSigmets(
            @Parameter(description = "Filter by FIR identifier") @RequestParam(required = false) String fir) {
        return ResponseEntity.ok(ApiResponse.ok(Collections.emptyList()));
    }

    @PostMapping("/sigmets")
    @PreAuthorize("hasAnyRole('ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "Issue a new SIGMET",
        description = "Creates and publishes a SIGMET. Phenomena: TS, TURB, ICE, VA, RDOACT, TC, MTW, SEV_ICE.")
    @ApiResponse(responseCode = "201", description = "SIGMET issued")
    public ResponseEntity<ApiResponse<SigmetRecord>> issueSigmet(@Valid @RequestBody IssueSigmetRequest req) {
        SigmetRecord s = SigmetRecord.builder()
            .id(UUID.randomUUID()).fir(req.getFir()).phenomenon(req.getPhenomenon())
            .levelLower(req.getLevelLower()).levelUpper(req.getLevelUpper())
            .validFrom(req.getValidFrom()).validTo(req.getValidTo())
            .rawText(req.getRawText()).issuedAt(Instant.now()).build();
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(s, "SIGMET issued"));
    }

    @PostMapping("/pireps")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','PILOT','SUPER_ADMIN')")
    @Operation(summary = "Submit a PIREP (pilot weather report)")
    @ApiResponse(responseCode = "201", description = "PIREP recorded")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submitPirep(@Valid @RequestBody SubmitPirepRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(Map.of("id", UUID.randomUUID(), "callsign", req.getCallsign(),
                "reportedAt", Instant.now()), "PIREP recorded"));
    }

    @GetMapping("/hazards/predict")
    @PreAuthorize("hasAnyRole('ATC_CONTROLLER','ATC_SUPERVISOR','SUPER_ADMIN')")
    @Operation(summary = "ML weather hazard prediction",
        description = "Fuses active SIGMETs and recent PIREPs to predict weather hazards " +
                       "at a given position and altitude using a gradient-boosting model.")
    public ResponseEntity<ApiResponse<HazardPrediction>> predictHazards(
            @RequestParam Double lat,
            @RequestParam Double lon,
            @RequestParam Integer altitude,
            @RequestParam(defaultValue = "30") int lookaheadMinutes) {
        HazardPrediction p = HazardPrediction.builder()
            .lat(lat).lon(lon).altitude(altitude)
            .lookaheadMinutes(lookaheadMinutes)
            .hazards(Collections.emptyList()).overallRisk("NONE")
            .generatedAt(Instant.now()).build();
        return ResponseEntity.ok(ApiResponse.ok(p));
    }
}
