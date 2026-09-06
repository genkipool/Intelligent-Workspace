import json
import zipfile
from pathlib import Path

# The `key` field pins the UNPACKED extension to one id
# (phfhghnjjimkbbmfjcjgaegjombeophi) instead of a fresh one per machine, so the payment
# site can name that id in its `frame-ancestors` once and have it keep working.
#
# It has no business in the uploaded package. The Chrome Web Store assigns the published
# id from its own key and ignores this one, so shipping it achieves nothing while
# putting a second identity in front of a reviewer who is reading the manifest — and it
# would quietly stop matching the moment the development key were ever rotated.
#
# So: present in the source manifest, stripped from the zip. Development and production
# are the two ids the site trusts, and each is produced by the build that needs it.
STRIPPED_MANIFEST_KEYS = ('key',)

# A payment origin that is not production must never reach the zip.
#
# `check:release` guards the fallback written in `src/config/payments.js`, which is the
# only thing it can see: it runs before the build and reads source. But the origin is
# `import.meta.env.VITE_PAYMENT_ORIGIN || <fallback>`, so an uncommented line in
# `.env.local` overrides it at build time and the check still reports "payment origin is
# production" — measured, not assumed. The build then carries `https://localhost:4321`
# into `paymentService`, and every contribution in the published extension quietly goes
# nowhere with nothing in the panel to say why.
#
# This runs on `dist`, which is the artifact that actually gets uploaded, so it catches
# the mistake no matter how the build was produced.
FORBIDDEN_IN_RELEASE = ('localhost', '127.0.0.1', 'http://')


def check_no_dev_origin(dist_dir):
    offenders = []
    for file in dist_dir.rglob('*'):
        if not file.is_file() or file.suffix not in ('.js', '.html', '.json'):
            continue
        try:
            text = file.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue
        for needle in ('https://localhost', 'http://localhost', 'https://127.0.0.1', 'http://127.0.0.1'):
            if needle in text:
                offenders.append(f"{file.relative_to(dist_dir)} -> {needle}")
                break
    if offenders:
        raise SystemExit(
            "Refusing to package: the build points at a development origin.\n  "
            + "\n  ".join(offenders)
            + "\n\nComment out VITE_PAYMENT_ORIGIN in .env.local and run `pnpm run build` again."
        )


def create_zip():
    base_dir = Path(__file__).resolve().parent.parent
    dist_dir = base_dir / 'dist'
    zip_path = base_dir / 'intelligent-workspace-extension.zip'

    if not dist_dir.exists():
        raise FileNotFoundError(f"Directory {dist_dir} does not exist. Run 'pnpm run build' first.")

    manifest_file = dist_dir / 'manifest.json'
    if not manifest_file.exists():
        raise FileNotFoundError(f"manifest.json not found in {dist_dir}!")

    check_no_dev_origin(dist_dir)

    manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
    stripped = [k for k in STRIPPED_MANIFEST_KEYS if manifest.pop(k, None) is not None]
    manifest_bytes = json.dumps(manifest, indent=2, ensure_ascii=False).encode('utf-8')

    if zip_path.exists():
        zip_path.unlink()

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # The manifest goes in from memory, not from disk, so the copy on disk stays the
        # one an unpacked load reads.
        zipf.writestr('manifest.json', manifest_bytes)
        for file in dist_dir.rglob('*'):
            if not file.is_file():
                continue
            arcname = file.relative_to(dist_dir)
            if arcname.as_posix() == 'manifest.json':
                continue
            zipf.write(file, arcname)

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    note = f" (stripped: {', '.join(stripped)})" if stripped else ""
    print(f"Extension packaged successfully: {zip_path.name} ({size_mb:.2f} MB){note}")


if __name__ == '__main__':
    create_zip()
