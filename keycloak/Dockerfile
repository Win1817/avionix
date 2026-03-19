FROM quay.io/keycloak/keycloak:23.0

USER root
RUN microdnf install -y curl && microdnf clean all
USER keycloak

COPY keycloak/realm-export.json /opt/keycloak/data/import/avionix-realm.json

RUN /opt/keycloak/bin/kc.sh build --db=postgres

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--import-realm", "--optimized"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=8 \
  CMD curl -sf http://localhost:8080/health/ready | grep -q '"status":"UP"' || exit 1

EXPOSE 8080 8443
