"""Скриптовый бот: доказательство, что «руки» работают.

Никакой нейросети здесь нет и не нужно. Задача этого файла — показать, что
внешняя программа может читать состояние игры и управлять персонажем. Пока
это не работает, любая модель — мозг без рук.

Мы слушаем, а подключается клиент. Так проще запускать дюжину экземпляров:
у обучения один процесс, у игры много, и искать друг друга должен тот, кого
меньше.
"""

from __future__ import annotations

import argparse
import json
import math
import socket

# Кнопки Quake. BUTTON_ATTACK — первый бит, это часть протокола, не наша выдумка.
ATTACK = 1

# Предельное значение движения в usercmd. Меньше — идти медленнее.
FULL = 127


def decide(state: dict) -> dict:
    """Куда идти и куда стрелять.

    Правило простое: если кто-то виден — довернуть на него и стрелять,
    иначе бежать вперёд и осматриваться. Это не «умный бот», это проверка
    того, что команды доходят и влияют на игру.
    """
    me = state.get("origin", [0, 0, 0])
    yaw = state.get("angles", [0, 0])[1]

    # Кого видно. Тип 1 — игрок; остальное нам сейчас неинтересно.
    targets = [e for e in state.get("entities", []) if e.get("t") == 1]
    if not targets:
        return {"forward": FULL, "right": 0, "up": 0, "buttons": 0, "dyaw": 3.0, "dpitch": 0.0}

    target = min(targets, key=lambda e: _distance(me, e["o"]))
    wanted = math.degrees(math.atan2(target["o"][1] - me[1], target["o"][0] - me[0]))
    turn = _shortest_turn(yaw, wanted)

    # Стреляем, только когда цель уже примерно перед носом: иначе агент
    # расстреливает стены и учится, что стрельба бесполезна.
    aimed = abs(turn) < 10
    return {
        "forward": FULL if aimed else 0,
        "right": 0,
        "up": 0,
        "buttons": ATTACK if aimed else 0,
        "dyaw": max(-12.0, min(12.0, turn)),
        "dpitch": 0.0,
    }


def _distance(a: list[float], b: list[float]) -> float:
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def _shortest_turn(current: float, wanted: float) -> float:
    """Короткий поворот: через 359° в 1° надо идти вперёд, а не назад."""
    return (wanted - current + 180) % 360 - 180


def serve(port: int, verbose: bool) -> None:
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("0.0.0.0", port))
    listener.listen(8)
    print(f"жду клиента на порту {port}")

    while True:
        client, address = listener.accept()
        print(f"клиент подключился: {address[0]}")
        steps = 0
        try:
            with client.makefile("rwb") as stream:
                for line in stream:
                    state = json.loads(line)
                    action = decide(state)
                    stream.write((json.dumps(action) + "\n").encode())
                    stream.flush()
                    steps += 1
                    if verbose and steps % 40 == 0:
                        print(
                            f"шаг {steps}: жизни {state.get('health')} "
                            f"скорость {_distance([0, 0, 0], state.get('velocity', [0, 0, 0])):.0f} "
                            f"видно {len(state.get('entities', []))}"
                        )
        except (OSError, ValueError) as err:
            print(f"клиент отвалился на шаге {steps}: {err}")
        finally:
            client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Скриптовый бот для arena")
    parser.add_argument("--port", type=int, default=27970)
    parser.add_argument("--quiet", action="store_true")
    serve(parser.parse_args().port, not parser.parse_args().quiet)
