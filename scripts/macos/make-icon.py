#!/usr/bin/env python3
"""Draw the FocusFlow app icon: a gold tile with a dark F."""

import struct
import sys
import zlib

SIZE = 1024
RADIUS = 224
GOLD = (217, 167, 95, 255)
INK = (23, 56, 47, 255)
CLEAR = (0, 0, 0, 0)


def in_round_rect(x: int, y: int) -> bool:
    if RADIUS <= x < SIZE - RADIUS and 0 <= y < SIZE:
        return True
    if 0 <= x < SIZE and RADIUS <= y < SIZE - RADIUS:
        return True
    centers = (
        (RADIUS, RADIUS),
        (SIZE - RADIUS - 1, RADIUS),
        (RADIUS, SIZE - RADIUS - 1),
        (SIZE - RADIUS - 1, SIZE - RADIUS - 1),
    )
    for cx, cy in centers:
        if (x - cx) ** 2 + (y - cy) ** 2 <= RADIUS ** 2:
            return True
    return False


def is_letter(x: int, y: int) -> bool:
    # Same proportions as the browser tab icon, scaled to 1024.
    if 288 <= x <= 448 and 192 <= y <= 832:
        return True
    if 288 <= x <= 752 and 192 <= y <= 352:
        return True
    if 288 <= x <= 656 and 464 <= y <= 624:
        return True
    return False


def write_png(path: str) -> None:
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)
        for x in range(SIZE):
            if not in_round_rect(x, y):
                raw.extend(CLEAR)
            elif is_letter(x, y):
                raw.extend(INK)
            else:
                raw.extend(GOLD)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)


if __name__ == "__main__":
    write_png(sys.argv[1])
