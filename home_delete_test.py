import unittest, tempfile, pathlib, os
from home_delete import OutputRoot, resolve_output

class OutputTests(unittest.TestCase):
    def test_encoded_nested_output(self):
        self.assertEqual(resolve_output('http://10.0.0.157:8188/view?filename=a%20b.png&subfolder=video%2Fnested&type=output', {'10.0.0.157:8188'}), ('video','nested','a b.png'))
    def test_reject_unsafe_urls(self):
        for query in ['filename=../x&type=output','filename=x&type=input','filename=x&type=temp','filename=x&filename=y&type=output','filename=x&subfolder=%2e%2e&type=output','filename=x&type=output&unknown=x','filename=x']:
            with self.subTest(query=query), self.assertRaises(ValueError):
                resolve_output('http://10.0.0.157:8188/view?'+query, {'10.0.0.157:8188'})
    def test_verified_default_output(self):
        self.assertEqual(resolve_output('http://fixture:8188/view?filename=x.png', {'fixture:8188'}, verified_default_output=True), ('x.png',))
    def test_open_directory_relocation_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)/'output';root.mkdir();(root/'sub').mkdir();(root/'sub'/'x.png').write_text('fixture')
            output=OutputRoot(str(root));fd=output.parent(('sub','x.png'))
            try:
                (root/'sub').rename(pathlib.Path(tmp)/'outside')
                with self.assertRaises(ValueError):output.verify_ancestry(fd,('sub','x.png'))
                self.assertTrue((pathlib.Path(tmp)/'outside'/'x.png').exists())
            finally:os.close(fd)
    def test_root_replacement_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)/'output'; root.mkdir(); (root/'x.png').write_text('fixture')
            output=OutputRoot(str(root)); root.rename(pathlib.Path(tmp)/'moved'); root.mkdir(); (root/'x.png').write_text('replacement')
            with self.assertRaises(ValueError):output.inspect(('x.png',))
    def test_regular_file_only_and_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp); (root/'x.png').write_text('fixture'); (root/'dir').mkdir(); (root/'link').symlink_to(root/'x.png'); (root/'escape').symlink_to(root/'dir',target_is_directory=True)
            output=OutputRoot(tmp)
            for parts in [('dir',),('link',),('escape','x')]:
                with self.subTest(parts=parts), self.assertRaises((ValueError,OSError)): output.inspect(parts)
            identity=output.inspect(('x.png',)); output.remove(('x.png',),identity)
            self.assertFalse((root/'x.png').exists())
    def test_hardlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);(root/'x.png').write_bytes(b'fixture');os.link(root/'x.png',root/'y.png')
            with self.assertRaises(ValueError):OutputRoot(tmp).inspect(('x.png',))
            self.assertTrue((root/'x.png').exists())
    def test_replacement_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=pathlib.Path(tmp)/'x';p.write_text('fixture');output=OutputRoot(tmp);identity=output.inspect(('x',));p.unlink();p.mkdir()
            with self.assertRaises((ValueError,OSError)):output.remove(('x',),identity)

if __name__=='__main__':unittest.main()
