import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('projectile_fx', Path(__file__).resolve().parents[1] / 'tools/local-extract/fx.py')
fx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fx)


class ProjectileParser(unittest.TestCase):
    def test_flight_lifecycle_chains_and_existing_records(self):
        class Environment:
            def __init__(self):
                self.records = {
                    'a': {'m_Name': 'a', 'm_Component': [{'component': {'id': 'flight'}}, {'component': {'id': 'move'}}, {'component': {'id': 'rope'}}]},
                    'b': {'m_Name': 'b', 'm_Component': [{'component': {'id': 'child'}}]},
                    'flight': {'_mainEffect': 'FLY', '_lifeTime': 3.5, '_effectsWhenHit': ['HIT'], '_effectsWhenStop': ['END'], '_projectileKey': 'b'},
                    'move': {'_speed': 6}, 'rope': {'_mainEffect': 'LINK'},
                    'child': {'_mainEffect': 'CHILD', '_lifeTime': 1},
                }
                self.classes = {'flight': 'SimpleProjectile', 'move': 'StraightMovement', 'rope': next(iter(fx.LINK_BEHAVIOURS)), 'child': 'SimpleProjectile'}
            def tt(self, obj):
                return self.records[obj.id]
            def resolve(self, sf, ptr):
                if 'id' not in ptr:
                    return None, None
                return sf, SimpleNamespace(id=ptr['id'], assets_file=sf, type=SimpleNamespace(name='MonoBehaviour'))
            def script(self, obj):
                return '', self.classes[obj.id]
        env = Environment()
        roots = {key: SimpleNamespace(id=key, assets_file='test') for key in ['a', 'b']}
        result = fx.projectile_entries(env, roots, {'fly': 1, 'hit': 1, 'end': 1, 'link': 1, 'child': 1}, ['A'])
        self.assertEqual(result['a']['main'], 'fly')
        self.assertEqual(result['a']['lifeTime'], 3.5)
        self.assertEqual(result['a']['movement'], {'class': 'StraightMovement', 'speed': 6})
        self.assertEqual(result['a']['onHit'], ['hit'])
        self.assertEqual(result['a']['onStop'], ['end'])
        self.assertEqual(result['a']['link'], 'link')
        self.assertEqual(result['a']['projectiles'], ['b'])
        self.assertEqual(result['b']['main'], 'child')
        existing = {'a': {'original': True}}
        self.assertIs(fx.projectile_entries(env, roots, {}, ['a'], out=existing), existing)
        self.assertEqual(existing['a'], {'original': True})


if __name__ == '__main__':
    unittest.main()
