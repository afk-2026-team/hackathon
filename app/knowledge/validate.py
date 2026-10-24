"""OKF 번들 검증 CLI — `uv run python -m app.knowledge.validate Crawling_DB`. 위반이 있으면 exit 1."""

from __future__ import annotations

import sys

from app.knowledge.okf import validate_bundle


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("사용법: python -m app.knowledge.validate <bundle 경로>", file=sys.stderr)
        return 2
    errors, counts = validate_bundle(argv[0])
    for e in errors:
        print(f"❌ {e}")
    print(" ".join(f"{k}={v}" for k, v in counts.items()))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
