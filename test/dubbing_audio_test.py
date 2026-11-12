"""Run with the local dubbing Python environment; no model/GPU is needed."""
import ast,pathlib,unittest,numpy as np
source=pathlib.Path(__file__).resolve().parents[1]/'dubbing-worker.py'
tree=ast.parse(source.read_text(encoding='utf8'))
definitions=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['clean_pauses','fit_bounds','regroup']],type_ignores=[])
scope={'np':np};exec(compile(definitions,str(source),'exec'),scope);clean=scope['clean_pauses']
fit_bounds=scope['fit_bounds'];regroup=scope['regroup']

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
    def test_actual_reported_short_slot_uses_available_gap(self):
        start,end=fit_bounds({'start':46.7,'end':47.4},45.2,49.077,720,1.28)
        self.assertEqual(start,46.7);self.assertGreaterEqual(end-start,1.28);self.assertLessEqual(end,48.4)
    def test_borrowing_never_overlaps_previous_or_moves_more_than_one_second(self):
        start,end=fit_bounds({'start':10,'end':11},9.4,11,20,2)
        self.assertGreaterEqual(start,9.43);self.assertGreaterEqual(start,9);self.assertLessEqual(end,11)
    def test_first_speech_does_not_start_before_its_anchor(self):
        start,end=fit_bounds({'start':7.6,'end':10},None,10,20,4)
        self.assertEqual(start,7.6);self.assertEqual(end,10)
    def test_regroup_preserves_words_and_outer_anchors(self):
        segments=[{'start':1,'end':1.7,'text':'Usando um'},{'start':3,'end':5,'text':'retângulo como referência.'}]
        self.assertEqual(regroup(segments,0),0);self.assertEqual(segments,[{'start':1,'end':5,'text':'Usando um retângulo como referência.'}])
    def test_regroup_can_rewind_but_respects_long_pauses(self):
        segments=[{'start':1,'end':3,'text':'Vamos observar'},{'start':3,'end':3.7,'text':'isso.'}]
        self.assertEqual(regroup(segments,1),0);self.assertEqual(len(segments),1)
        self.assertIsNone(regroup([{'start':1,'end':3,'text':'Primeiro.'},{'start':9,'end':10,'text':'Depois.'}],1))

if __name__=='__main__':unittest.main()
