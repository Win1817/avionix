FROM quay.io/keycloak/keycloak:23.0

ENV KC_DB=postgres
ENV KC_DB_URL=jdbc:postgresql://postgres:5432/keycloak
ENV KC_DB_USERNAME=${KC_DB_USERNAME:-keycloak}
ENV KC_DB_PASSWORD=${KC_DB_PASSWORD}
ENV KC_HOSTNAME=${KC_HOSTNAME:-localhost}
ENV KC_HOSTNAME_STRICT=false
ENV KC_HTTP_ENABLED=true
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
ENV KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN:-admin}
ENV KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}

COPY realm-export.json /opt/keycloak/data/import/avionix-realm.json

RUN /opt/keycloak/bin/kc.sh build

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--import-realm", "--optimized"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/health/ready || exit 1

EXPOSE 8080 8443
