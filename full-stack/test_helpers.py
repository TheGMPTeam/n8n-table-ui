"""Offline startup/helper verification; no Torch model load, GPU or services."""
import importlib.util,json,pathlib,sys,tempfile,types,unittest,unittest.mock,shutil
ROOT=pathlib.Path(__file__).resolve().parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);assert spec and spec.loader
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
class Helpers(unittest.TestCase):
    def test_cpu_thread_settings_after_import_and_invalid_budget(self):
        events=[];state={'intra':1,'inter':1};torch=types.ModuleType('torch')
        torch.set_num_threads=lambda n:(events.append('intra'),state.update(intra=n))
        torch.set_num_interop_threads=lambda n:(events.append('inter'),state.update(inter=n))
        torch.get_num_threads=lambda:state['intra'];torch.get_num_interop_threads=lambda:state['inter']
        pocket=types.ModuleType('pocket_tts');models=types.ModuleType('pocket_tts.models');model=types.ModuleType('pocket_tts.models.tts_model');pocket.models=models;models.tts_model=model
        with unittest.mock.patch.dict(sys.modules,{'torch':torch,'pocket_tts':pocket,'pocket_tts.models':models,'pocket_tts.models.tts_model':model}),unittest.mock.patch.dict('os.environ',{'POCKET_TTS_TORCH_THREADS':'4','POCKET_TTS_INTEROP_THREADS':'1','OMP_NUM_THREADS':'4','MKL_NUM_THREADS':'4'}):
            helper=load('cpu_startup',ROOT/'pockettts/cpu_startup.py');result=helper.configure_threads();self.assertEqual(result['device'],'cpu');self.assertEqual(result['intra_op_threads'],4);self.assertEqual(result['inter_op_threads'],1);self.assertEqual(events,['intra','inter'])
            with unittest.mock.patch.dict('os.environ',{'POCKET_TTS_TORCH_THREADS':'0'}):
                with self.assertRaises(ValueError):helper.configure_threads()
    def test_prepare_is_private_idempotent_and_preserves_existing_data(self):
        helper=load('prepare',ROOT/'prepare_local.py')
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            for name in ['compose.json','.env.example']:shutil.copyfile(ROOT/name,root/name)
            result=helper.prepare(root);self.assertFalse(result['servicesStarted']);self.assertFalse(result['tokenReady'])
            env=(root/'.env').read_text();self.assertNotIn('replace-with-random-64-hex',env);self.assertEqual((root/'.env').stat().st_mode&0o777,0o600)
            data=root/'data/n8n-table-ui/.data';settings=data/'ollama-enhancement-settings.json';settings.write_text(json.dumps({'defaultEnhancementModel':'operator-choice'}));helper.prepare(root);self.assertEqual(json.loads(settings.read_text())['defaultEnhancementModel'],'operator-choice');self.assertEqual((root/'.env').read_text(),env)
if __name__=='__main__':unittest.main()
