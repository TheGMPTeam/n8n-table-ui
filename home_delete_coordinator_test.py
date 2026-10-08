import unittest,tempfile,pathlib
from home_delete import OutputRoot, DeleteCoordinator

class CoordinatorTests(unittest.TestCase):
    def run_case(self, mode):
        with tempfile.TemporaryDirectory() as tmp:
            p=pathlib.Path(tmp)/'a.png';p.write_text('fixture')
            row={'id':1,'URL':'http://fixture:8188/view?filename=a.png&type=output','Working':False,'Completed':True}
            rows=[row]; events=[]; ledger={}
            if mode=='shared':rows.append(dict(row,id=2))
            if mode=='active':row['Working']=True
            if mode=='incomplete':row['Completed']=False
            if mode=='missing':p.unlink()
            def delete(i,url):
                self.assertFalse(p.exists());events.append('row-delete')
                if mode=='retry' and len(events)==1:raise RuntimeError('mock n8n failure')
                rows.clear()
            def record(key,value):ledger[key]=value.copy()
            coordinator=DeleteCoordinator(OutputRoot(tmp),{'fixture:8188'},'fixture-table',lambda:list(rows),lambda:False,delete,lambda k:ledger.get(k),record)
            if mode in ('shared','active','incomplete','missing'):
                with self.assertRaises((ValueError,FileNotFoundError)):coordinator.delete('fixture-table',1,row['URL'])
                self.assertEqual(events,[])
            elif mode=='retry':
                with self.assertRaises(RuntimeError):coordinator.delete('fixture-table',1,row['URL'])
                self.assertFalse(p.exists());self.assertEqual(len(rows),1)
                coordinator.delete('fixture-table',1,row['URL']);self.assertEqual(rows,[])
            else:
                coordinator.delete('fixture-table',1,row['URL']);self.assertEqual(rows,[])
    def test_order(self):self.run_case('ok')
    def test_shared(self):self.run_case('shared')
    def test_active(self):self.run_case('active')
    def test_incomplete(self):self.run_case('incomplete')
    def test_missing_without_intent(self):self.run_case('missing')
    def test_row_failure_retry(self):self.run_case('retry')
