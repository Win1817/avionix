FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /build
COPY services/pom.xml ./
COPY services/snet-service/pom.xml snet-service/
RUN mvn -pl snet-service dependency:go-offline -q 2>/dev/null || true
COPY services/snet-service snet-service/
RUN mvn -pl snet-service package -DskipTests -q

FROM eclipse-temurin:21-jre-alpine AS final
WORKDIR /app
RUN addgroup -S avionix && adduser -S avionix -G avionix
USER avionix
COPY --from=builder /build/snet-service/target/*.jar app.jar
ENV JAVA_OPTS="-Xms128m -Xmx512m -XX:+UseContainerSupport"
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3   CMD wget -qO- http://localhost:3002/api/snet/actuator/health || exit 1
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
