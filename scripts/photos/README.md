# Landing page photographs

The photos in `apps/web/public/photos` are generated locally, then real Flexwall
screens are composited onto the devices in them. Nothing is stock, and the
screens are the product as it renders.

1. **Generate the plate** with Qwen-Image (Apache 2.0) through mflux, device
   screens switched off so they read as black glass:

   ```sh
   mflux-generate-qwen -q 8 --steps 25 --width 1664 --height 1024 --seed 21 \
     --prompt "A modern black iPhone standing on a charging stand on a bedside table at dawn, screen facing the camera, turned off and completely black. Editorial lifestyle photograph shot on 35mm film, soft natural morning light, muted warm neutral grade, gentle film grain, no text, no logos" \
     --output nightstand.png
   ```

2. **Capture the screen**: a lock screen from `/demo/lockscreen.png` with the
   clock drawn on top, the wall page, or a chat thread, at device resolution.

3. **Find the screen corners** inside a box around the device:

   ```sh
   uv run --with opencv-python-headless --with numpy python detect.py nightstand.png 690,280,980,780
   ```

4. **Composite** (corners clockwise from the screen's top-left; `--keep` restores
   fingers or a stand that sit in front of the glass):

   ```sh
   uv run --with opencv-python-headless --with numpy python composite.py nightstand.png lock-dark.png out.png \
     --quad 720,300,948,300,953,793,713,793 --radius 0.13 --inset 0.02 --cover --dim 0.82 --keep 780,778,900,812
   ```

5. Export as JPEG (quality 86) into `apps/web/public/photos`. The page imports
   them statically, so Next serves AVIF/WebP at the right size with a blurred
   placeholder.
