#!/usr/bin/env bash
set -euo pipefail
# Optional Debian development bootstrap. Existing deployments should supply DATABASE_URL.
pg_install_root="${JIELIEN_PG_INSTALL_ROOT:-/workspace/pg17}"
if [[ -x "$pg_install_root/usr/lib/postgresql/17/bin/postgres" ]]; then
  "$pg_install_root/usr/lib/postgresql/17/bin/postgres" --version
  exit 0
fi
pg_apt_root=/workspace/.apt/jielien-postgres
mkdir -p "$pg_apt_root/lists/partial" "$pg_apt_root/cache/archives/partial" "$pg_apt_root/log"
cat > "$pg_apt_root/sources.list" <<'SOURCES'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://security.debian.org/debian-security trixie-security main
SOURCES
pg_apt_options=(-o "Dir::Etc::sourcelist=$pg_apt_root/sources.list" -o Dir::Etc::sourceparts=- -o "Dir::State::lists=$pg_apt_root/lists" -o "Dir::Cache=$pg_apt_root/cache" -o "Dir::Log=$pg_apt_root/log" -o "APT::Sandbox::User=$(id -un)" -o Debug::NoLocking=1)
apt-get "${pg_apt_options[@]}" update
pg_package_dir="$(mktemp -d "$pg_apt_root/packages.XXXXXX")"
trap 'rm -rf "$pg_package_dir"' EXIT
cd "$pg_package_dir"
# APT verifies signed repository metadata and the package hashes from that metadata.
apt-get "${pg_apt_options[@]}" download postgresql-17 postgresql-client-17
mkdir -p "$pg_install_root"
for pg_package in ./*.deb; do dpkg-deb -x "$pg_package" "$pg_install_root"; done
"$pg_install_root/usr/lib/postgresql/17/bin/postgres" --version
