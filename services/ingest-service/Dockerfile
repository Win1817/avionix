FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /build
COPY services/pom.xml ./
COPY services/ingest-service/pom.xml ingest-service/
RUN mvn -pl ingest-service dependency:go-offline -q 2>/dev/null || true
COPY services/ingest-service ingest-service/
RUN mvn -pl ingest-service package -DskipTests -q

FROM eclipse-temurin:21-jre-alpine AS final
WORKDIR /app
RUN addgroup -S avionix && adduser -S avionix -G avionix
USER avionix
COPY --from=builder /build/ingest-service/target/*.jar app.jar
ENV JAVA_OPTS="-Xms128m -Xmx512m -XX:+UseContainerSupport"
EXPOSE 3008
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3   CMD wget -qO- http://localhost:3008/api/ingest/actuator/health || exit 1
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
