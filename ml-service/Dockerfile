# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /app

# Cache dependencies separately from source
COPY pom.xml ./
RUN mvn dependency:go-offline -q 2>/dev/null || true

# Build
COPY src ./src
RUN mvn package -DskipTests -q

# ── Stage 2: Runtime ────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

# Non-root user
RUN addgroup -S avionix && adduser -S avionix -G avionix
USER avionix

COPY --from=builder /app/target/*.jar app.jar

ENV JAVA_OPTS="-Xms128m -Xmx512m -XX:+UseContainerSupport -XX:+UseG1GC"
EXPOSE 3007

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3   CMD wget -qO- http://localhost:3007/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
