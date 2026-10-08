import unittest,tempfile,pathlib,os,json
from home_delete_backend import IntentStore,N8NAdapter,Application,sign,verify

class BackendTests(unittest.TestCase):
 def test_durable_restart_private(self):
  with tempfile.TemporaryDirectory() as root:
   store=IntentStore(root);store.record('1',{'file_deleted':True})
   self.assertTrue(IntentStore(root).intent('1')['file_deleted'])
   self.assertEqual(os.stat(pathlib.Path(root)/'1.json').st_mode&0o777,0o600)
 def test_pagination_fail_closed(self):
  a=N8NAdapter('http://localhost:5678','secret','queue','locks')
  for page in ({'data':[]},{'data':[{'id':1},{'id':1}],'nextCursor':None},{'data':[],'nextCursor':''}):
   a.request=lambda *args:page
   with self.assertRaises(RuntimeError):a.rows()
 def test_global_busy_checks_every_status(self):
  a=N8NAdapter('http://localhost:5678','secret','queue','locks');paths=[]
  def pages(path):paths.append(path);return [{'id':'execution'}] if path.endswith('status=new') else []
  a.pages=pages
  self.assertTrue(a.busy());self.assertEqual(paths,['data-tables/locks/rows','executions?status=running','executions?status=waiting','executions?status=new'])
 def test_private_store_rejects_symlink_and_open_permissions(self):
  with tempfile.TemporaryDirectory() as root:
   store=IntentStore(root);target=pathlib.Path(root)/'1.json';target.symlink_to('/etc/passwd')
   with self.assertRaises(OSError):store.intent('1')
   target.unlink();os.chmod(root,0o755)
   with self.assertRaises(ValueError):IntentStore(root)
 def test_pagination_and_encoding(self):
  a=N8NAdapter('http://localhost:5678','secret','queue','locks'); calls=[]
  def request(method,path):
   calls.append(path)
   if 'delete?' in path:return [{'id':1}]
   return {'data':[{'id':len(calls)}],'nextCursor':'second' if len(calls)==1 else None}
  a.request=request
  self.assertEqual(len(a.rows()),2)
  a.delete_row(1,'http://fixture:8188/view?filename=a+b.png&type=output')
  self.assertIn('returnData=true&dryRun=false',calls[-1]);self.assertNotIn('+',calls[-1]);self.assertNotIn('%257B',calls[-1])
 def test_unavailable_without_atomic_protocol(self):
  app=Application(None)
  self.assertFalse(app.capabilities()['available'])
  with self.assertRaises(RuntimeError):app.delete({'rows':[{'id':1,'url':'x'}]})
 def test_hmac_replay_and_tamper(self):
  secret=b'x'*32; seen=set();headers=sign(secret,'POST','/delete',b'{}')
  self.assertTrue(verify(secret,'POST','/delete',b'{}',headers,seen))
  self.assertFalse(verify(secret,'POST','/delete',b'{}',headers,seen))
  self.assertFalse(verify(secret,'POST','/delete',b'bad',sign(secret,'POST','/delete',b'{}'),set()))
if __name__=='__main__':unittest.main()
