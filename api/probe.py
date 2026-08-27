"""
Leitura do estado real da máquina, direto de /proc e /sys.

Sem psutil de propósito: tudo o que o portfólio mostra sai de meia dúzia de
arquivos de texto, e a dependência custaria mais do que o código que ela
economiza. Cada função aqui devolve um pedaço do JSON que o /api/stats entrega.

Fora do Linux não existe /proc. Nesse caso o módulo entra em modo sintético
(veja fake.py) para que dê para desenvolver o frontend num Mac.
"""

from __future__ import annotations

import os
import pwd
import re
import time
from pathlib import Path

PROC = Path("/proc")

#: Processos que não devem aparecer no `ps`/`top` do site. Nome exato do
#: executável (o `comm` do kernel). Existe para o caso de subir algo no Pi cujo
#: nome não se queira anunciar — a lista é a mitigação de expor processos reais.
HIDDEN_PROCESSES: set[str] = set()

#: Teto de processos devolvidos. O `top` mostra uma tela; mandar 300 processos
#: para desenhar 20 linhas é desperdício de banda em cima de um link doméstico.
MAX_PROCESSES = 40

LINUX = PROC.joinpath("stat").exists()


def _read(path: str | Path, default: str = "") -> str:
    try:
        return Path(path).read_text(errors="replace")
    except OSError:
        return default


def _first_line(path: str | Path) -> str:
    return _read(path).split("\n", 1)[0].strip()


# --------------------------------------------------------------------------
# identidade da máquina
# --------------------------------------------------------------------------


def model() -> str:
    """Nome comercial do board, que só o device tree conhece."""
    # O arquivo do device tree termina em NUL — o strip não pega, o rstrip sim.
    raw = _read("/sys/firmware/devicetree/base/model").rstrip("\x00").strip()
    if raw:
        return raw

    # Em x86 ou num container o device tree não existe; o cpuinfo ainda ajuda.
    for line in _read(PROC / "cpuinfo").splitlines():
        if line.startswith(("Model", "Hardware")):
            return line.split(":", 1)[1].strip()
    return "unknown"


def kernel() -> dict[str, str]:
    info = os.uname()
    return {"release": info.release, "version": info.version, "machine": info.machine}


# --------------------------------------------------------------------------
# tempo e carga
# --------------------------------------------------------------------------


def uptime() -> float:
    return float(_read(PROC / "uptime", "0 0").split()[0])


def loadavg() -> dict[str, object]:
    parts = _read(PROC / "loadavg", "0 0 0 0/0 0").split()
    running, total = (parts[3].split("/") + ["0", "0"])[:2]
    return {
        "avg": [float(parts[0]), float(parts[1]), float(parts[2])],
        "running": int(running),
        "total": int(total),
    }


# --------------------------------------------------------------------------
# CPU
# --------------------------------------------------------------------------


def cpu_jiffies() -> tuple[int, int]:
    """(ocupado, total) da linha agregada do /proc/stat.

    O uso de CPU não existe como número instantâneo: ele é a razão entre dois
    contadores em dois momentos. Quem chama guarda a amostra anterior.
    """
    for line in _read(PROC / "stat").splitlines():
        if line.startswith("cpu "):
            values = [int(v) for v in line.split()[1:]]
            total = sum(values)
            idle = values[3] + (values[4] if len(values) > 4 else 0)
            return total - idle, total
    return 0, 0


def cpu_static() -> dict[str, object]:
    text = _read(PROC / "cpuinfo")
    cores = text.count("processor\t:") or os.cpu_count() or 1

    name = ""
    for line in text.splitlines():
        if line.startswith(("model name", "Model name")):
            name = line.split(":", 1)[1].strip()
            break
    if not name:
        # O cpuinfo do ARM não traz "model name"; o implementer part traz o núcleo.
        parts = dict(
            (k.strip(), v.strip())
            for k, v in (l.split(":", 1) for l in text.splitlines() if ":" in l)
        )
        name = ARM_CORES.get(parts.get("CPU part", ""), "ARM")

    return {"name": name, "cores": cores, "mhz": cpu_mhz()}


#: O cpuinfo do ARM identifica o núcleo por um código, não por nome.
ARM_CORES = {
    "0xd03": "Cortex-A53",
    "0xd08": "Cortex-A72",
    "0xd0b": "Cortex-A76",
}


def cpu_mhz() -> float:
    """Frequência atual, que num Pi varia com governor e temperatura."""
    khz = _first_line("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq")
    if khz.isdigit():
        return round(int(khz) / 1000, 1)
    for line in _read(PROC / "cpuinfo").splitlines():
        if line.startswith("cpu MHz"):
            return round(float(line.split(":", 1)[1]), 1)
    return 0.0


def temperature() -> float | None:
    """Temperatura da CPU em graus. É o dado que mais convence que a máquina existe."""
    for zone in sorted(Path("/sys/class/thermal").glob("thermal_zone*")):
        raw = _first_line(zone / "temp")
        if raw.lstrip("-").isdigit():
            return round(int(raw) / 1000, 1)
    return None


# --------------------------------------------------------------------------
# memória
# --------------------------------------------------------------------------


def meminfo() -> dict[str, int]:
    values: dict[str, int] = {}
    for line in _read(PROC / "meminfo").splitlines():
        key, _, rest = line.partition(":")
        number = rest.strip().split(" ")[0]
        if number.isdigit():
            values[key] = int(number)

    total = values.get("MemTotal", 0)
    free = values.get("MemFree", 0)
    available = values.get("MemAvailable", free)
    # O `free` conta Buffers + Cached + SReclaimable como recuperável, e desconta
    # Shmem, que parece cache mas não é liberável.
    buff_cache = (
        values.get("Buffers", 0)
        + values.get("Cached", 0)
        + values.get("SReclaimable", 0)
        - values.get("Shmem", 0)
    )
    swap_total = values.get("SwapTotal", 0)

    return {
        "totalKb": total,
        "freeKb": free,
        "availableKb": available,
        "buffCacheKb": max(buff_cache, 0),
        "sharedKb": values.get("Shmem", 0),
        "usedKb": max(total - free - max(buff_cache, 0), 0),
        "swapTotalKb": swap_total,
        "swapFreeKb": values.get("SwapFree", 0),
        "swapUsedKb": max(swap_total - values.get("SwapFree", 0), 0),
    }


# --------------------------------------------------------------------------
# disco
# --------------------------------------------------------------------------

#: Pseudo-filesystems que o `df` de verdade também esconde.
VIRTUAL_FS = {
    "proc", "sysfs", "devtmpfs", "devpts", "tmpfs", "cgroup", "cgroup2",
    "securityfs", "pstore", "bpf", "configfs", "debugfs", "tracefs",
    "fusectl", "mqueue", "hugetlbfs", "autofs", "ramfs", "overlay", "squashfs",
}


def disks() -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    seen: set[str] = set()

    for line in _read(PROC / "mounts").splitlines():
        parts = line.split()
        if len(parts) < 3:
            continue
        device, mount, fstype = parts[0], parts[1].replace("\\040", " "), parts[2]
        if fstype in VIRTUAL_FS or device in seen:
            continue

        try:
            st = os.statvfs(mount)
        except OSError:
            continue
        if st.f_blocks == 0:
            continue

        seen.add(device)
        block = st.f_frsize
        size = st.f_blocks * block // 1024
        avail = st.f_bavail * block // 1024
        # O `df` calcula o percentual sobre o que é utilizável, não sobre o total:
        # os blocos reservados ao root não contam para ninguém.
        used = (st.f_blocks - st.f_bfree) * block // 1024
        usable = used + avail
        out.append(
            {
                "device": device,
                "mount": mount,
                "fstype": fstype,
                "sizeKb": size,
                "usedKb": used,
                "availKb": avail,
                "usePct": round(used * 100 / usable) if usable else 0,
            }
        )

    return sorted(out, key=lambda d: d["mount"])


# --------------------------------------------------------------------------
# processos
# --------------------------------------------------------------------------

#: O `comm` do kernel vem entre parênteses e pode conter parênteses e espaços,
#: então o corte tem que ser pelo ÚLTIMO ')', não pelo primeiro.
STAT_RE = re.compile(r"^(\d+) \((.*)\) (.+)$", re.DOTALL)

_CLOCK_TICKS = os.sysconf("SC_CLK_TCK") if hasattr(os, "sysconf") else 100


def _username(uid: int) -> str:
    try:
        return pwd.getpwuid(uid).pw_name
    except KeyError:
        return str(uid)


def processes(previous: dict[int, int], elapsed_jiffies: int) -> tuple[list[dict[str, object]], dict[int, int]]:
    """Lista de processos com CPU% medido contra a amostra anterior.

    Devolve também a amostra nova, para o próximo ciclo. Na primeira chamada o
    CPU% de todo mundo sai zerado — é o mesmo que o `top` faz.
    """
    mem_total = meminfo()["totalKb"] or 1
    current: dict[int, int] = {}
    out: list[dict[str, object]] = []

    for entry in PROC.iterdir():
        if not entry.name.isdigit():
            continue
        pid = int(entry.name)

        match = STAT_RE.match(_read(entry / "stat"))
        if not match:
            continue  # processo morreu entre o listdir e o read

        comm = match.group(2)
        if comm in HIDDEN_PROCESSES:
            continue

        fields = match.group(3).split()
        state = fields[0]
        # Campos 14 e 15 do stat (1-indexados) são utime e stime; aqui o group(3)
        # já começa no campo 3, então o deslocamento é 11.
        ticks = int(fields[11]) + int(fields[12])
        current[pid] = ticks

        used = ticks - previous.get(pid, ticks)
        cpu_pct = round(used * 100 / elapsed_jiffies, 1) if elapsed_jiffies > 0 else 0.0

        try:
            uid = entry.stat().st_uid
        except OSError:
            continue

        rss_kb = 0
        for line in _read(entry / "status").splitlines():
            if line.startswith("VmRSS:"):
                rss_kb = int(line.split()[1])
                break

        cmdline = _read(entry / "cmdline").replace("\x00", " ").strip()

        out.append(
            {
                "pid": pid,
                "user": _username(uid),
                "state": state,
                "cpuPct": cpu_pct,
                "memPct": round(rss_kb * 100 / mem_total, 1),
                "rssKb": rss_kb,
                "timeSec": round(ticks / _CLOCK_TICKS, 1),
                "comm": comm,
                "command": cmdline or f"[{comm}]",
            }
        )

    out.sort(key=lambda p: (-p["cpuPct"], -p["rssKb"]))
    return out[:MAX_PROCESSES], current


# --------------------------------------------------------------------------
# snapshot completo
# --------------------------------------------------------------------------


#: Arquivos de /proc que o `cat` do terminal pode ler, crus. São os que falam do
#: hardware e da carga — nada sobre quem está logado ou o que está rodando.
PUBLIC_PROC = ("cpuinfo", "meminfo", "uptime", "loadavg", "version")


def public_proc(name: str) -> str:
    """Conteúdo de um /proc da lista pública. Fora do Linux, sintetiza o mínimo."""
    if LINUX:
        return _read(PROC / name)

    from . import fake

    return fake.proc(name)


class Sampler:
    """Guarda a amostra anterior, que é o que torna o CPU% possível."""

    def __init__(self) -> None:
        self._cpu: tuple[int, int] | None = None
        self._procs: dict[int, int] = {}

    def snapshot(self) -> dict[str, object]:
        busy, total = cpu_jiffies()
        if self._cpu is None:
            cpu_pct, elapsed = 0.0, 0
        else:
            prev_busy, prev_total = self._cpu
            elapsed = total - prev_total
            cpu_pct = round((busy - prev_busy) * 100 / elapsed, 1) if elapsed > 0 else 0.0
        self._cpu = (busy, total)

        procs, self._procs = processes(self._procs, elapsed)

        return {
            "generatedAt": int(time.time()),
            "hostname": os.uname().nodename,
            "model": model(),
            "kernel": kernel(),
            "uptimeSec": uptime(),
            "load": loadavg(),
            "cpu": {**cpu_static(), "usagePct": cpu_pct, "tempC": temperature()},
            "mem": meminfo(),
            "disks": disks(),
            "processes": procs,
            "synthetic": False,
        }
