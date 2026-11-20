"""Create a deterministic, allowlisted runtime ZIP with verified checksums."""
import json
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
from verify_release import ROOT, RUNTIME_FILES, digest, package_metadata, verify_source, verify_package

version = verify_source()
output = ROOT / 'artifacts' / f'DarkerDocs-{version}.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in sorted(RUNTIME_FILES):
        entry = ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o644 << 16
        archive.writestr(entry, (ROOT / 'extension' / name).read_bytes())
output.with_suffix('.sha256').write_text(f'{digest(output.read_bytes())}  {output.name}\n')
output.with_suffix('.verification.json').write_text(json.dumps(package_metadata(version, output), indent=2) + '\n')
verify_package()
print(f'{output} ({output.stat().st_size:,} bytes; {len(RUNTIME_FILES)} verified entries)')
