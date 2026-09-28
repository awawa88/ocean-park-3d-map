"""
Trace coarse layout masks from the reference sheet (refs/op_sheet_2678.png).

The sheet is a layout reference only. This script classifies each pixel into
sea / plaza / forest / grass / road, cleans the result, and writes two small
flat-colour mask images that the app paints its own original ground from:

  public/ground-a.png   R = land (1) vs sea (0)
                        G = developed park ground (plazas, rides, buildings)
                        B = dense forest
  public/ground-b.png   R = asphalt road outside the park
                        G = inland water (lagoon, rapids channel)
                        B = unused

No artwork, colour or texture from the sheet is copied: every channel is a
binary class mask, blurred slightly so the shader can threshold a smooth edge.

Run: python3 scripts/trace_sheet.py   (needs Pillow only)
"""
import math
from collections import deque
from PIL import Image, ImageFilter

SRC = "refs/op_sheet_2678.png"
FULL_W, FULL_H = 2678, 2190
K = 4  # downsample factor
W, H = FULL_W // K, FULL_H // K

SEA, PLAZA, FOREST, GRASS, ROAD, UNKNOWN = 0, 1, 2, 3, 4, 9

# Sheet overlays that are not ground: labels, legend panels, logos (full-res px).
MASK_OUT = [
    (1130, 1350, 2678, 2190),  # zone legend tables
    (0, 1840, 1130, 2190),  # bottom-left legend
    (0, 1530, 240, 1840),  # sponsor logos
    (820, 1500, 1010, 1770),  # water world / hotel card + shuttle label
    (360, 1280, 610, 1390),  # hotel logo
    (195, 250, 455, 305),  # Whiskers Harbour label
    (40, 675, 385, 745),  # The Waterfront label
    (140, 785, 485, 855),  # Amazing Asian Animals label
    (495, 1140, 665, 1195),  # Aqua City label
    (955, 850, 1195, 905),  # Polar Adventure label
    (1045, 1020, 1275, 1080),  # Thrill Mountain label
    (1495, 1165, 1705, 1220),  # Rainforest label
    (1695, 365, 1905, 420),  # Marine World label
    (2320, 570, 2678, 660),  # The Summit label
    (1010, 10, 1700, 270),  # logo
]

# Inland water, authored as circles/ellipses in full-res px (cx, cy, rx, ry).
INLAND_WATER = [
    (763, 1291, 60, 60),  # Aqua City lagoon, fitted inside the ring of paths
]

# Land the sheet hides under labels near the coast; force land here.
FORCE_LAND = [
    (2320, 570, 2440, 660),
]


def classify(rgb, blur):
    r, g, b = rgb
    R, G, B = blur
    if b > r + 25 and b > g - 5:
        return SEA
    if r > 225 and g > 228 and b > 232:
        return SEA
    if g > r + 8 and g > b + 8:
        lum = 0.3 * R + 0.59 * G + 0.11 * B
        return FOREST if lum < 122 else GRASS
    sat = max(r, g, b) - min(r, g, b)
    if sat < 26 and 95 < (r + g + b) / 3 < 215:
        return ROAD
    return PLAZA


def main():
    im = Image.open(SRC).convert("RGB")
    sm = im.resize((W, H), Image.BOX)
    blurred = sm.filter(ImageFilter.GaussianBlur(2))
    px, bl = sm.load(), blurred.load()
    cls = [[classify(px[x, y], bl[x, y]) for x in range(W)] for y in range(H)]

    for x0, y0, x1, y1 in MASK_OUT:
        for y in range(y0 // K, min(H, y1 // K + 1)):
            for x in range(x0 // K, min(W, x1 // K + 1)):
                cls[y][x] = UNKNOWN

    # Sea = the connected blue/white body touching the top-right; everything else is land.
    sea = [[False] * W for _ in range(H)]
    q = deque([(1700 // K, 300 // K), (2600 // K, 900 // K), (2500 // K, 60 // K)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= W or y >= H or sea[y][x]:
            continue
        if cls[y][x] not in (SEA, UNKNOWN):
            continue
        # Unknown cells only join the sea across the logo, not the legend.
        if cls[y][x] == UNKNOWN and y * K > 300:
            continue
        sea[y][x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    for y in range(H):
        for x in range(W):
            if cls[y][x] == SEA and not sea[y][x]:
                cls[y][x] = PLAZA  # blue roofs, pools — treat as developed ground
            if sea[y][x]:
                cls[y][x] = SEA

    # Summit north shore: coaster track and white station roofs read as sea; the coast runs here.
    shore = [(1000, 610), (1100, 565), (1250, 540), (1400, 505), (1550, 465), (1700, 425)]
    for x in range(1000 // K, 1700 // K):
        fx = x * K
        for (ax, ay), (bx, by) in zip(shore, shore[1:]):
            if ax <= fx <= bx:
                limit = ay + (by - ay) * (fx - ax) / (bx - ax)
                break
        for y in range(int(limit) // K, 800 // K):
            if cls[y][x] == SEA:
                cls[y][x] = UNKNOWN
    for x0, y0, x1, y1 in FORCE_LAND:
        for y in range(y0 // K, y1 // K):
            for x in range(x0 // K, x1 // K):
                if cls[y][x] == SEA:
                    cls[y][x] = UNKNOWN

    # Labels sitting on open grass outside the park.
    for x0, y0, x1, y1 in ((195, 250, 455, 305), (40, 675, 385, 745), (140, 785, 330, 855)):
        for y in range(y0 // K, y1 // K + 1):
            for x in range(x0 // K, x1 // K + 1):
                cls[y][x] = GRASS
    # Legend overlays hide hillside, not park: forest on the right, grass on the left.
    for y in range(1350 // K, H):
        for x in range(1130 // K, W):
            fy = y * K
            wob = 55 * math.sin(fy / 70.0) + 30 * math.sin(fy / 23.0 + 1.3)
            if x * K > 2250 + 0.9 * (fy - 1350) + 0.5 * wob:
                cls[y][x] = SEA
            elif x * K > 1000 + 0.55 * (fy - 1350) + wob:
                cls[y][x] = FOREST
            else:
                cls[y][x] = UNKNOWN
    for y in range(1840 // K, H):
        for x in range(0, 1130 // K):
            cls[y][x] = GRASS
    for y in range(1530 // K, 1840 // K):
        for x in range(0, 240 // K):
            cls[y][x] = GRASS

    # Fill the remaining unknown cells from their nearest known neighbour (BFS wavefront).
    q = deque((x, y) for y in range(H) for x in range(W) if cls[y][x] != UNKNOWN)
    while q:
        x, y = q.popleft()
        c = cls[y][x]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and cls[ny][nx] == UNKNOWN:
                cls[ny][nx] = c
                q.append((nx, ny))

    # Land is one body connected to the mainland on the left; anything else is sea
    # (birds, the white haze and logo scraps floating in the bay).
    land_reach = [[False] * W for _ in range(H)]
    q = deque([(10, 10), (10, H - 10), (W // 2, H - 10)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= W or y >= H or land_reach[y][x] or cls[y][x] == SEA:
            continue
        land_reach[y][x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    for y in range(H):
        for x in range(W):
            if not land_reach[y][x]:
                cls[y][x] = SEA

    def channel(pred, radius, close=0, open_=0):
        img = Image.new("L", (W, H))
        img.putdata([255 if pred(cls[y][x]) else 0 for y in range(H) for x in range(W)])
        img = img.filter(ImageFilter.ModeFilter(5))
        if close:
            img = img.filter(ImageFilter.MaxFilter(close)).filter(ImageFilter.MinFilter(close))
        if open_:
            img = img.filter(ImageFilter.MinFilter(open_)).filter(ImageFilter.MaxFilter(open_))
        return img.filter(ImageFilter.GaussianBlur(radius))

    land = channel(lambda c: c != SEA, 1.6, close=9, open_=5)
    plaza = channel(lambda c: c in (PLAZA, ROAD), 1.4, close=5, open_=3)
    forest = channel(lambda c: c == FOREST, 1.4, close=3, open_=3)
    road = channel(lambda c: c == ROAD, 1.0, open_=3)

    water = Image.new("L", (W, H))
    wp = water.load()
    for cx, cy, rx, ry in INLAND_WATER:
        for y in range(H):
            for x in range(W):
                dx = (x * K - cx) / rx
                dy = (y * K - cy) / ry
                if dx * dx + dy * dy < 1:
                    wp[x, y] = 255
    water = water.filter(ImageFilter.GaussianBlur(1.2))

    write_grids(land, plaza)
    Image.merge("RGB", (land, plaza, forest)).save("public/ground-a.png", optimize=True)
    Image.merge("RGB", (road, water, Image.new("L", (W, H)))).save("public/ground-b.png", optimize=True)
    print(f"wrote public/ground-a.png, public/ground-b.png at {W}x{H}")


def chamfer(inside):
    """Approximate Euclidean distance (in mask cells) to the nearest cell where inside is False."""
    INF = 10 ** 9
    d = [[0 if not inside[y][x] else INF for x in range(W)] for y in range(H)]
    a, b = 1.0, 1.4142
    for y in range(H):
        row, up = d[y], d[y - 1] if y else None
        for x in range(W):
            v = row[x]
            if v == 0:
                continue
            if x:
                v = min(v, row[x - 1] + a)
            if up:
                v = min(v, up[x] + a)
                if x:
                    v = min(v, up[x - 1] + b)
                if x < W - 1:
                    v = min(v, up[x + 1] + b)
            row[x] = v
    for y in range(H - 1, -1, -1):
        row, dn = d[y], d[y + 1] if y < H - 1 else None
        for x in range(W - 1, -1, -1):
            v = row[x]
            if v == 0:
                continue
            if x < W - 1:
                v = min(v, row[x + 1] + a)
            if dn:
                v = min(v, dn[x] + a)
                if x < W - 1:
                    v = min(v, dn[x + 1] + b)
                if x:
                    v = min(v, dn[x - 1] + b)
            row[x] = v
    return d


def write_grids(land_img, plaza_img):
    """Coast signed distance and plaza weight as compact grids for src/generated/ground-grid.ts."""
    import base64

    lp = land_img.load()
    is_land = [[lp[x, y] >= 128 for x in range(W)] for y in range(H)]
    is_sea = [[not v for v in row] for row in is_land]
    d_in = chamfer(is_land)
    d_out = chamfer(is_sea)
    unit = K * 0.016  # one mask cell in model units
    step = 2  # grid = every 2nd mask cell (8 sheet px)
    gw, gh = (W + step - 1) // step, (H + step - 1) // step
    sdf = bytearray()
    for gy in range(gh):
        for gx in range(gw):
            x, y = min(W - 1, gx * step), min(H - 1, gy * step)
            v = (d_in[y][x] - 0.5 if is_land[y][x] else -(d_out[y][x] - 0.5)) * unit
            v = max(-4.0, min(4.0, v))
            sdf.append(round((v + 4.0) / 8.0 * 255))
    pw, ph = (W + 3) // 4, (H + 3) // 4
    pim = plaza_img.filter(ImageFilter.GaussianBlur(2)).resize((pw, ph), Image.BILINEAR)
    plaza = bytes(pim.getdata())
    cell = step * K * 0.016
    x0 = -1339 * 0.016
    z0 = -1095 * 0.016
    with open("src/generated/ground-grid.ts", "w") as f:
        f.write("// Generated by scripts/trace_sheet.py from the layout reference. Do not edit by hand.\n")
        f.write("// SDF: signed distance to the coast in model units (land > 0), byte = (d + 4) / 8 * 255.\n")
        f.write("// PLAZA: 0-255 weight of developed park ground.\n")
        f.write(f"export const SDF_GRID = {{ x0: {x0}, z0: {z0}, step: {cell}, cols: {gw}, rows: {gh}, data: \"{base64.b64encode(bytes(sdf)).decode()}\" }};\n")
        f.write(f"export const PLAZA_GRID = {{ x0: {x0}, z0: {z0}, step: {K * 4 * 0.016}, cols: {pw}, rows: {ph}, data: \"{base64.b64encode(plaza).decode()}\" }};\n")
    print(f"wrote src/generated/ground-grid.ts sdf {gw}x{gh} plaza {pw}x{ph}")


if __name__ == "__main__":
    main()
