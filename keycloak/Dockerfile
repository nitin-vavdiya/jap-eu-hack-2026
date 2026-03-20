FROM quay.io/keycloak/keycloak:26.0

# Enable health checks, metrics, and configure DB type at build time
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
ENV KC_DB=postgres

# Copy custom theme before building the optimized runtime
COPY themes/smartsense-loire /opt/keycloak/themes/smartsense-loire

# Build the optimized Keycloak runtime (bakes in theme + config)
RUN /opt/keycloak/bin/kc.sh build

# Copy realm export — will be auto-imported on first startup via --import-realm
COPY realm-export.json /opt/keycloak/data/import/realm-export.json

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--import-realm", "--optimized"]
