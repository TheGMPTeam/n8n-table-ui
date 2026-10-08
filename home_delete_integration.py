"""Explicit disposable n8n fixture test. Never targets configured production IDs.
Run manually: python3 home_delete_integration.py
"""
import base64,contextlib,json,os,pathlib,secrets,socket,subprocess,tempfile,threading,uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from home_delete import OutputRoot,DeleteCoordinator
from home_delete_backend import N8NAdapter,IntentStore,Application,server,sign

def main():
 key=os.environ.get('N8N_API_KEY')
 if not key:
  for line in pathlib.Path('/home/dad/.hermes/.env').read_text().splitlines():
   if line.startswith('N8N_API_KEY='):key=line.split('=',1)[1].strip().strip('"').strip("'")
 if not key:raise RuntimeError('Missing API credential')
 base='http://127.0.0.1:5678/api/v1/'
 def api(method,path,payload=None):
  req=Request(base+path,method=method,data=json.dumps(payload).encode() if payload is not None else None,headers={'X-N8N-API-KEY':key,'Content-Type':'application/json'})
  try:
   with urlopen(req,timeout=15) as r:
    raw=r.read();return json.loads(raw) if raw else None
  except HTTPError as e:
   raise RuntimeError('Fixture API '+str(e.code)+': '+e.read().decode()[:400]) from e
 table=None;evidence={}
 try:
  created=api('POST','data-tables',{'name':'home_delete_fixture_'+uuid.uuid4().hex[:12],'columns':[{'name':'URL','type':'string'},{'name':'Working','type':'boolean'},{'name':'Completed','type':'boolean'}]});table=created['id']
  assert table not in ('xKckTZI3ZU5HqIpZ','vN5vMR56WpEsdLMn','vxItbJ4B8uYBtqJ3')
  urls=['http://10.0.0.157:8188/view?filename=fixture%20'+str(n)+'.png&subfolder=video' for n in range(3)]
  api('POST','data-tables/'+table+'/rows',{'data':[{'URL':url,'Completed':True,'Working':False} for url in urls],'returnType':'all'})
  adapter=N8NAdapter('http://127.0.0.1:5678',key,table,'vxItbJ4B8uYBtqJ3',limit=1)
  original=adapter.rows();assert len(original)==3;evidence['table']=table;evidence['paginationRows']=len(original)
  with tempfile.TemporaryDirectory(prefix='home-delete-fixture-') as tmp:
   root=pathlib.Path(tmp)/'output';root.mkdir();(root/'video').mkdir()
   for n in range(3):(root/'video'/('fixture '+str(n)+'.png')).write_bytes(b'fixture')
   store=IntentStore(str(pathlib.Path(tmp)/'intents'));events=[];failed=set()
   native_delete=adapter.delete_row
   def delete(row_id,url):
    index=urls.index(url);assert not (root/'video'/('fixture '+str(index)+'.png')).exists();assert store.intent(str(row_id))['file_deleted'];events.append({'event':'row-delete','id':row_id})
    if index==1 and row_id not in failed:failed.add(row_id);raise RuntimeError('isolated fixture injected row transport failure')
    native_delete(row_id,url)
   coordinator=DeleteCoordinator(OutputRoot(str(root)),{'10.0.0.157:8188'},table,adapter.rows,lambda:False,delete,store.intent,store.record,True)
   lock=threading.Lock()
   @contextlib.contextmanager
   def exclusion(row_id):
    # Fixture-only root and table have no other writers; this is not a prod adapter.
    with lock:yield
   secret=b'f'*32;secretfile=pathlib.Path(tmp)/'hmac';secretfile.write_bytes(secret);secretfile.chmod(0o600)
   authfile=pathlib.Path(tmp)/'browser-auth';credential='home-delete:'+('fixture-only-'*4);authfile.write_text(credential);authfile.chmod(0o600)
   helper=server(Application(coordinator,exclusion),secret,socket_path=str(pathlib.Path(tmp)/'control.sock'));thread=threading.Thread(target=helper.serve_forever,daemon=True);thread.start()
   reserve=socket.socket();reserve.bind(('127.0.0.1',0));port=reserve.getsockname()[1];reserve.close()
   env=dict(os.environ,PORT=str(port),DATA_DIR=str(pathlib.Path(tmp)/'proxy-state'),HOME_DELETE_SECRET_FILE=str(secretfile),HOME_DELETE_BROWSER_AUTH_FILE=str(authfile),HOME_DELETE_CONTROL_SOCKET=str(pathlib.Path(tmp)/'control.sock'))
   proxy=subprocess.Popen(['node','proxy-server.cjs'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
   assert 'listening' in proxy.stdout.readline()
   def request(rows):
    body=json.dumps({'rows':rows}).encode();origin='http://127.0.0.1:'+str(port)
    req=Request(origin+'/home-delete/delete',data=body,headers={'Authorization':'Basic '+base64.b64encode(credential.encode()).decode(),'Origin':origin,'Content-Type':'application/json'},method='POST')
    with urlopen(req,timeout=15) as r:return json.load(r)
   try:
    origin='http://127.0.0.1:'+str(port)
    for headers,status in (({'Origin':origin},401),({'Origin':'https://evil.example'},403)):
     try:urlopen(Request(origin+'/home-delete/delete',data=b'{"rows":[]}',headers=headers,method='POST'),timeout=5)
     except HTTPError as e:assert e.code==status
     else:raise RuntimeError('Unauthorized fixture request accepted')
    evidence['auth401']=True;evidence['crossOrigin403']=True;evidence['transport']='Basic-authenticated proxy -> HMAC Unix socket -> helper -> actual n8n API'
    selected=[{'id':r['id'],'url':r['URL']} for r in original[:2]];result=request(selected)
    assert (result['fileDeleted'],result['rowDeleted'],result['failed'])==(2,1,1),result
    assert len(adapter.rows())==2
    retry=request(selected[1:]);assert retry['rowDeleted']==1 and retry['failed']==0,retry
    remaining=adapter.rows();assert remaining==original[2:];assert (root/'video'/'fixture 2.png').exists()
    evidence.update({'batch':result,'retry':retry,'unrelatedPreserved':True,'events':events,'mockExecutionAdapter':True,'productionActivated':False})
   finally:
    proxy.terminate();proxy.wait(timeout=10);proxy.stdout.close();helper.shutdown();helper.server_close();thread.join()
  # Read-only actual global lock/execution adapter. Failure is evidence, not ignored.
  try:evidence['liveBusy']=adapter.busy();evidence['liveExecutionAdapter']='read succeeded'
  except Exception as e:evidence['liveExecutionAdapter']='fail-closed: '+str(e)
 finally:
  if table:
   api('DELETE','data-tables/'+table)
   try:api('GET','data-tables/'+table)
   except RuntimeError as e:
    assert '404' in str(e);evidence['cleanup404']=True
   else:raise RuntimeError('Disposable cleanup not verified')
 print(json.dumps(evidence,indent=2))
if __name__=='__main__':main()
