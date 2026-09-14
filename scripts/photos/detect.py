"""Find a device screen's corners: largest dark blob in a box, its edges fitted as four lines.
usage: detect.py photo.png x0,y0,x1,y1 [threshold]"""
import sys, cv2, numpy as np
img = cv2.imread(sys.argv[1]); x0, y0, x1, y1 = map(int, sys.argv[2].split(",")); t = int(sys.argv[3]) if len(sys.argv) > 3 else 40
g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (5, 5), 0)
m = np.zeros_like(g); m[y0:y1, x0:x1] = (g[y0:y1, x0:x1] < t) * 255
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = max(cs, key=cv2.contourArea).reshape(-1, 2).astype(np.float32)
hull = cv2.convexHull(c).reshape(-1, 2)
eps = 1.0
while True:
    ap = cv2.approxPolyDP(hull, eps, True).reshape(-1, 2)
    if len(ap) <= 4: break
    eps += 1
print("approx", ap.tolist(), "eps", eps, file=sys.stderr)
cv2.imwrite("mask.png", m)
# Refine: fit a line to the hull points nearest each side, intersect neighbours.
pts = c
lines = []
for i in range(4):
    p, q = ap[i], ap[(i + 1) % 4]
    d = q - p; n = np.array([-d[1], d[0]]) / np.linalg.norm(d)
    L = np.linalg.norm(d)
    t_ = ((pts - p) @ d) / (L * L)
    dist = np.abs((pts - p) @ n)
    sel = pts[(t_ > 0.25) & (t_ < 0.75) & (dist < 40)]
    vx, vy, cx, cy = cv2.fitLine(sel, cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
    lines.append((np.array([cx, cy]), np.array([vx, vy])))
def inter(a, b):
    (p, r), (q, s) = a, b
    cr = lambda u, v: u[0] * v[1] - u[1] * v[0]
    t = cr(q - p, s) / cr(r, s)
    return p + t * r
corners = np.array([inter(lines[i - 1], lines[i]) for i in range(4)])
# order: start at top-most-left by sum, clockwise
cen = corners.mean(0); ang = np.arctan2(corners[:, 1] - cen[1], corners[:, 0] - cen[0]); corners = corners[np.argsort(ang)]
k = np.argmin(corners.sum(1)); corners = np.roll(corners, -k, 0)
print(",".join(str(int(round(v))) for v in corners.ravel()), "area", int(cv2.contourArea(c)))
