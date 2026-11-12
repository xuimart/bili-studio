"""Run with the local dubbing Python environment; no model/GPU is needed."""
import ast,pathlib,unittest,numpy as np
source=pathlib.Path(__file__).resolve().parents[1]/'dubbing-worker.py'
tree=ast.parse(source.read_text(encoding='utf8'))
definitions=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='clean_pauses'],type_ignores=[])
scope={'np':np};exec(compile(definitions,str(source),'exec'),scope);clean=scope['clean_pauses']

class PauseSafety(unittest.TestCase):
    sr=24000
    def tone(self,seconds,amplitude=.08):return (np.sin(np.arange(round(self.sr*seconds))*2*np.pi*220/self.sr)*amplitude).astype(np.float32)
    def quiet(self,seconds):return np.zeros(round(self.sr*seconds),dtype=np.float32)
    def test_trims_only_quiet_edges(self):
        voice=self.tone(1);audio=np.concatenate([self.quiet(2),voice,self.quiet(3)]);out,report=clean(audio,self.sr)
        self.assertGreater(report['edgesSeconds'],4.7);self.assertAlmostEqual(len(out)/self.sr,1.14,places=2);np.testing.assert_array_equal(out[round(.06*self.sr):round(1.06*self.sr)],voice)
    def test_long_internal_gap_shortened_without_removing_speech(self):
        voice=self.tone(1);out,report=clean(np.concatenate([voice,self.quiet(2),voice]),self.sr)
        self.assertEqual(report['internalGaps'],1);self.assertAlmostEqual(report['internalSeconds'],1.6,places=2);np.testing.assert_array_equal(out[:len(voice)],voice);np.testing.assert_array_equal(out[-len(voice):],voice)
    def test_short_breath_is_preserved(self):
        audio=np.concatenate([self.tone(1),self.quiet(.3),self.tone(1)]);out,report=clean(audio,self.sr)
        self.assertEqual(report['internalGaps'],0);np.testing.assert_array_equal(out,audio)
    def test_quiet_speech_is_preserved(self):
        audio=np.concatenate([self.tone(1),self.tone(1,.001),self.tone(1)]);out,report=clean(audio,self.sr)
        self.assertEqual(report['internalGaps'],0);np.testing.assert_array_equal(out,audio)
    def test_silence_is_rejected(self):
        with self.assertRaises(RuntimeError):clean(self.quiet(3),self.sr)

if __name__=='__main__':unittest.main()
