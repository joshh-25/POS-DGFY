#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


REPLACEMENTS = {
    "token": "__DEPLOY_TOKEN__",
    "backend_dir": "__BACKEND_DIR__",
    "ims_dir": "__IMS_DIR__",
    "pos_dir": "__POS_DIR__",
    "storefront_dir": "__STOREFRONT_DIR__",
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Render Namecheap shared deploy PHP templates.")
    parser.add_argument("--token", required=True)
    parser.add_argument("--backend-dir", required=True)
    parser.add_argument("--ims-dir", required=True)
    parser.add_argument("--pos-dir", required=True)
    parser.add_argument("--storefront-dir", required=True)
    parser.add_argument("--templates", default="scripts/deploy/namecheap-shared/templates")
    parser.add_argument("--output", default="deploy-scripts")
    args = parser.parse_args()

    values = {
        "token": args.token,
        "backend_dir": args.backend_dir,
        "ims_dir": args.ims_dir,
        "pos_dir": args.pos_dir,
        "storefront_dir": args.storefront_dir,
    }

    templates_dir = Path(args.templates)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    for template in sorted(templates_dir.glob("*.php")):
        content = template.read_text(encoding="utf-8")
        for key, placeholder in REPLACEMENTS.items():
            content = content.replace(placeholder, values[key])
        (output_dir / template.name).write_text(content, encoding="utf-8", newline="\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
