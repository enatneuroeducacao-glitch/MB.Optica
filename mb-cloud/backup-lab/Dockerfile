FROM postgres:16-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends pgbackrest ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY pgbackrest.conf /etc/pgbackrest/pgbackrest.conf
RUN chown postgres:postgres /etc/pgbackrest/pgbackrest.conf \
    && chmod 0640 /etc/pgbackrest/pgbackrest.conf \
    && mkdir -p /var/lib/pgbackrest /var/spool/pgbackrest \
    && chown -R postgres:postgres /var/lib/pgbackrest /var/spool/pgbackrest

USER postgres
