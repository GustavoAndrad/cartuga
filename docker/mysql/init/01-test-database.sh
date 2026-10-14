#!/bin/sh
# Runs once, only when the MySQL data volume is first initialized (official mysql image
# convention for docker-entrypoint-initdb.d). Creates a separate schema for the pytest
# suite so tests never touch dev data, granting the same app user access to it.
set -e

mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
    CREATE DATABASE IF NOT EXISTS cartuga_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    GRANT ALL PRIVILEGES ON cartuga_test.* TO '${MYSQL_USER}'@'%';
    FLUSH PRIVILEGES;
EOSQL
