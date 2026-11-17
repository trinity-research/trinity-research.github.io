import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import export_trinity as exporter


class TrinityExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'inputs'
        self.root.mkdir()
        for name in exporter.SOURCE_FILES:
            (self.root / name).write_text('test source\n', encoding='utf-8')
        (self.root / 'integration').mkdir()
        (self.root / 'integration/COMPONENT_README.md').write_text('component readme\n', encoding='utf-8')
        (self.root / 'dist').mkdir()
        (self.root / 'dist/index.html').write_text('<html>test artifact</html>\n', encoding='utf-8')
        self.target = Path(self.temp.name) / 'themenu'
        self.addCleanup(patch.stopall)
        patch.object(exporter, 'ROOT', self.root).start()

    def test_does_not_overwrite_an_unrecognized_directory(self):
        self.target.mkdir()
        sentinel = self.target / 'index.html'
        sentinel.write_text('existing unrelated page', encoding='utf-8')
        with self.assertRaises(ValueError): exporter.export(self.target, run_build=False)
        self.assertEqual(sentinel.read_text(encoding='utf-8'), 'existing unrelated page')

    def test_generated_paths_cannot_enter_source_or_escape_component(self):
        for name in ['../index.html', 'source/README.md', 'source\\README.md', '/outside.html']:
            with self.subTest(name=name), self.assertRaises(ValueError): exporter.safe_child(self.target, name)

    def test_integrity_check_detects_source_and_output_drift(self):
        exporter.export(self.target, run_build=False)
        exporter.check(self.target)
        (self.target / 'index.html').write_text('changed', encoding='utf-8')
        with self.assertRaises(ValueError): exporter.check(self.target)
        exporter.export(self.target, run_build=False)
        (self.root / 'README.md').write_text('new source', encoding='utf-8')
        with self.assertRaises(ValueError): exporter.check(self.target)

    def test_export_prunes_obsolete_artifacts_without_touching_parent_site(self):
        parent_page = self.target.parent / 'index.html'
        parent_page.write_text('Trinity homepage', encoding='utf-8')
        obsolete = self.root / 'dist/old-menu.html'
        obsolete.write_text('old snapshot', encoding='utf-8')
        exporter.export(self.target, run_build=False)
        obsolete.unlink()
        exporter.export(self.target, run_build=False)
        self.assertFalse((self.target / 'old-menu.html').exists())
        self.assertTrue((self.target / 'source/README.md').is_file())
        self.assertEqual(parent_page.read_text(encoding='utf-8'), 'Trinity homepage')


if __name__ == '__main__':
    unittest.main()
