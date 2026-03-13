#!/usr/bin/env bash
set -euo pipefail

server_name="${1:?usage: configure-public-web.sh <server-name> [backend-host] [backend-port] [cert-email]}"
backend_host="${2:-127.0.0.1}"
backend_port="${3:-3200}"
server_domain="${server_name#*.}"
if [[ "${server_domain}" == "${server_name}" ]]; then
  default_cert_email="webmaster@${server_name}"
else
  default_cert_email="webmaster@${server_domain}"
fi
cert_email="${4:-${CERTBOT_EMAIL:-${default_cert_email}}}"
public_ip="${SHP_PUBLIC_BIND_IP:-$(getent ahostsv4 "${server_name}" | awk 'NR==1{print $1}')}"
document_root="${SHP_DOCUMENT_ROOT:-/var/www/html}"
code_backend_host="${CODE_SERVER_BACKEND_HOST:-127.0.0.1}"
code_backend_port="${CODE_SERVER_BACKEND_PORT:-8080}"

if [[ -z "${public_ip}" ]]; then
  echo "could not determine an IPv4 address for ${server_name}" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ssl_listen_template="${repo_root}/packaging/httpd/spanel-ssl-listen.conf"
http_template="${repo_root}/packaging/httpd/spanel-web-http.conf.template"
https_template="${repo_root}/packaging/httpd/spanel-web-https.conf.template"
httpd_conf="/etc/httpd/conf.d/spanel-web.conf"
httpd_ssl_listen_conf="/etc/httpd/conf.d/00-spanel-ssl-listen.conf"
cert_name="${server_name}"
letsencrypt_root="/var/www/letsencrypt/.well-known/acme-challenge"

render_template() {
  local source_template="$1"
  local target_path="$2"

  sed \
    -e "s|__SERVER_NAME__|${server_name}|g" \
    -e "s|__PUBLIC_IP__|${public_ip}|g" \
    -e "s|__DOCUMENT_ROOT__|${document_root}|g" \
    -e "s|__BACKEND_HOST__|${backend_host}|g" \
    -e "s|__BACKEND_PORT__|${backend_port}|g" \
    -e "s|__CODE_BACKEND_HOST__|${code_backend_host}|g" \
    -e "s|__CODE_BACKEND_PORT__|${code_backend_port}|g" \
    -e "s|__CERT_NAME__|${cert_name}|g" \
    "${source_template}" >"${target_path}"
}

install -d "$(dirname "${httpd_conf}")" "${letsencrypt_root}" "${document_root}"

dnf install -y httpd mod_ssl certbot

if [[ -f /etc/httpd/conf.d/ssl.conf && ! -f /etc/httpd/conf.d/ssl.conf.disabled ]]; then
  mv /etc/httpd/conf.d/ssl.conf /etc/httpd/conf.d/ssl.conf.disabled
fi

chmod 0755 /var/www /var/www/letsencrypt /var/www/letsencrypt/.well-known "${letsencrypt_root}"

if command -v semanage >/dev/null 2>&1; then
  semanage fcontext -a -t httpd_sys_content_t '/var/www/letsencrypt(/.*)?' 2>/dev/null || \
    semanage fcontext -m -t httpd_sys_content_t '/var/www/letsencrypt(/.*)?'
  restorecon -Rv /var/www/letsencrypt
  semanage port -a -t http_port_t -p tcp 3200 2>/dev/null || \
    semanage port -m -t http_port_t -p tcp 3200
  semanage port -a -t http_port_t -p tcp 8080 2>/dev/null || \
    semanage port -m -t http_port_t -p tcp 8080
else
  chcon -R -t httpd_sys_content_t /var/www/letsencrypt
fi

firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --permanent --add-port=3200/tcp
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload

setsebool -P httpd_can_network_connect 1

if [[ ! -f "${document_root}/index.html" ]]; then
  cat >"${document_root}/index.html" <<EOF
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${server_name}</title>
  </head>
  <body>
    <h1>${server_name}</h1>
    <p>This host document root is reserved for future content.</p>
  </body>
</html>
EOF
fi

render_template "${http_template}" "${httpd_conf}"
render_template "${ssl_listen_template}" "${httpd_ssl_listen_conf}"

systemctl enable httpd.service
systemctl enable --now certbot-renew.timer
apachectl -t
systemctl restart httpd.service

if [[ ! -f "/etc/letsencrypt/live/${cert_name}/fullchain.pem" ]]; then
  certbot certonly \
    --webroot \
    --webroot-path /var/www/letsencrypt \
    --non-interactive \
    --agree-tos \
    --email "${cert_email}" \
    --cert-name "${cert_name}" \
    -d "${server_name}"
fi

render_template "${https_template}" "${httpd_conf}"
apachectl -t
systemctl reload httpd.service

echo "Configured Apache reverse proxy for ${server_name} -> ${backend_host}:${backend_port}"
