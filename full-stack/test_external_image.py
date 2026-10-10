"""Offline FFmpeg prerequisite regressions; no boot/downloads."""
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import check_setup

class ExternalImageTests(unittest.TestCase):
    def test_missing_image_fails_before_docker(self):
        with patch.object(check_setup.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'Set FFMPEG_IMAGE'):
                check_setup.check_operator_image('')
            run.assert_not_called()
    def test_unavailable_image_has_operator_instruction(self):
        with patch.object(check_setup.subprocess, 'run', return_value=SimpleNamespace(returncode=1)):
            with self.assertRaisesRegex(ValueError, 'authorized external source'):
                check_setup.check_operator_image('operator-image:tag')
    def test_existing_image_is_inspected_not_pulled(self):
        with patch.object(check_setup.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as run:
            check_setup.check_operator_image('operator-image:tag')
            self.assertEqual(run.call_args.args[0], ['docker', 'image', 'inspect', 'operator-image:tag'])

if __name__ == '__main__': unittest.main()
