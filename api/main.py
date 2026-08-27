"""
A API do portfólio. Uma rota de leitura, e nada mais até a telemetria da fase 4.

O site é estático e continua de pé sem isto: se a API estiver fora, os comandos
de sistema falham um a um e o resto do terminal segue funcionando. Essa é a
razão de o backend ser tão pequeno — ele não sustenta o site, só o enfeita com
a verdade.
"""

from __future__ import annotations

import asyncio
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from . import fake, probe

#: O `top` repinta a cada 2s por visitante. Sem cache, dez abas abertas fariam a
#: máquina passar o dia lendo o próprio /proc para responder sobre si mesma.
CACHE_TTL_SEC = 2.0

app = FastAPI(title="portfolio", docs_url=None, redoc_url=None, openapi_url=None)

# Em produção o nginx serve site e API na mesma origem, e nada disto é usado. No
# desenvolvimento o Vite está em outra porta.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

_sampler = probe.Sampler()
_lock = asyncio.Lock()
_cached: dict[str, object] | None = None
_cached_at = 0.0


async def _stats() -> dict[str, object]:
    global _cached, _cached_at

    if _cached is not None and time.monotonic() - _cached_at < CACHE_TTL_SEC:
        return _cached

    # O lock serve contra o efeito manada: várias abas pedindo ao mesmo tempo com
    # o cache vencido geram uma leitura, não N.
    async with _lock:
        if _cached is not None and time.monotonic() - _cached_at < CACHE_TTL_SEC:
            return _cached

        snapshot = _sampler.snapshot() if probe.LINUX else fake.snapshot()
        _cached, _cached_at = snapshot, time.monotonic()
        return snapshot


@app.get("/api/stats")
async def stats() -> dict[str, object]:
    """Tudo o que a camada 3 de comandos precisa, numa requisição só.

    Alimenta `neofetch`, `uptime`, `free`, `df`, `ps`, `top` e os arquivos de
    /proc. Uma rota, porque o custo é a viagem até o Pi — não a leitura.
    """
    return await _stats()


@app.get("/api/proc/{name}", response_class=PlainTextResponse)
async def proc(name: str) -> str:
    """O conteúdo cru de um arquivo de /proc, para o `cat` do terminal.

    Lista fechada, e não por paranoia: /proc tem muita coisa que não interessa a
    ninguém e alguma que não deveria sair daqui. Estes cinco são texto público
    sobre o hardware e a carga — o mesmo que qualquer `neofetch` mostra.
    """
    if name not in probe.PUBLIC_PROC:
        raise HTTPException(status_code=404, detail="no such file")
    return probe.public_proc(name)


@app.get("/api/health")
async def health() -> dict[str, object]:
    return {"ok": True, "linux": probe.LINUX}
