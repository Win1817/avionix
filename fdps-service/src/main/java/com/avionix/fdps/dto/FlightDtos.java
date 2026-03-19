package com.avionix.fdps.dto;

import com.avionix.fdps.model.Flight.FlightStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import lombok.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public class FlightDtos {

    @Schema(description = "Request payload to file a new flight plan")
    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class FlightPlanRequest {
        @NotBlank @Pattern(regexp = "^[A-Z]{3}\\d{1,4}[A-Z]{0,2}$")
        @Schema(description = "ICAO callsign", example = "PAL101", requiredMode = Schema.RequiredMode.REQUIRED)
        private String callsign;

        @Schema(description = "ICAO aircraft type designator", example = "B77W")
        private String aircraftType;

        @Schema(description = "Aircraft registration", example = "RP-C7772")
        private String aircraftRegistration;

        @NotBlank @Size(min = 4, max = 4)
        @Schema(description = "Departure airport ICAO code", example = "RPLL")
        private String departureAirport;

        @NotBlank @Size(min = 4, max = 4)
        @Schema(description = "Destination airport ICAO code", example = "RJTT")
        private String destinationAirport;

        @NotNull
        @Schema(description = "Estimated off-block time (UTC ISO-8601)")
        private Instant departureTime;

        @NotNull @Min(0) @Max(60000)
        @Schema(description = "Cruise altitude in feet", example = "35000")
        private Integer cruiseAltitude;

        @Schema(description = "Cruise speed in knots", example = "480")
        private Integer cruiseSpeed;

        @Schema(description = "Flight rules: I=IFR, V=VFR", example = "I", allowableValues = {"I","V","Y","Z"})
        @Builder.Default
        private String flightRules = "I";

        @Schema(description = "Operator ICAO code", example = "PAL")
        private String operatorIcao;

        @Schema(description = "Route string")
        private String route;

        @Schema(description = "Waypoints list")
        private List<Waypoint> waypoints;

        @Schema(description = "Special handling codes")
        private String specialHandling;
    }

    @Schema(description = "Flight update payload")
    @Data @NoArgsConstructor @AllArgsConstructor
    public static class FlightUpdateRequest {
        @Schema(description = "New cruise altitude", example = "37000")
        private Integer cruiseAltitude;
        private Integer cruiseSpeed;
        @Size(min = 4, max = 4)
        private String destinationAirport;
        private FlightStatus status;
        private String specialHandling;
    }

    @Schema(description = "Sector assignment request")
    @Data @NoArgsConstructor @AllArgsConstructor
    public static class SectorAssignRequest {
        @NotBlank
        private String sectorId;
        private UUID controllerId;
    }

    @Schema(description = "Flight response")
    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class FlightResponse {
        private UUID id;
        private String callsign;
        private String aircraftType;
        private String departureAirport;
        private String destinationAirport;
        private Instant departureTime;
        private Integer cruiseAltitude;
        private Integer cruiseSpeed;
        private FlightStatus status;
        private String flightRules;
        private String operatorIcao;
        private String sectorId;
        private Instant createdAt;
        private Instant updatedAt;
    }

    @Schema(description = "Conflict check request")
    @Data @NoArgsConstructor @AllArgsConstructor
    public static class ConflictCheckRequest {
        @NotNull private UUID flightId1;
        @NotNull private UUID flightId2;
    }

    @Schema(description = "Conflict check result")
    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class ConflictResult {
        private String flight1;
        private String flight2;
        @Schema(description = "Horizontal separation in nautical miles")
        private Double horizontalSeparationNM;
        @Schema(description = "Vertical separation in feet")
        private Integer verticalSeparationFt;
        private Double requiredHorizontalNM;
        private Integer requiredVerticalFt;
        private Boolean hasConflict;
    }

    @Schema(description = "Waypoint definition")
    @Data @NoArgsConstructor @AllArgsConstructor
    public static class Waypoint {
        private String id;
        private Double lat;
        private Double lon;
    }

    @Schema(description = "Standard API response wrapper")
    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class ApiResponse<T> {
        private Boolean success;
        private String message;
        private T data;
        private Instant timestamp;

        public static <T> ApiResponse<T> ok(T data, String message) {
            return ApiResponse.<T>builder()
                .success(true).message(message).data(data).timestamp(Instant.now()).build();
        }
        public static <T> ApiResponse<T> ok(T data) { return ok(data, "OK"); }
        public static <T> ApiResponse<T> error(String message) {
            return ApiResponse.<T>builder()
                .success(false).message(message).timestamp(Instant.now()).build();
        }
    }
}
