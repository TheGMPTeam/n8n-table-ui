"""Private loopback helper. Production deletion is deliberately fail-closed.

No configuration flag can pretend the current workflows share an atomic lock.
Only an injected, independently verified exclusion provider can enable deletion.
"""
import hashlib,hmac,json,os,re,secrets,stat,tempfile,time,threading
from http.server import HTTPServer,BaseHTTPRequestHandler
from urllib.parse import quote,urlsplit
from urllib.request import Request,urlopen,build_opener,HTTPRedirectHandler
from home_delete import DeleteCoordinator,OutputRoot

class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise RuntimeError('Redirect forbidden')

class IntentStore:
 def __init__(self,root):
  self.root=os.path.abspath(root)
  os.makedirs(self.root,mode=0o700,exist_ok=True)
  st=os.lstat(self.root)
  if not stat.S_ISDIR(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077:raise ValueError('Private owned intent directory required')
  if os.path.realpath(self.root)!=self.root:raise ValueError('Symlink intent root forbidden')
 def path(self,key):
  if not re.fullmatch(r'[1-9][0-9]{0,15}',key):raise ValueError('Invalid intent key')
  return os.path.join(self.root,key+'.json')
 def intent(self,key):
  try:fd=os.open(self.path(key),os.O_RDONLY|os.O_NOFOLLOW)
  except FileNotFoundError:return None
  with os.fdopen(fd) as f:
   st=os.fstat(f.fileno())
   if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077:raise ValueError('Unsafe intent')
   return json.load(f)
 def record(self,key,value):
  target=self.path(key);fd,name=tempfile.mkstemp(dir=self.root,prefix='.intent-')
  try:
   with os.fdopen(fd,'w') as f:
    json.dump(value,f,separators=(',',':'));f.flush();os.fsync(f.fileno())
   os.replace(name,target)
   d=os.open(self.root,os.O_DIRECTORY|os.O_RDONLY)
   try:os.fsync(d)
   finally:os.close(d)
  finally:
   if os.path.exists(name):os.unlink(name)

class N8NAdapter:
 def __init__(self,base,key,table,locks,limit=250):
  if urlsplit(base).hostname not in ('localhost','127.0.0.1','10.0.0.157') or urlsplit(base).port!=5678:raise ValueError('Fixed n8n authority required')
  for token in (table,locks):
   if not re.fullmatch(r'[A-Za-z0-9_-]+',token):raise ValueError('Invalid fixed table')
  self.base,self.key,self.table,self.locks,self.limit=base.rstrip('/'),key,table,locks,limit
 def request(self,method,path):
  req=Request(self.base+'/api/v1/'+path,method=method,headers={'X-N8N-API-KEY':self.key,'Accept':'application/json'})
  with build_opener(NoRedirect()).open(req,timeout=15) as response:
   raw=response.read(8*1024*1024+1)
   if len(raw)>8*1024*1024:raise RuntimeError('Response too large')
   return json.loads(raw)
 def pages(self,path):
  result=[];ids=set();cursors=set();cursor=None
  for _ in range(1000):
   page=self.request('GET',path+('&' if '?' in path else '?')+'limit='+str(self.limit)+(('&cursor='+quote(cursor,safe='')) if cursor else ''))
   if not isinstance(page,dict) or not isinstance(page.get('data'),list) or 'nextCursor' not in page:raise RuntimeError('Incomplete pagination envelope')
   for row in page['data']:
    if not isinstance(row,dict) or 'id' not in row or str(row['id']) in ids:raise RuntimeError('Invalid/duplicate paginated ID')
    ids.add(str(row['id']));result.append(row)
   cursor=page['nextCursor']
   if cursor is None:return result
   if not isinstance(cursor,str) or not cursor or cursor in cursors:raise RuntimeError('Invalid pagination cursor')
   cursors.add(cursor)
  raise RuntimeError('Pagination bound exceeded')
 def rows(self):return self.pages('data-tables/'+self.table+'/rows')
 def busy(self):
  # Global exclusion is intentionally conservative, not just this row's owner.
  locks=self.pages('data-tables/'+self.locks+'/rows')
  running=self.pages('executions?status=running')
  waiting=self.pages('executions?status=waiting')
  new=self.pages('executions?status=new')
  return bool(locks or running or waiting or new)
 def delete_row(self,row_id,url):
  filters={'type':'and','filters':[{'columnName':'id','condition':'eq','value':row_id},{'columnName':'URL','condition':'eq','value':url},{'columnName':'Completed','condition':'eq','value':True},{'columnName':'Working','condition':'eq','value':False}]}
  result=self.request('DELETE','data-tables/'+self.table+'/rows/delete?filter='+quote(json.dumps(filters,separators=(',',':')),safe='')+'&returnData=true&dryRun=false')
  data=result.get('data') if isinstance(result,dict) else result
  if not isinstance(data,list) or len(data)!=1 or data[0].get('id')!=row_id:raise RuntimeError('Exact delete not acknowledged')

def sign(secret,method,path,body):
 stamp=str(int(time.time()));nonce=secrets.token_hex(16)
 message='\n'.join((method,path,stamp,nonce,hashlib.sha256(body).hexdigest())).encode()
 return {'X-Delete-Time':stamp,'X-Delete-Nonce':nonce,'X-Delete-Signature':hmac.new(secret,message,hashlib.sha256).hexdigest()}
def verify(secret,method,path,body,headers,seen):
 try:
  stamp=headers.get('X-Delete-Time','');nonce=headers.get('X-Delete-Nonce','')
  if abs(time.time()-int(stamp))>30 or not re.fullmatch('[a-f0-9]{32}',nonce) or nonce in seen:return False
  message='\n'.join((method,path,stamp,nonce,hashlib.sha256(body).hexdigest())).encode()
  if not hmac.compare_digest(hmac.new(secret,message,hashlib.sha256).hexdigest(),headers.get('X-Delete-Signature','')):return False
  seen.add(nonce);return True
 except (ValueError,TypeError):return False

class Application:
 def __init__(self,coordinator,exclusion=None):self.coordinator,self.exclusion=coordinator,exclusion;self.serial=threading.Lock()
 def capabilities(self):
  return {'available':self.exclusion is not None and self.coordinator is not None,'reason':None if self.exclusion is not None else 'Shared atomic generation/deletion lock and directory relocation exclusion not verified'}
 def delete(self,payload):
  if not self.capabilities()['available']:raise RuntimeError(self.capabilities()['reason'])
  if not isinstance(payload,dict) or set(payload)!={'rows'} or not isinstance(payload['rows'],list) or not 1<=len(payload['rows'])<=100:raise ValueError('Bounded exact row selection required')
  rows=payload['rows'];ids=set()
  for row in rows:
   if not isinstance(row,dict) or set(row)!={'id','url'} or type(row['id']) is not int or not 0<row['id']<=9007199254740991 or not isinstance(row['url'],str) or row['id'] in ids:raise ValueError('Invalid exact selection')
   ids.add(row['id'])
  results=[]
  assert self.exclusion is not None
  assert self.coordinator is not None
  with self.serial:
   for row in rows:
    try:
     # Provider must reserve this row and the output tree against all writers.
     with self.exclusion(row['id']):
      results.append(self.coordinator.delete(self.coordinator.table,row['id'],row['url']))
    except Exception as exc:
     intent=self.coordinator.intent(str(row['id'])) or {}
     results.append({'id':row['id'],'fileDeleted':intent.get('file_deleted') is True,'rowDeleted':False,'error':str(exc)})
  return {'results':results,'fileDeleted':sum(r.get('fileDeleted') is True for r in results),'rowDeleted':sum(r.get('rowDeleted') is True for r in results),'failed':sum('error' in r for r in results)}

def server(app,secret,port=3461,socket_path=None):
 if len(secret)<32:raise ValueError('32-byte private HMAC secret required')
 seen=set()
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,format,*args):pass
  def do_GET(self):self.handle_request()
  def do_POST(self):self.handle_request()
  def handle_request(self):
   status=200
   try:
    size=int(self.headers.get('Content-Length','0'))
    if size<0 or size>65536:raise ValueError('Body limit')
    self.connection.settimeout(5);body=self.rfile.read(size)
    if len(seen)>10000:raise RuntimeError('Authentication nonce capacity reached; restart helper safely')
    if not verify(secret,self.command,self.path,body,self.headers,seen):status=401;raise ValueError('Authentication rejected')
    if self.command=='GET' and self.path=='/capabilities':result=app.capabilities()
    elif self.command=='POST' and self.path=='/delete':result=app.delete(json.loads(body))
    else:status=404;raise ValueError('Unknown route')
   except Exception as exc:
    if status==200:status=409 if isinstance(exc,RuntimeError) else 400
    result={'error':'delete_rejected','message':str(exc)}
   data=json.dumps(result).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 if socket_path:
  import socket,socketserver
  parent=os.path.dirname(os.path.abspath(socket_path));st=os.lstat(parent)
  if not stat.S_ISDIR(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077 or os.path.realpath(parent)!=parent:raise ValueError('Private socket directory required')
  if os.path.lexists(socket_path):raise ValueError('Socket already exists; operator must verify inactive owner before removal')
  class UnixServer(HTTPServer):
   address_family=socket.AF_UNIX
   def server_bind(self):socketserver.TCPServer.server_bind(self);self.server_name='localhost';self.server_port=0
  result=UnixServer(socket_path,Handler);os.chmod(socket_path,0o600);return result
 return HTTPServer(('127.0.0.1',port),Handler)

def main():
 secret_path=os.environ['HOME_DELETE_SECRET_FILE']
 fd=os.open(secret_path,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as f:
  st=os.fstat(f.fileno())
  if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077:raise ValueError('Private secret file required')
  secret=f.read(4096)
 adapter=N8NAdapter('http://127.0.0.1:5678',os.environ['N8N_API_KEY'],os.environ['HOME_DELETE_TABLE'],os.environ['HOME_DELETE_LOCK_TABLE'])
 store=IntentStore(os.environ['HOME_DELETE_INTENT_ROOT'])
 coordinator=DeleteCoordinator(OutputRoot(os.environ['HOME_DELETE_OUTPUT_ROOT']),{'10.0.0.157:8188','localhost:8188','127.0.0.1:8188','comfyui:8188'},adapter.table,adapter.rows,adapter.busy,adapter.delete_row,store.intent,store.record,verified_default_output=True)
 # Intentionally no env bypass: current workflow contract has no shared atomic provider.
 server(Application(coordinator),secret,socket_path=os.environ.get('HOME_DELETE_CONTROL_SOCKET')).serve_forever()
if __name__=='__main__':main()
