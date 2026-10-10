#!/usr/bin/env python3
"""Optional operator-reviewed downloads; shipped unresolved URLs are never guessed."""
import argparse,json,pathlib,shutil,tempfile,urllib.request,os

def download(url,target,size):
    target=pathlib.Path(target)
    if target.exists():return 'preserved'
    if size<=0:raise ValueError('Verified expected size required')
    target.parent.mkdir(parents=True,exist_ok=True)
    if shutil.disk_usage(target.parent).free<size+64*1024*1024:raise OSError('Insufficient free space')
    fd,tmp=tempfile.mkstemp(prefix='.download-',dir=target.parent)
    try:
        with os.fdopen(fd,'wb') as out,urllib.request.urlopen(url,timeout=60) as response:
            count=0
            while chunk:=response.read(1024*1024):
                count+=len(chunk)
                if count>size:raise ValueError('Response exceeds verified size')
                out.write(chunk)
            if count!=size:raise ValueError('Incomplete response')
            out.flush();os.fsync(out.fileno())
        # Exclusive hard-link publication: cannot overwrite a concurrent complete file.
        os.link(tmp,target)
        return 'downloaded'
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest',type=pathlib.Path,default=pathlib.Path(__file__).with_name('comfy-model-manifest.json'));p.add_argument('--models-dir',type=pathlib.Path,required=True);p.add_argument('--consent',action='store_true');a=p.parse_args()
    if not a.consent:p.error('Explicit --consent required after reviewing URLs, licenses and space')
    for m in json.loads(a.manifest.read_text())['models']:
        if not m.get('url') or not m.get('sizeBytes') or m['targetDirectory']=='manual-unresolved':raise ValueError('Manual resolution required: '+m['filename'])
        target=(a.models_dir/m['targetDirectory']/m['filename']).resolve()
        if not target.is_relative_to(a.models_dir.resolve()):raise ValueError('Unsafe destination')
        print(m['filename'],download(m['url'],target,m['sizeBytes']))
if __name__=='__main__':main()
