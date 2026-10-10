#!/usr/bin/env python3
"""Offline preflight: no Docker start, downloads, imports or production requests."""
import argparse, ast, json, pathlib, subprocess, sys, os
ROOT=pathlib.Path(__file__).resolve().parent

def check_operator_image(image):
    if not image or not image.strip():
        raise ValueError('Set FFMPEG_IMAGE to your existing compatible FFmpeg API image; source is not bundled')
    result=subprocess.run(['docker','image','inspect',image],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if result.returncode:
        raise ValueError('FFMPEG_IMAGE is not locally available: obtain/build your compatible image from authorized external source before starting; no image is published here')

def check():
    compose=json.loads((ROOT/'compose.json').read_text())
    assert 'build' not in compose['services']['ffmpeg-api']
    assert 'FFMPEG_IMAGE' in compose['services']['ffmpeg-api']['image']
    image=os.environ.get('FFMPEG_IMAGE')
    if not image and (ROOT/'.env').is_file():
        image=next((line.split('=',1)[1].strip() for line in (ROOT/'.env').read_text().splitlines() if line.startswith('FFMPEG_IMAGE=')),None)
    check_operator_image(image)
    manifest=json.loads((ROOT/'manifest.json').read_text());compose=json.loads((ROOT/'compose.json').read_text())
    assert manifest['workflowCount']==len(manifest['workflows'])
    assert len(compose['services'])==9
    assert 'REPLACE_WITH_OPERATOR_SECRET' not in json.dumps(compose), 'Unresolved redaction placeholder in Compose'
    for service in ['ffmpeg-api','n8n-table-ui']:
        token_mount=next(v for v in compose['services'][service]['volumes'] if v['source'].endswith('/login/PASSWORD'))
        assert token_mount['target']=='/run/secrets/comfyui-token' and token_mount.get('read_only') is True
    assert compose['services']['pockettts']['cpus']==8
    assert compose['services']['pockettts']['environment']['POCKET_TTS_TORCH_THREADS']=='4'
    assert compose['services']['pockettts']['environment']['POCKET_TTS_QUANTIZE']=='false'
    device=compose['services']['comfyui']['deploy']['resources']['reservations']['devices'][0]
    assert len(device['device_ids'])==1 and 'COMFYUI_5060_TI_UUID' in device['device_ids'][0] and 'count' not in device
    for name,service in compose['services'].items():
        build=service.get('build')
        if build:
            context=(ROOT/build['context']).resolve()
            assert (context/build.get('dockerfile','Dockerfile')).is_file(),name+' missing Dockerfile'
        for v in service.get('volumes',[]):
            if v.get('type')=='bind':assert not v['source'].startswith('/home/'), 'Private absolute path'
    for path in ROOT.rglob('*.py'):ast.parse(path.read_text(),filename=str(path))
    scripts=[]
    for item in manifest['workflows']:
        w=json.loads((ROOT/item['file']).read_text());assert w['active'] is False
        assert not any(k in w for k in ['pinData','staticData'])
        for node in w['nodes']:
            code=node.get('parameters',{}).get('jsCode')
            if code:scripts.append({'name':w['name']+'/'+node['name'],'code':code})
    # AsyncFunction compiles complete native Code bodies including top-level await/return.
    result=subprocess.run(['node','-e',"const fs=require('fs');const A=Object.getPrototypeOf(async function(){}).constructor;for(const x of JSON.parse(fs.readFileSync(0,'utf8'))){try{new A(x.code)}catch(e){throw Error(x.name+': '+e.message)}}console.log('Compiled '+JSON.parse(fs.readFileSync(process.argv[1],'utf8')).workflowCount+' workflow graphs')",str(ROOT/'manifest.json')],input=json.dumps(scripts),text=True,check=True)
    subprocess.run(['docker','compose','--env-file',str(ROOT/'.env.example'),'-f',str(ROOT/'compose.json'),'config','--quiet'],cwd=ROOT,check=True)
    print('PASS: schema counts, service builds, 5060 Ti explicit selection, Pocket CPU settings, Python AST, native Code syntax and Compose config. No full-stack boot performed.')
if __name__=='__main__':check()
