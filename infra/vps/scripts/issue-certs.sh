#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VPS_DIR="$REPO_ROOT/infra/vps"
APP_ROOT=${APP_ROOT:-/opt/logivn}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}

log() {
  printf '[logivn-certs] %s\n' "$*"
}

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

install_http_site() {
  log "Installing temporary HTTP site"
  mkdir -p /var/www/certbot /etc/nginx/sites-available /etc/nginx/sites-enabled
  cp "$VPS_DIR/nginx/logivn-http.conf" /etc/nginx/sites-available/logivn-vps.conf
  ln -sf /etc/nginx/sites-available/logivn-vps.conf /etc/nginx/sites-enabled/logivn-vps.conf
  nginx -t
  systemctl reload nginx
}

install_certbot_tls_snippets() {
  log "Ensuring Certbot TLS snippets"
  mkdir -p /etc/letsencrypt

  if [ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]; then
    local options_src=""
    for candidate in \
      /usr/lib/python3/dist-packages/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
      /snap/certbot/current/lib/python*/site-packages/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf; do
      if ls $candidate >/dev/null 2>&1; then
        options_src="$(ls $candidate | head -n 1)"
        break
      fi
    done

    if [ -z "$options_src" ]; then
      printf 'Missing Certbot Nginx TLS options snippet.\n' >&2
      exit 1
    fi

    cp "$options_src" /etc/letsencrypt/options-ssl-nginx.conf
  fi

  if [ ! -f /etc/letsencrypt/ssl-dhparams.pem ]; then
    local dhparams_src=""
    for candidate in \
      /usr/lib/python3/dist-packages/certbot/ssl-dhparams.pem \
      /snap/certbot/current/lib/python*/site-packages/certbot/ssl-dhparams.pem; do
      if ls $candidate >/dev/null 2>&1; then
        dhparams_src="$(ls $candidate | head -n 1)"
        break
      fi
    done

    if [ -z "$dhparams_src" ]; then
      printf 'Missing Certbot DH params snippet.\n' >&2
      exit 1
    fi

    cp "$dhparams_src" /etc/letsencrypt/ssl-dhparams.pem
  fi

  chmod 0644 /etc/letsencrypt/options-ssl-nginx.conf /etc/letsencrypt/ssl-dhparams.pem
}

issue_domain() {
  local domain="$1"
  log "Requesting certificate for $domain"
  certbot certonly \
    --webroot \
    -w /var/www/certbot \
    -d "$domain" \
    --email "${LETSENCRYPT_EMAIL:-ops@logivn.com}" \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring
}

install_ssl_site() {
  log "Installing SSL Nginx site"
  install_certbot_tls_snippets
  cp "$VPS_DIR/nginx/logivn-ssl.conf.template" /etc/nginx/sites-available/logivn-vps.conf
  nginx -t
  systemctl reload nginx
}

main() {
  load_env
  install_http_site

  local domains="${SSL_DOMAINS:-api.logivn.com,ws.logivn.com,worker.logivn.com,monitor.logivn.com}"
  IFS=',' read -r -a domain_list <<< "$domains"
  for domain in "${domain_list[@]}"; do
    issue_domain "$(printf '%s' "$domain" | xargs)"
  done

  install_ssl_site
  systemctl list-timers certbot.timer --no-pager || true
  log "SSL configuration complete"
}

main "$@"
