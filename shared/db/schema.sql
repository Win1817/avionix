-- AVIONIX ATC Platform - Complete Database Schema
-- PostgreSQL 16+

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── USERS (synced from Keycloak) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  preferred_username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255),
  roles TEXT[] DEFAULT '{}',
  sector_assignment VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SECTORS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sectors (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) CHECK (type IN ('ENROUTE','APPROACH','TOWER','GROUND','OCEANIC')),
  fir VARCHAR(10),
  alt_lower INTEGER DEFAULT 0,
  alt_upper INTEGER DEFAULT 60000,
  boundary_polygon JSONB,
  assigned_controller_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FLIGHTS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  callsign VARCHAR(12) NOT NULL,
  aircraft_type VARCHAR(10),
  aircraft_registration VARCHAR(10),
  departure_airport CHAR(4),
  destination_airport CHAR(4),
  alternate_airport CHAR(4),
  departure_time TIMESTAMPTZ,
  actual_departure_time TIMESTAMPTZ,
  estimated_arrival_time TIMESTAMPTZ,
  actual_arrival_time TIMESTAMPTZ,
  cruise_altitude INTEGER CHECK (cruise_altitude BETWEEN 0 AND 60000),
  cruise_speed INTEGER,
  status VARCHAR(20) CHECK (status IN ('FILED','ACTIVATED','AIRBORNE','ACTIVE','LANDED','CANCELLED','DIVERTED')) DEFAULT 'FILED',
  flight_rules CHAR(1) CHECK (flight_rules IN ('I','V','Y','Z')) DEFAULT 'I',
  operator_icao CHAR(3),
  sector_id VARCHAR(20) REFERENCES sectors(id),
  assigned_controller_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flights_status ON flights(status);
CREATE INDEX idx_flights_callsign ON flights(callsign);
CREATE INDEX idx_flights_sector ON flights(sector_id);
CREATE INDEX idx_flights_departure ON flights(departure_airport, departure_time);

-- ─── FLIGHT PLANS EXTENDED ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flight_plans_extended (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flight_id UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  route TEXT,
  waypoints JSONB DEFAULT '[]',
  fuel_weight INTEGER,
  passenger_count SMALLINT,
  special_handling VARCHAR(255),
  coordination_status VARCHAR(30) DEFAULT 'PENDING',
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SURVEILLANCE REPORTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS surveillance_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flight_id UUID REFERENCES flights(id),
  callsign VARCHAR(12),
  source VARCHAR(20) CHECK (source IN ('ADS_B','SSR_MODE_C','SSR_MODE_S','MLAT','ADS_C','MANUAL')),
  position_lat DECIMAL(10,7) NOT NULL,
  position_lon DECIMAL(11,7) NOT NULL,
  altitude INTEGER,
  ground_speed INTEGER,
  track_angle DECIMAL(5,2),
  vertical_rate INTEGER,
  squawk CHAR(4),
  adsb_icao CHAR(6),
  wind_speed INTEGER,
  wind_direction INTEGER,
  signal_quality DECIMAL(3,2) DEFAULT 1.0,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_surveillance_flight_ts ON surveillance_reports(flight_id, timestamp DESC);
CREATE INDEX idx_surveillance_callsign_ts ON surveillance_reports(callsign, timestamp DESC);
CREATE INDEX idx_surveillance_ts ON surveillance_reports(timestamp DESC);

-- ─── TRAJECTORIES 4D ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trajectories_4d (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flight_id UUID NOT NULL REFERENCES flights(id),
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  prediction_horizon_minutes INTEGER DEFAULT 20,
  trajectory_points JSONB NOT NULL DEFAULT '[]',
  wind_adjusted BOOLEAN DEFAULT TRUE,
  confidence_level DECIMAL(4,3),
  is_current BOOLEAN DEFAULT TRUE,
  ml_model_used VARCHAR(50)
);

CREATE INDEX idx_traj_flight_current ON trajectories_4d(flight_id, is_current) WHERE is_current = TRUE;

-- ─── SAFETY ALERTS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_type VARCHAR(20) CHECK (alert_type IN ('STCA','MSAW','APW','CLAM','CONFLICT','AIRSPACE','WEATHER','SYSTEM')),
  severity VARCHAR(10) CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  flight_id_primary UUID REFERENCES flights(id),
  flight_id_secondary UUID REFERENCES flights(id),
  callsign_primary VARCHAR(12),
  callsign_secondary VARCHAR(12),
  alert_description TEXT,
  minimum_separation_achieved DECIMAL(8,3),
  required_separation DECIMAL(8,3),
  horizontal_distance DECIMAL(8,3),
  vertical_distance INTEGER,
  time_to_collision DECIMAL(8,2),
  is_active BOOLEAN DEFAULT TRUE,
  detection_time TIMESTAMPTZ DEFAULT NOW(),
  dismissal_time TIMESTAMPTZ,
  dismissed_by UUID REFERENCES users(id),
  resolution_action TEXT,
  alert_metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_alerts_active ON safety_alerts(is_active, detection_time DESC) WHERE is_active = TRUE;
CREATE INDEX idx_alerts_severity ON safety_alerts(severity, detection_time DESC);

-- ─── SEPARATION MINIMA ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS separation_minima (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  separation_type VARCHAR(20),
  horizontal_nm DECIMAL(5,2) DEFAULT 5.0,
  vertical_feet INTEGER DEFAULT 1000,
  applies_above_fl INTEGER DEFAULT 0,
  applies_below_fl INTEGER DEFAULT 999,
  active BOOLEAN DEFAULT TRUE
);

INSERT INTO separation_minima (separation_type, horizontal_nm, vertical_feet) VALUES
  ('HORIZONTAL', 5.0, 1000),
  ('TERMINAL', 3.0, 1000),
  ('RVSM', 5.0, 1000),
  ('OCEANIC', 30.0, 1000)
ON CONFLICT DO NOTHING;

-- ─── HANDOFFS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS handoffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flight_id UUID NOT NULL REFERENCES flights(id),
  from_sector_id VARCHAR(20) REFERENCES sectors(id),
  to_sector_id VARCHAR(20) REFERENCES sectors(id),
  transfer_altitude INTEGER,
  transfer_condition TEXT,
  estimated_boundary_time TIMESTAMPTZ,
  status VARCHAR(20) CHECK (status IN ('PENDING','ACCEPTED','REJECTED','TRANSFERRED','CANCELLED')) DEFAULT 'PENDING',
  initiated_by UUID REFERENCES users(id),
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_by UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  transferred_at TIMESTAMPTZ
);

CREATE INDEX idx_handoffs_status ON handoffs(status, initiated_at DESC);

-- ─── CLEARANCES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clearances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flight_id UUID NOT NULL REFERENCES flights(id),
  clearance_type VARCHAR(20) CHECK (clearance_type IN ('ROUTE','ALTITUDE','SPEED','APPROACH','DEPARTURE','TAXI','PUSHBACK')),
  instruction TEXT NOT NULL,
  cleared_altitude INTEGER,
  cleared_route TEXT,
  cleared_speed INTEGER,
  issued_by UUID REFERENCES users(id),
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ
);

-- ─── WEATHER: METAR ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  station_icao CHAR(4) NOT NULL,
  raw_text TEXT,
  wind_direction SMALLINT,
  wind_speed_kt SMALLINT,
  wind_gust_kt SMALLINT,
  visibility_sm DECIMAL(5,2),
  ceiling_ft INTEGER,
  temperature_c DECIMAL(4,1),
  dewpoint_c DECIMAL(4,1),
  altimeter_inhg DECIMAL(5,2),
  weather_codes JSONB DEFAULT '[]',
  observation_time TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metars_station_ts ON metars(station_icao, observation_time DESC);

-- ─── WEATHER: TAF ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tafs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  station_icao CHAR(4) NOT NULL,
  raw_text TEXT,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  forecast_groups JSONB DEFAULT '[]'
);

-- ─── WEATHER: SIGMET ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sigmets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fir VARCHAR(10),
  phenomenon VARCHAR(20) CHECK (phenomenon IN ('TURB','ICE','TS','VA','RDOACT','TC','MTW','SEV_ICE')),
  level_lower INTEGER,
  level_upper INTEGER,
  area_polygon JSONB,
  intensity VARCHAR(20),
  movement VARCHAR(100),
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  raw_text TEXT,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  issued_by UUID REFERENCES users(id)
);

CREATE INDEX idx_sigmets_valid ON sigmets(valid_to) WHERE valid_to > NOW();

-- ─── WEATHER: PIREP ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pireps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  callsign VARCHAR(12),
  position_lat DECIMAL(10,7),
  position_lon DECIMAL(11,7),
  altitude INTEGER,
  turbulence_intensity VARCHAR(20),
  icing_intensity VARCHAR(20),
  wind_direction SMALLINT,
  wind_speed_kt SMALLINT,
  temperature_c DECIMAL(4,1),
  remarks TEXT,
  reported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pireps_ts ON pireps(reported_at DESC);
CREATE INDEX idx_pireps_position ON pireps(position_lat, position_lon);
