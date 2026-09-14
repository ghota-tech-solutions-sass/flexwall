"""Put a real screen render onto a device in a photograph.

usage: composite.py photo.png screen.png out.png [--quad x1,y1,x2,y2,x3,y3,x4,y4] [--radius 0.12] [--glare 0.35] [--inset 0.012] [--debug]
Corners go clockwise from top-left of the screen as it reads. Without --quad the
largest dark quadrilateral is used.
"""
import argparse, sys
import cv2, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("photo"); ap.add_argument("screen"); ap.add_argument("out")
ap.add_argument("--quad"); ap.add_argument("--radius", type=float, default=0.12)
ap.add_argument("--glare", type=float, default=0.3); ap.add_argument("--inset", type=float, default=0.01)
ap.add_argument("--dim", type=float, default=0.97); ap.add_argument("--debug", action="store_true")
ap.add_argument("--keep", action="append", help="x0,y0,x1,y1: restore light foreground objects (a stand, a finger) from the photo inside this box")
ap.add_argument("--cover", action="store_true", help="crop the render to the quad aspect instead of stretching")
a = ap.parse_args()

photo = cv2.imread(a.photo, cv2.IMREAD_COLOR)
screen = cv2.imread(a.screen, cv2.IMREAD_COLOR)
H, W = photo.shape[:2]

def order(pts):
    pts = np.array(pts, dtype=np.float32)
    c = pts.mean(axis=0)
    ang = np.arctan2(pts[:, 1] - c[1], pts[:, 0] - c[0])
    pts = pts[np.argsort(ang)]  # clockwise in image coords starting around -pi (left)
    # start at the point closest to top-left
    start = np.argmin(pts.sum(axis=1))
    return np.roll(pts, -start, axis=0)

if a.quad:
    v = [float(x) for x in a.quad.split(",")]
    quad = np.array(v, dtype=np.float32).reshape(4, 2)
else:
    g = cv2.cvtColor(photo, cv2.COLOR_BGR2GRAY)
    g = cv2.GaussianBlur(g, (5, 5), 0)
    best = None
    for t in (30, 40, 50, 60, 75):
        m = (g < t).astype(np.uint8) * 255
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cs:
            area = cv2.contourArea(c)
            if area < W * H * 0.01: continue
            hull = cv2.convexHull(c)
            approx = cv2.approxPolyDP(hull, 0.02 * cv2.arcLength(hull, True), True)
            if len(approx) != 4: continue
            score = area / max(cv2.contourArea(hull), 1)
            if best is None or area * score > best[0]: best = (area * score, approx.reshape(4, 2), t)
    if best is None: sys.exit("no screen found, pass --quad")
    quad = order(best[1])
    print("detected", best[2], quad.round().astype(int).tolist())

# Shrink toward the centre so the bezel stays visible.
c = quad.mean(axis=0)
quad = c + (quad - c) * (1 - a.inset)

sh, sw = screen.shape[:2]
if a.cover:
    qw = (np.linalg.norm(quad[1] - quad[0]) + np.linalg.norm(quad[2] - quad[3])) / 2
    qh = (np.linalg.norm(quad[3] - quad[0]) + np.linalg.norm(quad[2] - quad[1])) / 2
    target = qh / qw
    if sh / sw > target:
        nh = int(sw * target); y = (sh - nh) // 2; screen = screen[y:y + nh]
    else:
        nw = int(sh / target); x = (sw - nw) // 2; screen = screen[:, x:x + nw]
    sh, sw = screen.shape[:2]
src = np.array([[0, 0], [sw, 0], [sw, sh], [0, sh]], dtype=np.float32)
M = cv2.getPerspectiveTransform(src, quad.astype(np.float32))
warped = cv2.warpPerspective(screen, M, (W, H), flags=cv2.INTER_LANCZOS4)

# Rounded-corner mask, drawn in screen space then warped, antialiased by supersampling.
k = 4
mask = np.zeros((sh * k // 4, sw * k // 4), np.uint8)
mh, mw = mask.shape
r = int(a.radius * mw)
cv2.rectangle(mask, (r, 0), (mw - r, mh), 255, -1); cv2.rectangle(mask, (0, r), (mw, mh - r), 255, -1)
for cx, cy in ((r, r), (mw - r, r), (r, mh - r), (mw - r, mh - r)): cv2.circle(mask, (cx, cy), r, 255, -1, cv2.LINE_AA)
Mm = cv2.getPerspectiveTransform(np.array([[0, 0], [mw, 0], [mw, mh], [0, mh]], np.float32), quad.astype(np.float32))
alpha = cv2.warpPerspective(mask, Mm, (W, H), flags=cv2.INTER_LINEAR).astype(np.float32) / 255
alpha = cv2.GaussianBlur(alpha, (3, 3), 0)[..., None]

# Keep the photo's reflections: screen-blend the original glass highlights over the render.
orig = photo.astype(np.float32) / 255
lum = cv2.cvtColor(photo, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
hi = np.clip((lum - np.percentile(lum[alpha[..., 0] > 0.5], 20)) * 1.6, 0, 1)[..., None]
glare = orig * hi * a.glare
scr = cv2.GaussianBlur(warped, (0, 0), 0.6).astype(np.float32) / 255 * a.dim
lit = 1 - (1 - scr) * (1 - glare)
out = orig * (1 - alpha) + lit * alpha
if a.keep:
    fg = np.zeros((H, W), np.float32)
    for box in a.keep:
        x0, y0, x1, y1 = map(int, box.split(","))
        fg[y0:y1, x0:x1] = np.clip((lum[y0:y1, x0:x1] - 0.22) / 0.12, 0, 1)
    fg = cv2.GaussianBlur(fg, (5, 5), 0)[..., None]
    out = out * (1 - fg) + orig * fg
out = np.clip(out * 255, 0, 255).astype(np.uint8)
if a.debug:
    cv2.polylines(out, [quad.astype(np.int32)], True, (0, 0, 255), 2)
cv2.imwrite(a.out, out)
print("wrote", a.out)
