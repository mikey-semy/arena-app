#!/usr/bin/env python3
"""Отправить команду rcon игровому серверу. Запускать НА хосте с игрой.

Именно там, а не со своей машины: пароль rcon ходит открытым текстом, и с
localhost он не покидает машину. Значение берётся из .env рядом и никогда
не печатается.

    scp scripts/rcon.py netcup:/srv/arena/rcon.py
    ssh netcup 'python3 /srv/arena/rcon.py status "match_readypercent"'
"""
import os, socket, sys, re
pw = None
for line in open("/srv/arena/.env"):
    m = re.match(r'\s*Q3_RCON_PASSWORD\s*=\s*(.*)', line)
    if m: pw = m.group(1).strip().strip('"').strip("'")
if not pw: sys.exit("нет Q3_RCON_PASSWORD в /srv/arena/.env")
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.settimeout(2.0)
for cmd in sys.argv[1:]:
    s.sendto(b"\xff\xff\xff\xff" + f'rcon {pw} {cmd}'.encode("latin1"), ("127.0.0.1", 27960))
    print("=== " + cmd)
    while True:
        try: print(s.recvfrom(65535)[0][4:].decode("latin1", "replace"), end="")
        except socket.timeout: break
    print()
