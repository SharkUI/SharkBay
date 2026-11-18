"""Reproduce TypeScript stale-output behavior without building or launching SharkBay."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile

snapshot = Path(sys.argv[1]).resolve()
compiler = snapshot / "node_modules/typescript/bin/tsc"
with tempfile.TemporaryDirectory(prefix="sharkbay-audit-build-") as directory:
    root = Path(directory)
    source = root / "src"
    source.mkdir()
    (source / "live.ts").write_text("export const live = 1;\n")
    old = source / "removed.ts"
    old.write_text("export const removed = 1;\n")
    for iteration in range(2):
        if iteration:
            old.unlink()
        command = ["node", str(compiler), "--skipLibCheck", "--target", "ES2022",
                   "--module", "commonjs", "--outDir", str(root / "dist"),
                   *[str(p) for p in sorted(source.glob("*.ts"))]]
        subprocess.run(command, cwd=root, check=True, capture_output=True, timeout=15)
    assert not old.exists()
    assert (root / "dist/removed.js").is_file()
    package = json.loads((snapshot / "package.json").read_text())
    assert "dist-electron/**/*" in package["build"]["files"]
    print("PASS: deleted source leaves old emitted JS after second compile; desktop packaging includes broad output glob")
