"""CPU-only startup: apply Torch settings AFTER Pocket's import-time reset."""
import os,json,runpy,sys
from pathlib import Path
def configure_threads():
 import torch
 import pocket_tts.models.tts_model
 intra=int(os.environ.get('POCKET_TTS_TORCH_THREADS','4'))
 inter=int(os.environ.get('POCKET_TTS_INTEROP_THREADS','1'))
 if not 1<=intra<=12 or not 1<=inter<=4: raise ValueError('Invalid Pocket CPU thread budget')
 torch.set_num_threads(intra)
 torch.set_num_interop_threads(inter)
 return {'pid':os.getpid(),'intra_op_threads':torch.get_num_threads(),'inter_op_threads':torch.get_num_interop_threads(),'device':'cpu','omp_threads':os.environ.get('OMP_NUM_THREADS'),'mkl_threads':os.environ.get('MKL_NUM_THREADS')}
if __name__=='__main__':
 runtime=configure_threads()
 Path('/app/logs/cpu-runtime.json').write_text(json.dumps(runtime,indent=2))
 print('Pocket CPU runtime: '+json.dumps(runtime),flush=True)
 sys.path.insert(0,'/app');sys.argv=['/app/server.py']
 runpy.run_path('/app/server.py',run_name='__main__')
