import importlib.util,json,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('skin_audio',Path(__file__).resolve().parents[1]/'tools/local-extract/skin_audio.py');audio=importlib.util.module_from_spec(spec);spec.loader.exec_module(audio)
class SkinAudio(unittest.TestCase):
 def test_only_requested_audio_is_exported_and_client_bytes_are_unchanged(self):
  with tempfile.TemporaryDirectory()as d:
   root=Path(d)/'client';root.mkdir();bundle=root/'audio.ab';bundle.write_bytes(b'client stays unchanged');banks=Path(d)/'banks.json';banks.write_text(json.dumps([{'banks':[{'sounds':[{'asset':'Audio/Sound_Beta_2/Player/SkinTone'}]}]}]));out=Path(d)/'out'
   def clip(name):return SimpleNamespace(type=SimpleNamespace(name='AudioClip'),path_id=1,read=lambda:SimpleNamespace(m_Name=name,samples={name+'.wav':b'RIFF sample'}))
   unity=SimpleNamespace(load=lambda _:SimpleNamespace(objects=[clip('SkinTone'),clip('OtherTone')]))
   with patch.dict(sys.modules,{'UnityPy':unity,'aklz4':SimpleNamespace()}),patch.object(sys,'argv',['skin_audio.py','--root',str(root),'--out',str(out),'--banks',str(banks)]):audio.main()
   report=json.loads((out/'audio-report.json').read_text());self.assertEqual(report['found'],1);self.assertEqual(len(report['files']),1);self.assertEqual(bundle.read_bytes(),b'client stays unchanged');self.assertFalse((out/'audio/OtherTone.wav').exists())
if __name__=='__main__':unittest.main()
