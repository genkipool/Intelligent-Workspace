import os
import zipfile
from pathlib import Path

def create_zip():
    base_dir = Path(__file__).resolve().parent.parent
    dist_dir = base_dir / 'dist'
    zip_path = base_dir / 'intelligent-workspace-extension.zip'

    if not dist_dir.exists():
        raise FileNotFoundError(f"Directory {dist_dir} does not exist. Run 'pnpm run build' first.")

    manifest_file = dist_dir / 'manifest.json'
    if not manifest_file.exists():
        raise FileNotFoundError(f"manifest.json not found in {dist_dir}!")

    if zip_path.exists():
        zip_path.unlink()

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file in dist_dir.rglob('*'):
            if file.is_file():
                arcname = file.relative_to(dist_dir)
                zipf.write(file, arcname)

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"Extension packaged successfully: {zip_path.name} ({size_mb:.2f} MB)")

if __name__ == '__main__':
    create_zip()
