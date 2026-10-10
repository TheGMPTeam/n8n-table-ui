#!/usr/bin/env python3
"""Prepare local bind directories and private settings; never starts or resets services."""
import argparse,json,pathlib,secrets,os,shutil
ROOT=pathlib.Path(__file__).resolve().parent

def prepare(root,token_file=None):
    compose=json.loads((root/'compose.json').read_text());data=root/'data';data.mkdir(exist_ok=True)
    for service in compose['services'].values():
        for mount in service.get('volumes',[]):
            if mount.get('type')!='bind' or not mount['source'].startswith('./data/'):continue
            target=root/mount['source']
            if mount.get('target')=='/run/secrets/comfyui-token':target.parent.mkdir(parents=True,exist_ok=True)
            else:target.mkdir(parents=True,exist_ok=True)
    env_path=root/'.env'
    if not env_path.exists():
        text=(root/'.env.example').read_text().replace('replace-with-random-64-hex',secrets.token_hex(32))
        text=text.replace('REVIEW_WEBHOOK_SECRET=','REVIEW_WEBHOOK_SECRET='+secrets.token_hex(32))
        env_path.write_text(text);env_path.chmod(0o600)
    values={k:v for k,v in (line.split('=',1) for line in env_path.read_text().splitlines() if '=' in line and not line.startswith('#'))}
    ui=data/'n8n-table-ui/.data';ui.mkdir(parents=True,exist_ok=True)
    secret=ui/'review-secret'
    if not secret.exists():
        value=values.get('REVIEW_WEBHOOK_SECRET')
        if not value:raise ValueError('Set REVIEW_WEBHOOK_SECRET privately in .env')
        secret.write_text(value+'\n');secret.chmod(0o600)
    setting=ui/'ollama-enhancement-settings.json'
    if not setting.exists():setting.write_text(json.dumps({'defaultEnhancementModel':'qwen3.8:latest'})+'\n');setting.chmod(0o600)
    token=data/'comfyui/storage-user/login/PASSWORD'
    if token_file:
        if token.exists():raise ValueError('Existing ComfyUI token preserved; refusing overwrite')
        if not token_file.is_file() or not token_file.read_bytes().strip():raise ValueError('Supply a nonempty existing ComfyUI API token file')
        shutil.copyfile(token_file,token);token.chmod(0o600)
    return {'env':str(env_path),'tokenReady':token.is_file() and bool(token.read_bytes().strip()),'data':str(data),'servicesStarted':False}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--comfy-token-file',type=pathlib.Path);p.add_argument('--prepare',action='store_true');a=p.parse_args()
    if not a.prepare:p.error('Use --prepare to explicitly create private local bind/settings files')
    result=prepare(ROOT,a.comfy_token_file);print(json.dumps(result,indent=2));print('Set explicit 5060 Ti UUID, trusted-LAN listener, private n8n key and credentials. Give n8n/Pocket runtime UID 1000 write access to their own binds. Supply a real ComfyUI token before starting consumers. No service was started.')
if __name__=='__main__':main()
