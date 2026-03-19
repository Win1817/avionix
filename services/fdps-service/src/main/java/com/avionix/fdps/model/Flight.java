package com.avionix.fdps.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "flights", indexes = {
    @Index(name = "idx_flights_status",    columnList = "status"),
    @Index(name = "idx_flights_callsign",  columnList = "callsign"),
    @Index(name = "idx_flights_sector",    columnList = "sector_id"),
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Flight {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @NotBlank
    @Pattern(regexp = "^[A-Z]{3}\\d{1,4}[A-Z]{0,2}$", message = "Invalid callsign format")
    @Column(nullable = false, length = 12)
    private String callsign;

    @Column(name = "aircraft_type", length = 10)
    private String aircraftType;

    @Column(name = "aircraft_registration", length = 10)
    private String aircraftRegistration;

    @Size(min = 4, max = 4)
    @Column(name = "departure_airport", length = 4)
    private String departureAirport;

    @Size(min = 4, max = 4)
    @Column(name = "destination_airport", length = 4)
    private String destinationAirport;

    @Column(name = "alternate_airport", length = 4)
    private String alternateAirport;

    @Column(name = "departure_time")
    private Instant departureTime;

    @Column(name = "actual_departure_time")
    private Instant actualDepartureTime;

    @Column(name = "estimated_arrival_time")
    private Instant estimatedArrivalTime;

    @Column(name = "actual_arrival_time")
    private Instant actualArrivalTime;

    @Min(0) @Max(60000)
    @Column(name = "cruise_altitude")
    private Integer cruiseAltitude;

    @Column(name = "cruise_speed")
    private Integer cruiseSpeed;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private FlightStatus status = FlightStatus.FILED;

    @Column(name = "flight_rules", length = 1)
    @Builder.Default
    private String flightRules = "I";

    @Column(name = "operator_icao", length = 3)
    private String operatorIcao;

    @Column(name = "sector_id", length = 20)
    private String sectorId;

    @Column(name = "assigned_controller_id")
    private UUID assignedControllerId;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() { this.updatedAt = Instant.now(); }

    public enum FlightStatus {
        FILED, ACTIVATED, AIRBORNE, ACTIVE, LANDED, CANCELLED, DIVERTED
    }
}
