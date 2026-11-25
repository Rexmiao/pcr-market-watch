"""Build the portable Windows ZIP from a checked and built source tree."""
from pathlib import Path
import hashlib,json,zipfile

root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
out=root/'release';out.mkdir(exist_ok=True)
archive=out/f'pcr-market-watch-v{version}-windows.zip'
excluded={'.git','node_modules','qa','.wrangler','.preview-profile','local-data','release'}
files=[]
for file in root.rglob('*'):
    if not file.is_file() or excluded.intersection(file.relative_to(root).parts):continue
    if file.name.startswith('.env') or file.suffix in {'.sqlite3','.sqlite','.db','.dpapi','.log','.pem','.key'}:
        raise RuntimeError('Unexpected runtime or credential file in release source')
    files.append(file)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9,strict_timestamps=False) as output:
    for file in sorted(files):
        name='pcr-market-watch/'+file.relative_to(root).as_posix()
        if file.suffix=='.cmd':
            contents=file.read_text(encoding='utf-8').replace('\r\n','\n').replace('\n','\r\n')
            output.writestr(name,contents.encode('utf-8'))
        else:output.write(file,name)
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'SHA256SUMS.txt').write_text(digest+'  '+archive.name+'\n',encoding='ascii')
print(archive.name)
