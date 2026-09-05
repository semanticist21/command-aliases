#!/usr/bin/env python3
"""Normalize an already transparent icon using ImageMagick, without overwrites."""
import argparse
import math
from pathlib import Path
import re
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--size', type=int, default=256)
    parser.add_argument('--fill', type=float, default=0.72)
    parser.add_argument('--threshold', type=float, default=1)
    args = parser.parse_args()
    if not 1 <= args.size <= 8192 or not 0 < args.fill <= 1:
        parser.error('size must be 1..8192 and fill must be greater than 0 and at most 1')
    if not math.isfinite(args.threshold) or not 0 <= args.threshold < 100:
        parser.error('threshold must be 0..<100 percent')
    if not args.source.is_file() or args.output.suffix.lower() != '.webp':
        parser.error('source must exist and output must end in .webp')
    if args.output.exists() or args.output.is_symlink():
        parser.error('output already exists; choose a new output path')
    magick = shutil.which('magick')
    if not magick:
        parser.error('ImageMagick 7 (magick) is required')
    source = str(args.source.resolve())

    def run(*options):
        return subprocess.run([magick, source, *options], check=True,
                              capture_output=True).stdout

    opaque = run('-format', '%[opaque]', 'info:').decode().strip().lower()
    if opaque != 'false':
        parser.error('input is opaque; extract its background before normalization')
    maximum = float(run('-alpha', 'extract', '-format', '%[fx:maxima]', 'info:'))
    if maximum <= args.threshold / 100:
        parser.error('input has no visible subject above the alpha threshold')
    # A black border makes trim measure visible alpha even when the subject
    # touches every original edge and has a transparent hole in the middle.
    geometry = run('-alpha', 'extract', '-threshold', f'{args.threshold}%',
                   '-bordercolor', 'black', '-border', '1',
                   '-format', '%@', 'info:').decode().strip()
    match = re.fullmatch(r'(\d+)x(\d+)\+(\d+)\+(\d+)', geometry)
    if not match:
        parser.error('could not determine a single image alpha bounding box')
    width, height, left, top = map(int, match.groups())
    bounds = f'{width}x{height}{left - 1:+d}{top - 1:+d}'
    extent = max(1, round(args.size * args.fill))
    encoded = run('-crop', bounds, '+repage', '-resize', f'{extent}x{extent}',
                  '-background', 'none', '-gravity', 'center', '-extent',
                  f'{args.size}x{args.size}', '-define', 'webp:lossless=true',
                  '-define', 'webp:method=6', 'webp:-')
    with args.output.open('xb') as output:
        output.write(encoded)
    print(f'{args.output}: {args.size}x{args.size}, {len(encoded)} bytes; source bounds {bounds}')


if __name__ == '__main__':
    main()
