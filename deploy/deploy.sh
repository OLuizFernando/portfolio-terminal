#!/usr/bin/env bash
#
# O deploy inteiro, do lado do Pi. Não é chamado direto: quem chama é o
# /usr/local/bin/deploy-portfolio, que faz o `git pull` e só então executa este
# arquivo — o bash lê script em pedaços, e um pull que troca o arquivo no meio da
# própria execução dá comportamento esquisito.
#
# Cada passo é condicional: rodar num commit que só mexeu em texto não deve
# reinstalar dependência nem reiniciar serviço.
#
# Uso: deploy.sh <commit-antes> <commit-depois>

set -euo pipefail

ROOT="/srv/portfolio"

main() {
  local before="$1" after="$2"
  cd "$ROOT"

  changed() { ! git diff --quiet "$before" "$after" -- "$@"; }

  local restart_api=false

  # O venv não é versionado, então pode simplesmente não existir — num Pi novo,
  # ou depois de alguém limpar o diretório. Quando as dependências mudam ele é
  # refeito do zero: o pip instala o que falta, mas nunca remove o que saiu da
  # lista, e um venv que só cresce acaba cheio de coisa que ninguém importa.
  if [ ! -x .venv/bin/python ] || changed api/requirements.txt; then
    echo "[deploy] (re)criando o venv..."
    rm -rf .venv
    python3 -m venv .venv
    .venv/bin/pip install -q -r api/requirements.txt
    # O processo em execução segue nos arquivos apagados até reiniciar.
    restart_api=true
  fi

  # npm ci apaga e reinstala node_modules inteiro — num Pi isso é minuto, não
  # segundo. Só vale quando as dependências realmente mudaram.
  if [ ! -d node_modules ] || changed package-lock.json; then
    echo "[deploy] lockfile mudou, reinstalando..."
    npm ci --silent
  fi

  npm run build

  # O uvicorn le api/*.py na subida: sem restart ele segue servindo o codigo
  # antigo depois do pull.
  if [ "$restart_api" = true ] || changed api/; then
    echo "[deploy] reiniciando a API..."
    sudo -n systemctl restart portfolio-api
  fi

  if changed deploy/portfolio-api.service; then
    echo "[deploy] unit mudou, reinstalando..."
    sudo -n cp deploy/portfolio-api.service /etc/systemd/system/
    sudo -n systemctl daemon-reload
    sudo -n systemctl restart portfolio-api
  fi

  if changed deploy/nginx.conf; then
    echo "[deploy] nginx mudou, reinstalando..."
    sudo -n cp deploy/nginx.conf /etc/nginx/sites-available/portfolio
    sudo -n nginx -t
    sudo -n systemctl reload nginx
  fi

  # Conferência de verdade, porque "o deploy passou" não é a mesma coisa que "o
  # site funciona". O `linux` falso significa que a API não achou /proc e está
  # servindo número inventado.
  local health
  health="$(curl -s -m 5 localhost:8080/api/health || true)"
  if [ "$health" != '{"ok":true,"linux":true}' ]; then
    echo "[deploy] ATENCAO: /api/health respondeu: ${health:-nada}"
    exit 1
  fi

  echo "[deploy] ok — $(git log -1 --format='%h %s')"
}

main "$@"
