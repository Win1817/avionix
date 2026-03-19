# Stage 1: Build
FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /build

# Cache dependencies
COPY services/pom.xml ./
COPY services/fdps-service/pom.xml fdps-service/
RUN mvn -pl fdps-service dependency:go-offline -q 2>/dev/null || true

# Build
COPY services/fdps-service fdps-service/
RUN mvn -pl fdps-service package -DskipTests -q

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine AS final
WORKDIR /app

RUN addgroup -S avionix && adduser -S avionix -G avionix
USER avionix

COPY --from=builder /build/fdps-service/target/*.jar app.jar

ENV JAVA_OPTS="-Xms128m -Xmx512m -XX:+UseContainerSupport"
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/fdps/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
