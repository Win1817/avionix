FROM quay.io/keycloak/keycloak:23.0

COPY keycloak/realm-export.json /opt/keycloak/data/import/avionix-realm.json

RUN /opt/keycloak/bin/kc.sh build --db=postgres

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--import-realm", "--optimized"]

EXPOSE 8080 8443
