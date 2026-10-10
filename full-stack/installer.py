#!/usr/bin/env python3
"""Interactive, explicit-consent six-service installer. Never removes services/data."""
import getpass, ipaddress, json, os, pathlib, re, secrets, shutil, subprocess
from zoneinfo import ZoneInfo
ROOT=pathlib.Path(__file__).resolve().parent
SERVICES=('n8n-table-ui','n8n','ollama','pockettts','searxng','comfyui')
def deploy(selected, confirmed, run=subprocess.check_call, comfy_build=False):
    if not confirmed:return False
    if not selected or any(s not in SERVICES for s in selected):raise ValueError('Invalid service selection')
    base=['docker','compose','-f','compose.json']
    builds=[s for s in selected if s in ('n8n-table-ui','pockettts')]
    if comfy_build and 'comfyui' in selected:builds.append('comfyui')
    if builds:run(base+['build']+builds)
    run(base+['up','-d','--no-deps']+list(selected))
    return True

def ask(label, default):return input(f'{label} [{default}]: ').strip() or str(default)
def main():
    project=ask('Compose project','six-service-beta')
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*',project):raise ValueError('Invalid project name')
    install=pathlib.Path(ask('Install full-stack directory',str(ROOT))).expanduser().resolve()
    bind=ask('Bind IP','127.0.0.1');ipaddress.ip_address(bind)
    timezone=ask('Timezone','America/New_York');ZoneInfo(timezone)
    selected=[s for s in SERVICES if ask('Include '+s+'?','yes').lower()=='yes']
    external=ask('External ComfyUI browser/API hostname (when excluded)','localhost')
    ports={s:int(ask(s+' host port',p)) for s,p in zip(SERVICES,(3458,5678,11434,49112,8080,8188))}
    if any(p<1 or p>65535 for p in ports.values()) or len(set(ports.values()))!=6:raise ValueError('Ports must be distinct 1..65535')
    cpus=os.cpu_count() or 1
    threads=int(ask('Pocket CPU threads',min(4,cpus)))
    limit=int(ask('Pocket CPU limit',min(8,cpus)))
    if not 1<=threads<=limit<=cpus:raise ValueError('CPU budget exceeds available CPUs')
    gpu='';ollama=''
    if 'comfyui' in selected or 'ollama' in selected:
        output=subprocess.check_output(['nvidia-smi','--query-gpu=name,uuid','--format=csv,noheader'],text=True)
        print(output)
        choices=[line.rsplit(',',1) for line in output.strip().splitlines()]
        if 'comfyui' in selected:
            gpu=ask('Comfy GPU UUID (this server requires RTX 5060 Ti)','')
            matches=[name for name,uuid in choices if uuid.strip()==gpu]
            if not matches or (any('5060 Ti' in name for name,_ in choices) and '5060 Ti' not in matches[0]):raise ValueError('Explicit supported Comfy GPU required; no 3060 fallback')
        if 'ollama' in selected:
            ollama=ask('Ollama GPU UUID','')
            if ollama not in [u.strip() for _,u in choices]:raise ValueError('Select listed UUID')
    image=ask('Prepared ComfyUI image','yanwk/comfyui-boot:cu130-megapak-pt211')
    context=ask('Optional operator-authorized Comfy build context (blank uses prepared image)','') if 'comfyui' in selected else ''
    if context:
        context=str(pathlib.Path(context).expanduser().resolve())
        source=pathlib.Path(context)
        if not (source/'Dockerfile').is_file() or not any((source/n).is_file() for n in ('LICENSE','LICENSE.md','LICENSE.txt')):raise ValueError('Real Dockerfile and source license required')
        if ask('Have you reviewed Dockerfile, pinned custom nodes, source licensing and excluded weights?','no').lower()!='yes':raise ValueError('Source review consent required')
    model=ask('Ollama enhancement model (operator must install)', 'qwen3.8:latest')
    templates=ask('Template choice (all or selected IDs; stored, not imported automatically)','all')
    private={k:getpass.getpass(k+' (hidden, blank allowed): ') for k in ('N8N_API_KEY','HF_TOKEN','REVIEW_WEBHOOK_SECRET')}
    private['REVIEW_WEBHOOK_SECRET']=private['REVIEW_WEBHOOK_SECRET'] or secrets.token_hex(32)
    values={'LAN_BIND_IP':bind,'TZ':timezone,'N8N_HOSTNAME':external,'COMFYUI_PUBLIC_HOST':external if 'comfyui' not in selected else bind,'COMFYUI_5060_TI_UUID':gpu,'OLLAMA_GPU_UUID':ollama,'COMFYUI_IMAGE':image,'POCKET_THREADS':threads,'POCKET_CPUS':limit,'N8N_ENCRYPTION_KEY':secrets.token_hex(32),**private}
    values.update({s.upper().replace('-','_')+'_PORT':p for s,p in ports.items()})
    values['REVIEW_UI_ORIGINS']=f'http://{bind}:{ports["n8n-table-ui"]}'
    if any('\n' in str(v) or '\r' in str(v) or "'" in str(v) for v in values.values()):raise ValueError('Invalid environment value')
    print('Selected services:',', '.join(selected));print('Data retained at',install/'data')
    if ask('Write configuration, build and deploy selected services?','no').lower()!='yes':print('Cancelled; no files or Docker operations changed.');return
    if install!=ROOT:
        if install.exists():raise ValueError('Destination exists; use its installer to preserve files')
        shutil.copytree(ROOT,install,ignore=shutil.ignore_patterns('data','.env','__pycache__'))
        # UI build context stays the source checkout, not a nonexistent parent.
        compose=json.loads((install/'compose.json').read_text());compose['services']['n8n-table-ui']['build']['context']=str(ROOT.parent)
        (install/'compose.json').write_text(json.dumps(compose,indent=2)+'\n')
    env=install/'.env'
    if env.exists():raise ValueError('Existing .env preserved: review manually; no deployment attempted')
    fd=os.open(env,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:f.write('\n'.join(k+"='"+str(v)+"'" for k,v in values.items())+'\n')
    from prepare_local import prepare
    prepare(install)
    (install/'operator-choices.json').write_text(json.dumps({'model':model,'templates':templates,'selected':selected},indent=2)+'\n')
    if context:
        compose=json.loads((install/'compose.json').read_text())
        compose['services']['comfyui']['build']={'context':context,'dockerfile':'Dockerfile'}
        (install/'compose.json').write_text(json.dumps(compose,indent=2)+'\n')
    os.chdir(install);os.environ['COMPOSE_PROJECT_NAME']=project
    deploy(selected,True,comfy_build=bool(context))
if __name__=='__main__':main()
