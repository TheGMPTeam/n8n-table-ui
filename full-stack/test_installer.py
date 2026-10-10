import unittest
import installer
class InstallTests(unittest.TestCase):
    def test_cancel_executes_nothing(self):
        calls=[]
        self.assertFalse(installer.deploy(['n8n'],False,calls.append))
        self.assertEqual(calls,[])
    def test_confirmed_only_selected_services(self):
        calls=[]
        self.assertTrue(installer.deploy(['n8n-table-ui','searxng'],True,calls.append))
        self.assertEqual(calls,[['docker','compose','-f','compose.json','build','n8n-table-ui'],['docker','compose','-f','compose.json','up','-d','--no-deps','n8n-table-ui','searxng']])
    def test_exact_six_services(self):
        import json
        self.assertEqual(set(json.loads((installer.ROOT/'compose.json').read_text())['services']),set(installer.SERVICES))
if __name__=='__main__': unittest.main()
