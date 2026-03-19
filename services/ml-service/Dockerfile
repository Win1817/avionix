FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /build
COPY services/pom.xml ./
COPY services/ml-service/pom.xml ml-service/
RUN mvn -pl ml-service dependency:go-offline -q 2>/dev/null || true
COPY services/ml-service ml-service/
RUN mvn -pl ml-service package -DskipTests -q

FROM eclipse-temurin:21-jre-alpine AS final
WORKDIR /app
RUN addgroup -S avionix && adduser -S avionix -G avionix
USER avionix
COPY --from=builder /build/ml-service/target/*.jar app.jar
ENV JAVA_OPTS="-Xms128m -Xmx512m -XX:+UseContainerSupport"
EXPOSE 3007
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3   CMD wget -qO- http://localhost:3007/api/ml/actuator/health || exit 1
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
