"""
Snapshot sintético, para desenvolver o frontend fora de um Linux.

O macOS não tem /proc. Sem isso, `neofetch`, `top` e `free` só poderiam ser
testados no Pi — e o ciclo de desenvolvimento passaria por um deploy. Os números
oscilam de propósito: um `top` que repinta valores idênticos não exercita o
redesenho.

O campo `synthetic: true` viaja no JSON e o frontend o exibe, para que nunca
haja dúvida sobre estar olhando uma máquina de verdade.
"""

from __future__ import annotations

import math
import os
import time

BOOT = time.time() - 384_512


def _wobble(base: float, amplitude: float, period: float, phase: float = 0.0) -> float:
    """Oscilação suave e determinística — sem random, para o valor não pular."""
    return round(base + amplitude * math.sin(time.time() / period + phase), 1)


PROCESSES = [
    ("root", 1, "systemd", "/sbin/init"),
    ("root", 412, "cloudflared", "/usr/bin/cloudflared tunnel run"),
    ("www-data", 588, "nginx", "nginx: worker process"),
    ("luiz", 731, "uvicorn", "/usr/bin/python3 -m uvicorn api.main:app"),
    ("root", 96, "kworker/0:1", "[kworker/0:1]"),
    ("root", 204, "sshd", "/usr/sbin/sshd -D"),
    ("root", 355, "systemd-journal", "/lib/systemd/systemd-journald"),
    ("luiz", 902, "bash", "-bash"),
]


def snapshot() -> dict[str, object]:
    total_kb = 8_215_040
    buff_cache = 2_140_000 + int(_wobble(0, 40_000, 47))
    used = 1_180_000 + int(_wobble(0, 90_000, 31))

    return {
        "generatedAt": int(time.time()),
        "hostname": os.uname().nodename,
        "model": "Raspberry Pi 4 Model B Rev 1.5",
        "kernel": {
            "release": "6.6.51-v8+",
            "version": "#1 SMP PREEMPT Debian 1:6.6.51-1+rpt3",
            "machine": "aarch64",
        },
        "uptimeSec": time.time() - BOOT,
        "load": {
            "avg": [_wobble(0.18, 0.12, 37), _wobble(0.22, 0.08, 91), _wobble(0.19, 0.05, 173)],
            "running": 1,
            "total": 148,
        },
        "cpu": {
            "name": "Cortex-A72",
            "cores": 4,
            "mhz": 1800.0,
            "usagePct": max(_wobble(4.5, 3.5, 19), 0.0),
            "tempC": _wobble(47.5, 2.5, 61),
        },
        "mem": {
            "totalKb": total_kb,
            "freeKb": total_kb - used - buff_cache,
            "availableKb": total_kb - used,
            "buffCacheKb": buff_cache,
            "sharedKb": 41_200,
            "usedKb": used,
            "swapTotalKb": 524_288,
            "swapFreeKb": 524_288,
            "swapUsedKb": 0,
        },
        "disks": [
            {
                "device": "/dev/mmcblk0p2",
                "mount": "/",
                "fstype": "ext4",
                "sizeKb": 119_234_560,
                "usedKb": 18_442_240,
                "availKb": 94_760_960,
                "usePct": 17,
            },
            {
                "device": "/dev/mmcblk0p1",
                "mount": "/boot/firmware",
                "fstype": "vfat",
                "sizeKb": 522_232,
                "usedKb": 62_104,
                "availKb": 460_128,
                "usePct": 12,
            },
        ],
        "processes": [
            {
                "pid": pid,
                "user": user,
                "state": "S",
                "cpuPct": max(_wobble(1.2, 1.4, 13, phase=index), 0.0),
                "memPct": round(0.4 + index * 0.3, 1),
                "rssKb": 12_000 + index * 7_400,
                "timeSec": 120.0 + index * 63,
                "comm": comm,
                "command": command,
            }
            for index, (user, pid, comm, command) in enumerate(PROCESSES)
        ],
        "synthetic": True,
    }


#: /proc sintético para o modo de desenvolvimento. Texto abreviado de propósito:
#: serve para o `cat` ter o que mostrar, não para imitar um Pi linha a linha.
def proc(name: str) -> str:
    snap = snapshot()

    if name == "cpuinfo":
        cpu = snap["cpu"]
        blocks = [
            f"processor\t: {n}\n"
            f"BogoMIPS\t: 108.00\n"
            f"Features\t: fp asimd evtstrm crc32 cpuid\n"
            f"CPU implementer\t: 0x41\n"
            f"CPU architecture: 8\n"
            f"CPU part\t: 0xd08\n"
            for n in range(int(cpu["cores"]))
        ]
        return "\n".join(blocks) + f"\nHardware\t: BCM2711\nModel\t\t: {snap['model']}\n"

    if name == "meminfo":
        mem = snap["mem"]
        rows = [
            ("MemTotal", mem["totalKb"]),
            ("MemFree", mem["freeKb"]),
            ("MemAvailable", mem["availableKb"]),
            ("Buffers", 88_400),
            ("Cached", mem["buffCacheKb"]),
            ("SwapTotal", mem["swapTotalKb"]),
            ("SwapFree", mem["swapFreeKb"]),
            ("Shmem", mem["sharedKb"]),
        ]
        return "".join(f"{k + ':':<16}{v:>9} kB\n" for k, v in rows)

    if name == "uptime":
        return f"{snap['uptimeSec']:.2f} {snap['uptimeSec'] * 3.6:.2f}\n"

    if name == "loadavg":
        avg = snap["load"]["avg"]
        return f"{avg[0]:.2f} {avg[1]:.2f} {avg[2]:.2f} {snap['load']['running']}/{snap['load']['total']} 1417\n"

    if name == "version":
        k = snap["kernel"]
        return f"Linux version {k['release']} (gcc version 12.2.0) {k['version']}\n"

    return ""
