"""
Os comandos que os visitantes digitam, agregados.

O que se guarda de cada linha é **a primeira palavra**, e mais nada. Não é
economia de disco: `ls` e `cd projects` dizem tudo o que o comando `stats`
precisa dizer, e a linha inteira acabaria carregando o que alguém escreveu num
`echo`. O que não é gravado não vaza.

Também não se guarda quem digitou. Sem IP, sem cookie, sem identificador de
sessão — nem um número aleatório "anônimo", que é identificador com outro nome.
Duas linhas do mesmo visitante são indistinguíveis de duas linhas de dois
visitantes, e isso é de propósito: é o que impede reconstruir a sessão de
alguém a partir do arquivo.

O agregado vive em memória e o JSONL é a verdade em disco. Na subida o arquivo é
lido uma vez para reconstruir o agregado; depois disso ninguém mais o lê, e
responder ao `stats` não custa I/O nenhum.
"""

from __future__ import annotations

import json
import os
import re
import threading
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

#: O systemd define STATE_DIRECTORY por causa do StateDirectory= da unit. Fora
#: dele (desenvolvimento), um var/ ao lado do repositório, que o git ignora.
STATE_DIR = Path(os.environ.get("STATE_DIRECTORY") or "var")
LOG_PATH = STATE_DIR / "commands.jsonl"

#: Quantos comandos cabem num lote. O cliente manda de 10 em 10; o teto existe
#: para o caso de o lote não ter vindo do cliente.
MAX_EVENTS = 50

#: Nome de comando: ASCII imprimível, sem espaço. Recorta o que não é nome de
#: comando antes de virar linha de arquivo — inclusive controle e quebra de
#: linha, que num JSONL corromperiam o registro seguinte.
NAME_RE = re.compile(r"^[\x21-\x7e]{1,32}$")

#: País: as duas letras do CF-IPCountry. `XX` é o que a Cloudflare manda quando
#: não sabe, e `??` é o que se registra quando o cabeçalho não veio.
COUNTRY_RE = re.compile(r"^[A-Z]{2}$")
UNKNOWN_COUNTRY = "??"

#: Quantos entram no ranking que o `stats` mostra.
TOP = 12


def country_of(header: str | None) -> str:
    """O país do cabeçalho da Cloudflare, ou `??`."""
    value = (header or "").strip().upper()
    return value if COUNTRY_RE.match(value) else UNKNOWN_COUNTRY


class Usage:
    """O agregado. Escreve no JSONL e responde ao `stats` sem tocar no disco."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.known: Counter[str] = Counter()
        self.unknown: Counter[str] = Counter()
        self.countries: Counter[str] = Counter()
        self.total = 0
        self.since: str | None = None

    # -- leitura da subida ------------------------------------------------

    def load(self) -> None:
        """Reconstrói o agregado a partir do arquivo. Uma vez, na subida.

        Linha corrompida é pulada em silêncio: um arquivo cortado no meio de uma
        escrita não pode impedir a API de subir.
        """
        if not LOG_PATH.exists():
            return

        with LOG_PATH.open(encoding="utf-8") as handle:
            for line in handle:
                try:
                    event = json.loads(line)
                    self._count(str(event["cmd"]), bool(event["ok"]), str(event["cc"]), str(event["at"]))
                except (ValueError, KeyError, TypeError):
                    continue

    # -- escrita ----------------------------------------------------------

    def add(self, commands: list[tuple[str, bool]], country: str) -> int:
        """Grava um lote e devolve quantos comandos entraram de fato."""
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        accepted = [(name, ok) for name, ok in commands[:MAX_EVENTS] if NAME_RE.match(name)]
        if not accepted:
            return 0

        lines = [
            json.dumps({"at": now, "cmd": name, "ok": ok, "cc": country}, separators=(",", ":"))
            for name, ok in accepted
        ]

        with self._lock:
            # O diretório pode não existir no desenvolvimento; em produção quem
            # cria (com o dono certo) é o StateDirectory= do systemd.
            LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            with LOG_PATH.open("a", encoding="utf-8") as handle:
                handle.write("\n".join(lines) + "\n")
            for name, ok in accepted:
                self._count(name, ok, country, now)

        return len(accepted)

    def _count(self, name: str, ok: bool, country: str, at: str) -> None:
        (self.known if ok else self.unknown)[name] += 1
        self.countries[country] += 1
        self.total += 1
        if self.since is None or at < self.since:
            self.since = at

    # -- leitura ----------------------------------------------------------

    def report(self) -> dict[str, object]:
        return {
            "total": self.total,
            "since": self.since,
            "countries": len([code for code in self.countries if code != UNKNOWN_COUNTRY]),
            "top": [[name, count] for name, count in self.known.most_common(TOP)],
            "missing": [[name, count] for name, count in self.unknown.most_common(TOP)],
        }
