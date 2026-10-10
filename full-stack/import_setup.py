#!/usr/bin/env python3
"""CRUD-first bootstrap: required tables through native CRUD webhooks, never REST table writes."""
import argparse, json, os, pathlib, urllib.request, urllib.parse, tempfile, time
from typing import Any
ROOT=pathlib.Path(__file__).resolve().parent
FIELDS=('name','nodes','connections','settings')
SETTINGS={'saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder','callerPolicy','callerIds','availableInMCP'}
def remap(value:Any,mapping:dict)->Any:
    if isinstance(value,dict):return {k:remap(v,mapping) for k,v in value.items()}
    if isinstance(value,list):return [remap(v,mapping) for v in value]
    if isinstance(value,str):
        for old,new in sorted(mapping.items(),key=lambda p:len(p[0]),reverse=True):value=value.replace(old,new)
    return value
class API:
    def __init__(self,url,key):self.base=url.rstrip('/');self.key=key
    def request(self,method,path,payload=None):
        webhook=path.startswith('webhook/')
        url=self.base+'/'+path if webhook else self.base+'/api/v1/'+path
        headers={'Content-Type':'application/json'}
        if not webhook:headers['X-N8N-API-KEY']=self.key
        req=urllib.request.Request(url,data=json.dumps(payload).encode() if payload is not None else None,headers=headers,method=method)
        with urllib.request.urlopen(req,timeout=60) as r:
            body=r.read();return json.loads(body) if body else None

def save(path,state):
    path.parent.mkdir(parents=True,exist_ok=True);fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.import-')
    try:
        with os.fdopen(fd,'w') as f:json.dump(state,f,indent=2)
        os.replace(tmp,path);path.chmod(0o600)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
def all_pages(api,path):
    out=[];seen=set();cursor=None
    while True:
        data=api.request('GET',path+'?limit=100'+('&cursor='+urllib.parse.quote(cursor,safe='') if cursor else ''));out.extend(data['data']);cursor=data.get('nextCursor')
        if not cursor:return out
        if cursor in seen:raise RuntimeError('Repeated cursor')
        seen.add(cursor)
def unwrap(value):
    if isinstance(value,list):
        if len(value)!=1:raise ValueError('Ambiguous CRUD response')
        value=value[0]
    if not isinstance(value,dict) or value.get('error'):raise ValueError('CRUD rejected operation')
    return value

def payload(w,mapping,credential_map):
    result=remap({k:w[k] for k in FIELDS},mapping)
    result['settings']={k:v for k,v in result['settings'].items() if k in SETTINGS};result['settings']['availableInMCP']=False
    for node in result['nodes']:
        for typ,ref in node.get('credentials',{}).items():
            target=credential_map[ref['id']]
            if not isinstance(target,dict) or not target.get('id') or not target.get('name'):raise ValueError('Credential map values need id and name')
            node['credentials'][typ]={'id':target['id'],'name':target['name']}
    if 'REPLACE_WITH_OPERATOR_SECRET' in json.dumps(result):raise ValueError('Unresolved secret placeholder: configure native credential in '+w['name'])
    return result

def run(api,root,credential_map,journal,project=None,templates=False,endpoints=None):
    endpoints=endpoints or {}
    for old,new in endpoints.items():
        for origin in [old,new]:
            parsed=urllib.parse.urlsplit(origin)
            if parsed.scheme not in ['http','https'] or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ['', '/'] or parsed.query or parsed.fragment:raise ValueError('Endpoint mapping accepts only credential-free origins')
    manifest=json.loads((root/'manifest.json').read_text())
    missing={c['sourceId'] for c in manifest['credentials']}-set(credential_map)
    if missing:raise ValueError('Map every credential metadata ID before import: '+','.join(sorted(missing)))
    state=json.loads(journal.read_text()) if journal.exists() else {'tables':{},'workflows':{},'createdTables':[]}
    definitions={w['sourceId']:json.loads((root/w['file']).read_text()) for w in manifest['workflows']}
    crud=next(old for old,w in definitions.items() if w['name']=='Data Table CRUD')
    # Reserve fresh workflow IDs as inert empty graphs before resolving references.
    for old,w in definitions.items():
        if old not in state['workflows']:
            created=api.request('POST','workflows',{'name':w['name'],'nodes':[],'connections':{},'settings':{'availableInMCP':False}})
            if created.get('active'):raise RuntimeError('Unexpected active workflow')
            state['workflows'][old]=created['id'];save(journal,state)
    target=state['workflows'][crud]
    current=api.request('GET','workflows/'+target)
    if current.get('active') and not state.get('crudPublished'):raise RuntimeError('Refusing unowned active CRUD workflow')
    api.request('PUT','workflows/'+target,payload(definitions[crud],{**state['workflows'],**endpoints},credential_map))
    api.request('POST','workflows/'+target+'/activate',{})
    actual=api.request('GET','workflows/'+target)
    if not actual.get('active'):raise RuntimeError('CRUD publication readback failed')
    state['crudPublished']=True;save(journal,state)
    # REST is read-only for inventory/metadata; all table creation uses the inspected native webhook.
    existing=all_pages(api,'data-tables')
    for table in manifest['tables']:
        old=table['sourceId'];matches=[t for t in existing if t['name']==table['name']]
        if len(matches)>1:raise ValueError('Ambiguous existing table name: '+table['name'])
        if old in state['tables']:
            id=state['tables'][old]
        elif matches:id=matches[0]['id']
        else:
            row={'name':table['name'],'columns':table['columns']}
            if project:row['projectId']=project
            # No retries on uncertain create. Native graph must be published and ready first.
            created=unwrap(api.request('POST','webhook/yt-create',{'operation':'create','row':row}));id=created.get('id')
            if not isinstance(id,str) or not id:raise ValueError('CRUD create did not return exact table ID')
            state['createdTables'].append(id)
        state['tables'][old]=id;save(journal,state)
        actual=api.request('GET','data-tables/'+id)
        if actual['name']!=table['name'] or [(x['name'],x['type']) for x in actual['columns']]!=[(x['name'],x['type']) for x in table['columns']]:raise ValueError('Existing schema conflict: '+table['name']+'; no destructive migration attempted')
        # Native CRUD get proves the created/existing ID resolves through the same consumer transport.
        result=unwrap(api.request('POST','webhook/yt-get',{'operation':'get','id':id,'limit':1}))
        if not isinstance(result.get('data'),list):raise ValueError('CRUD get readback missing row envelope')
    mapping={**state['tables'],**state['workflows'],**endpoints}
    for old,w in definitions.items():
        body=payload(w,mapping,credential_map);target=state['workflows'][old]
        current=api.request('GET','workflows/'+target)
        if current.get('active') and old!=crud:raise RuntimeError('Refusing to overwrite active non-CRUD workflow')
        api.request('PUT','workflows/'+target,body)
        if old==crud:api.request('POST','workflows/'+target+'/activate',{})
        actual=api.request('GET','workflows/'+target)
        if old!=crud and actual.get('active'):raise RuntimeError('Imported scheduler unexpectedly active')
        assert actual['name']==body['name'] and actual['connections']==body['connections'],'Workflow readback mismatch'
        actual_text=json.dumps(actual);encoded=json.dumps(body)
        for new in mapping.values():
            if new in encoded:assert new in actual_text,'Dependency readback mismatch'
    if templates:
        data=json.loads((root/'templates.json').read_text());target=state['tables'][data['sourceTableId']]
        if not state.get('templatesImported'):
            existing=unwrap(api.request('POST','webhook/yt-get',{'operation':'get','id':target,'limit':1}))
            if existing.get('data'):raise RuntimeError('Template table not empty; preserve operator configuration')
            result=unwrap(api.request('POST','webhook/yt-wright',{'operation':'write','id':target,'row':{'data':remap(data['rows'],mapping)}}))
            if result.get('success') is not True or result.get('insertedRows')!=len(data['rows']):raise RuntimeError('Template write acknowledgement mismatch; inspect before retry')
            readback=unwrap(api.request('POST','webhook/yt-get',{'operation':'get','id':target,'limit':250}))
            if len(readback.get('data',[]))!=len(data['rows']):raise RuntimeError('Template readback count mismatch')
            state['templatesImported']=True;save(journal,state)
    return state

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--url',required=True);p.add_argument('--expected-url',required=True);p.add_argument('--credentials',type=pathlib.Path,required=True);p.add_argument('--journal',type=pathlib.Path,required=True);p.add_argument('--project');p.add_argument('--endpoint-map',type=pathlib.Path);p.add_argument('--import-templates',action='store_true');p.add_argument('--apply',action='store_true');a=p.parse_args()
    if a.url.rstrip('/')!=a.expected_url.rstrip('/'):p.error('Target confirmation differs')
    parsed=urllib.parse.urlsplit(a.url)
    if parsed.scheme not in ['http','https'] or not parsed.hostname or parsed.username or parsed.password:p.error('Use a credential-free HTTP(S) base URL')
    key=os.environ.get('N8N_API_KEY')
    if not key:p.error('N8N_API_KEY must be set server-side')
    if not a.apply:p.error('No writes without explicit --apply; test first against an isolated host')
    result=run(API(a.url,key),ROOT,json.loads(a.credentials.read_text()),a.journal,a.project,a.import_templates,json.loads(a.endpoint_map.read_text()) if a.endpoint_map else {})
    print(json.dumps(result,indent=2));print('CRUD published. Required tables built via CRUD. All non-CRUD workflows and schedules remain inactive; validate credentials/models and publish selectively.')
if __name__=='__main__':main()
