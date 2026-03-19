package com.avionix.fdps.repository;

import com.avionix.fdps.model.Flight;
import com.avionix.fdps.model.Flight.FlightStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FlightRepository extends JpaRepository<Flight, UUID> {

    Page<Flight> findByStatus(FlightStatus status, Pageable pageable);

    Page<Flight> findByStatusAndSectorId(FlightStatus status, String sectorId, Pageable pageable);

    Optional<Flight> findByCallsign(String callsign);

    List<Flight> findByStatusIn(List<FlightStatus> statuses);

    @Query("""
        SELECT f FROM Flight f
        WHERE f.status = 'ACTIVE'
        AND f.sectorId = :sectorId
        ORDER BY f.departureTime DESC
    """)
    List<Flight> findActiveBySector(String sectorId);

    boolean existsByCallsignAndStatus(String callsign, FlightStatus status);

    long countByStatus(FlightStatus status);
}
