"""Mock-only CRUD-first importer tests. No live schema writes or stack boot."""
import copy, importlib.util, json, pathlib, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('setup',ROOT/'import_setup.py')
assert spec and spec.loader
setup=importlib.util.module_from_spec(spec);spec.loader.exec_module(setup)
class MockAPI:
    def __init__(self):self.tables={};self.workflows={};self.rows={};self.calls=[]
    def request(self,method,path,payload=None):
        self.calls.append((method,path,copy.deepcopy(payload)))
        if path=='data-tables' and method=='POST':raise AssertionError('REST table creation forbidden')
        if path=='webhook/yt-create' and method=='POST':
            assert any(w['active'] and w['name']=='Data Table CRUD' for w in self.workflows.values()),'CRUD must publish first'
            value={**payload['row'],'id':'table-'+str(len(self.tables))};self.tables[value['id']]=value;self.rows[value['id']]=[];return [copy.deepcopy(value)]
        if path=='webhook/yt-get' and method=='POST':return [{'data':copy.deepcopy(self.rows[payload['id']]),'nextCursor':None}]
        if path=='webhook/yt-wright' and method=='POST':self.rows[payload['id']].extend(copy.deepcopy(payload['row']['data']));return [{'success':True,'insertedRows':len(payload['row']['data'])}]
        if path.startswith('data-tables?') and method=='GET':return {'data':list(copy.deepcopy(self.tables).values()),'nextCursor':None}
        if path.startswith('data-tables/') and method=='GET':return copy.deepcopy(self.tables[path.split('/')[1]])
        if path=='workflows' and method=='POST':
            assert payload is not None
            value={**payload,'id':'workflow-'+str(len(self.workflows)),'active':False};self.workflows[value['id']]=value;return copy.deepcopy(value)
        if path.startswith('workflows/'):
            id=path.split('/')[1]
            if path.endswith('/activate'):
                assert self.workflows[id]['name']=='Data Table CRUD';self.workflows[id]['active']=True;return copy.deepcopy(self.workflows[id])
            if method=='GET':return copy.deepcopy(self.workflows[id])
            if method=='PUT':self.workflows[id].update(copy.deepcopy(payload));return copy.deepcopy(self.workflows[id])
        raise AssertionError((method,path))
class Tests(unittest.TestCase):
    def creds(self):return {x['sourceId']:{'id':'new-'+x['sourceId'],'name':x['name']} for x in json.loads((ROOT/'manifest.json').read_text())['credentials']}
    def test_real_export_remapped_crud_first_schema_only(self):
        manifest=json.loads((ROOT/'manifest.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            api=MockAPI();journal=pathlib.Path(directory)/'journal.json';state=setup.run(api,ROOT,self.creds(),journal)
            self.assertEqual(len(api.workflows),manifest['workflowCount']);self.assertEqual(len(api.tables),manifest['tableCount'])
            self.assertEqual([w['name'] for w in api.workflows.values() if w['active']],['Data Table CRUD'])
            self.assertFalse(any(m=='POST' and p=='data-tables' for m,p,_ in api.calls))
            self.assertFalse(any('/rows' in p or '/delete' in p for _,p,_ in api.calls))
            all_text=json.dumps(api.workflows)
            for old in state['tables']:self.assertNotIn(old,all_text)
            for old in state['workflows']:self.assertNotIn(old,all_text)
            self.assertTrue(all('columns' in t and 'data' not in t for t in api.tables.values()))
            setup.run(api,ROOT,self.creds(),journal);self.assertEqual(len(api.workflows),manifest['workflowCount']);self.assertEqual(len(api.tables),manifest['tableCount'])
    def test_template_configuration_uses_webhooks_only(self):
        with tempfile.TemporaryDirectory() as d:
            api=MockAPI();journal=pathlib.Path(d)/'state.json';state=setup.run(api,ROOT,self.creds(),journal,templates=True)
            self.assertTrue(state['templatesImported']);self.assertEqual(sum(len(r) for r in api.rows.values()),4)
            setup.run(api,ROOT,self.creds(),journal,templates=True);self.assertEqual(sum(len(r) for r in api.rows.values()),4)
    def test_existing_schema_conflict_fails_without_delete(self):
        api=MockAPI();table=json.loads((ROOT/'manifest.json').read_text())['tables'][0];api.tables['conflict']={'id':'conflict','name':table['name'],'columns':[]};api.rows['conflict']=[]
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'schema conflict'):setup.run(api,ROOT,self.creds(),pathlib.Path(d)/'state.json')
        self.assertFalse(any(m=='DELETE' or 'remove' in p for m,p,_ in api.calls))
    def test_missing_credentials_fail_before_writes(self):
        api=MockAPI()
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):setup.run(api,ROOT,{},pathlib.Path(d)/'state.json')
        self.assertEqual(api.calls,[])
    def test_remap_nested_code_and_lists(self):self.assertEqual(setup.remap({'a':['old',"const id='old';"]},{'old':'fresh'}),{'a':['fresh',"const id='fresh';"]})
if __name__=='__main__':unittest.main()
