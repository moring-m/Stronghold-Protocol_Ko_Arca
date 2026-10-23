import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fx_writer', Path(__file__).resolve().parents[1] / 'tools/local-extract/fx.py')
fx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fx)


class AtomicWriter(unittest.TestCase):
    def test_identical_target_is_accepted_after_windows_access_denied(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'shared.webp'
            path.write_bytes(b'correct')
            with patch.object(fx.os, 'replace', side_effect=PermissionError('WinError 5')):
                fx.write_atomic(path, b'correct')
            self.assertEqual(path.read_bytes(), b'correct')
            self.assertEqual(list(Path(folder).glob('*.tmp')), [])

    def test_retry_and_real_failure_preserve_existing_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'shared.webp'
            path.write_bytes(b'original')
            replace = fx.os.replace
            calls = []
            def transient(source, target):
                calls.append(str(source))
                if len(calls) == 1:
                    raise PermissionError('temporary lock')
                return replace(source, target)
            with patch.object(fx.os, 'replace', side_effect=transient), patch.object(fx.time, 'sleep'):
                fx.write_atomic(path, b'updated')
            self.assertEqual(path.read_bytes(), b'updated')
            with patch.object(fx.os, 'replace', side_effect=PermissionError('denied')), patch.object(fx.time, 'sleep'):
                with self.assertRaises(PermissionError):
                    fx.write_atomic(path, b'different')
            self.assertEqual(path.read_bytes(), b'updated')
            self.assertEqual(list(Path(folder).glob('*.tmp')), [])


if __name__ == '__main__':
    unittest.main()
