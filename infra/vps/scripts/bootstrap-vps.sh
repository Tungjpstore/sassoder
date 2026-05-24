#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${APP_ROOT:-/opt/logivn}
APP_USER=${APP_USER:-deploy}
TIMEZONE=${TIMEZONE:-Asia/Ho_Chi_Minh}
BACKUP_DIR="$APP_ROOT/backups/bootstrap/$(date -u +%Y%m%dT%H%M%SZ)"

log() {
  printf '[logivn-bootstrap] %s\n' "$*"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    printf 'bootstrap-vps.sh must run as root or via sudo.\n' >&2
    exit 1
  fi
}

backup_file() {
  local path="$1"
  if [ -f "$path" ]; then
    mkdir -p "$BACKUP_DIR$(dirname "$path")"
    cp -a "$path" "$BACKUP_DIR$path"
  fi
}

create_swap_if_needed() {
  if swapon --show | grep -q .; then
    log "Swap already configured"
    return
  fi

  log "Creating 2GB swapfile"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '^/swapfile ' /etc/fstab; then
    printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
  fi
}

create_app_user() {
  if ! id "$APP_USER" >/dev/null 2>&1; then
    log "Creating user $APP_USER"
    adduser --disabled-password --gecos "" "$APP_USER"
    usermod -aG sudo,docker "$APP_USER" || true
  fi

  if [ -n "${DEPLOY_PUBLIC_KEY:-}" ]; then
    log "Installing SSH key for $APP_USER"
    install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
    printf '%s\n' "$DEPLOY_PUBLIC_KEY" > "/home/$APP_USER/.ssh/authorized_keys"
    chown "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh/authorized_keys"
    chmod 600 "/home/$APP_USER/.ssh/authorized_keys"
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker already installed"
    return
  fi

  log "Installing Docker from official apt repository"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

install_node_runtime() {
  if command -v node >/dev/null 2>&1 && node --version | grep -q '^v22\.'; then
    log "Node.js 22 already installed"
  else
    log "Installing Node.js 22"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi

  corepack enable || true
  if ! command -v pnpm >/dev/null 2>&1; then
    npm install -g pnpm
  fi
  if ! command -v pm2 >/dev/null 2>&1; then
    npm install -g pm2
  fi
}

configure_docker_daemon() {
  log "Configuring Docker log rotation"
  backup_file /etc/docker/daemon.json
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  },
  "live-restore": true
}
JSON
  systemctl reload docker || systemctl restart docker
}

configure_firewall() {
  log "Configuring UFW"
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
}

configure_fail2ban() {
  log "Configuring fail2ban"
  backup_file /etc/fail2ban/jail.local
  cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
maxretry = 4
EOF
  systemctl enable --now fail2ban
  systemctl restart fail2ban
}

configure_ssh() {
  log "Configuring SSH hardening"
  backup_file /etc/ssh/sshd_config
  install -d -m 755 /etc/ssh/sshd_config.d

  local password_auth="yes"
  local root_login="prohibit-password"
  if [ -n "${DEPLOY_PUBLIC_KEY:-}" ]; then
    password_auth="no"
    root_login="no"
  fi

  cat > /etc/ssh/sshd_config.d/99-logivn-hardening.conf <<EOF
PubkeyAuthentication yes
PasswordAuthentication $password_auth
KbdInteractiveAuthentication no
PermitRootLogin $root_login
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

  sshd -t
  systemctl reload ssh || systemctl reload sshd
}

configure_sysctl() {
  log "Configuring kernel/network tuning"
  backup_file /etc/sysctl.d/99-logivn.conf
  cat > /etc/sysctl.d/99-logivn.conf <<'EOF'
vm.swappiness=10
vm.overcommit_memory=1
fs.file-max=2097152
net.core.somaxconn=4096
net.ipv4.tcp_fin_timeout=15
net.ipv4.tcp_keepalive_time=300
net.ipv4.tcp_keepalive_intvl=30
net.ipv4.tcp_keepalive_probes=5
EOF
  sysctl --system >/dev/null
}

create_layout() {
  log "Creating /opt/logivn directory layout"
  mkdir -p "$APP_ROOT"/{services,gateway,socket,worker,ai-service,telegram-bot,image-service,infra,nginx,redis,monitoring,logs,scripts,backups,app}
  chown -R "$APP_USER:$APP_USER" "$APP_ROOT"
  chmod 750 "$APP_ROOT"
}

main() {
  require_root
  mkdir -p "$BACKUP_DIR"

  log "Preflight"
  lsb_release -a || true
  free -h || true
  df -h || true

  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get upgrade -y
  apt-get install -y curl git unzip htop ufw fail2ban build-essential ca-certificates gnupg lsb-release nginx certbot python3-certbot-nginx logrotate unattended-upgrades

  timedatectl set-timezone "$TIMEZONE"
  install_docker
  create_app_user
  install_node_runtime
  create_swap_if_needed
  configure_docker_daemon
  configure_firewall
  configure_fail2ban
  configure_ssh
  configure_sysctl
  create_layout

  log "Installed versions"
  docker --version
  docker compose version
  node --version
  pnpm --version
  pm2 --version
  nginx -v
  certbot --version

  log "Bootstrap complete. Backups stored in $BACKUP_DIR"
}

main "$@"
