FROM quay.io/keycloak/keycloak:23.0

COPY keycloak/realm-export.json /opt/keycloak/data/import/avionix-realm.json

RUN /opt/keycloak/bin/kc.sh build --db=postgres

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--import-realm", "--optimized"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD curl -f http://localhost:8080/health/ready || exit 1

EXPOSE 8080 8443
